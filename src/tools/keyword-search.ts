import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiGet } from "../api.js";
import {
  annotateResultsPending,
  errorToText,
  pollUntilDone,
  resultsPendingPayload,
  serializeCapped,
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

  server.tool(
    "keyword_search",
    "Create a keyword/hashtag search across social media platforms (X, Reddit, YouTube, Facebook, Instagram, Threads, Bluesky, and more). Polls until the search is complete and returns the full results. Oversized responses are truncated (truncated: true, largest post arrays shortened) — retrieve complete post data with get_keyword_search_posts. A status of results_pending means the search succeeded but results are still being written; fetch them with get_keyword_search.",
    {
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
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
        .optional()
        .describe("Start date (YYYY-MM-DD)"),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
        .optional()
        .describe("End date (YYYY-MM-DD)"),
      max_post: z
        .number()
        .int()
        .positive()
        .max(10000)
        .optional()
        .describe("Maximum number of posts to retrieve (default: 100)"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { query: params.query };
        if (params.platforms) body.platforms = params.platforms;
        if (params.start_date) body.start_date = params.start_date;
        if (params.end_date) body.end_date = params.end_date;
        if (params.max_post !== undefined) body.max_post = params.max_post;

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

  server.tool(
    "get_keyword_search",
    "Get results for a keyword search by ID. Returns search status, analytics summary, and posts. Oversized responses are truncated (truncated: true) — retrieve complete post data with get_keyword_search_posts. results_pending: true means the search succeeded but the backend is still writing results; retry in a few seconds.",
    {
      id: z.number().int().positive().describe("Keyword search ID"),
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
