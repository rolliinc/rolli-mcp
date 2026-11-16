import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiGet } from "../api.js";
import {
  annotateResultsPending,
  errorToText,
  pollUntilDone,
  resultsPendingPayload,
  serializeCapped,
  LARGE_RESULT_META,
} from "./_shared.js";

const api = { get: apiGet };

// Keep in sync with rolli-agent-new's rolliq_submit_keyword_search prompt —
// the backend token-OR-matches plain multi-word queries, so callers must be
// taught the boolean syntax or compound queries return noise.
const QUERY_DESCRIPTION =
  "Search query. Expects KEYWORDS, not prose — a plain multi-word query is " +
  "token-OR-matched server-side (each word matched independently), which " +
  "pulls in unrelated posts and pollutes the sentiment/coordination " +
  "analytics. ALWAYS prefer boolean syntax: AND = both required (Tesla AND " +
  'battery); OR = synonyms/variants (EV OR "electric vehicle"); NOT = ' +
  'exclude noise (Tesla NOT "Nikola Tesla"); quotes = exact phrase ' +
  '("Sherrod Brown"); parentheses = grouping. Example: "Sherrod Brown" AND ' +
  '(Husted OR "Ohio Senate") NOT satire. For broad topics, run several ' +
  "focused boolean searches rather than one wide query.";

// A whole UTC day, or on X only a Unix timestamp in seconds for a sub-day
// window. The API refuses a timestamp on any other platform.
const SEARCH_DATE = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  z.number().int().min(100000000).max(9999999999),
]);

export function register(server: McpServer) {
  server.tool(
    "list_keyword_searches",
    "List all keyword searches. Returns a paginated list filtered by status.",
    {
      show: z
        .enum(["all", "started", "finished", "pending", "failed"])
        .optional()
        .describe("Filter by status (default: all)"),
      page: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Page number (100 results per page)"),
    },
    async (params) => {
      try {
        const query = new URLSearchParams();
        if (params.show) query.set("show", params.show);
        if (params.page !== undefined) query.set("page", String(params.page));
        const qs = query.toString() ? `?${query}` : "";
        const data = await apiGet(`/iq/keyword_search${qs}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: errorToText(e) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "keyword_search",
    {
      description:
        "Create a keyword/hashtag search across social media platforms (X, Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more). Polls until the search is complete and returns the full results. Oversized responses are truncated (truncated: true, largest post arrays shortened) — read the complete post list in pages with get_keyword_search_posts (offset, limit, fields=lean, one platform at a time). A status of results_pending means the search succeeded but results are still being written; fetch them with get_keyword_search.",
      inputSchema: {
        query: z.string().min(1).max(500).describe(QUERY_DESCRIPTION),
        platforms: z
          .array(
            z.enum([
              "twitter",
              "reddit",
              "bluesky",
              "youtube",
              "facebook",
              "instagram",
              "threads",
            ]),
          )
          .optional()
          .describe(
            "Platforms to search (default: twitter, reddit, bluesky, youtube)",
          ),
        start_date: SEARCH_DATE.optional().describe(
          'Start of the period: a date (YYYY-MM-DD), read as a whole UTC day. On a search of X only (platforms: ["twitter"]) it can instead be a Unix timestamp in seconds, a number, to search down to the second.',
        ),
        end_date: SEARCH_DATE.optional().describe(
          "End of the period, in the same format as start_date: a date includes that whole day, a Unix timestamp is the exact end of the window. When one of the two is a Unix timestamp the other must be one too, and the search must be of X only.",
        ),
        max_post: z
          .number()
          .int()
          .positive()
          .max(1000)
          .optional()
          .describe(
            'Maximum number of posts to retrieve per platform (default: 100). A search of X only (platforms: ["twitter"]) takes up to 1000; a search that includes any other platform takes up to 100, and a larger number is lowered to 100.',
          ),
        sort_by: z
          .enum(["engagement", "time"])
          .optional()
          .describe(
            'The order X posts are collected in, which decides which posts come back when there are more than max_post. "engagement" returns the most engaged posts of the period: do not add min_faves: to the query with it, the threshold is set for you. "time" returns the most recent posts: add min_faves:N to the query to set your own threshold.',
          ),
        sentiment_target: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe(
            'What each post\'s sentiment is measured towards, for example "data centers". Without it the AI analysis picks a target from the posts. Has no effect with enable_ai: false.',
          ),
        enable_ai: z
          .boolean()
          .optional()
          .describe(
            "Whether Rolli runs its AI analysis on the posts: sentiment, summaries and the topic tree (default: true). Pass false to collect the raw posts only, which is faster; use it when you will analyse the posts yourself. A search made with false has no topic tree.",
          ),
      },
      _meta: LARGE_RESULT_META,
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { query: params.query };
        if (params.platforms) body.platforms = params.platforms;
        if (params.start_date) body.start_date = params.start_date;
        if (params.end_date) body.end_date = params.end_date;
        if (params.max_post !== undefined) body.max_post = params.max_post;
        if (params.enable_ai !== undefined) body.enable_ai = params.enable_ai;
        if (params.sentiment_target)
          body.sentiment_target = params.sentiment_target;
        if (params.sort_by) body.sort_by = params.sort_by;

        const createResult = (await apiPost(
          "/iq/keyword_search",
          body,
        )) as Record<string, unknown>;
        const searchId =
          (createResult.keyword_search as Record<string, unknown>)?.id ??
          createResult.id;
        if (searchId == null) {
          return {
            content: [
              { type: "text", text: JSON.stringify(createResult, null, 2) },
            ],
          };
        }

        const outcome = await pollUntilDone({
          api,
          path: `/iq/keyword_search/${searchId}`,
          recordKey: "keyword_search",
          settle: { resultsKey: "results" },
        });
        if (outcome.kind === "timeout") {
          return {
            content: [
              {
                type: "text",
                text: `Search ${searchId} timed out after 10 minutes. Use get_keyword_search to check status.`,
              },
            ],
            isError: true,
          };
        }
        if (outcome.kind === "results_pending") {
          return {
            content: [
              {
                type: "text",
                text: serializeCapped(
                  resultsPendingPayload(searchId, "get_keyword_search"),
                ),
              },
            ],
          };
        }
        return {
          content: [{ type: "text", text: serializeCapped(outcome.data) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: errorToText(e) }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    "get_keyword_search",
    {
      description:
        "Get results for a keyword search by ID. Returns search status, analytics summary, and posts. Oversized responses are truncated (truncated: true) — read the complete post list in pages with get_keyword_search_posts (offset, limit, fields=lean, one platform at a time). results_pending: true means the search succeeded but the backend is still writing results; retry in a few seconds.",
      inputSchema: {
        id: z.number().int().positive().describe("Keyword search ID"),
      },
      _meta: LARGE_RESULT_META,
    },
    async (params) => {
      try {
        const data = await apiGet(`/iq/keyword_search/${params.id}`);
        const annotated = annotateResultsPending(data, {
          resultsKey: "results",
          retryTool: "get_keyword_search",
          recordKey: "keyword_search",
        });
        return {
          content: [{ type: "text", text: serializeCapped(annotated) }],
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: errorToText(e) }],
          isError: true,
        };
      }
    },
  );
}
