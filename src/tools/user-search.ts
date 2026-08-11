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

// The backend attaches the `results` field only for twitter user searches
// (facebook/instagram searches legitimately finish without it), so the
// results-settling logic must only engage for twitter.
function isTwitterSearch(data: unknown): boolean {
  if (data === null || typeof data !== "object") return false;
  return (data as Record<string, unknown>).platform === "twitter";
}

export function register(server: McpServer) {
  server.tool(
    "list_user_searches",
    "List all user searches. Returns a paginated list filtered by status.",
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
        const data = await apiGet(`/iq/user_search${qs}`);
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
    "user_search",
    "Create a user profile search on a social media platform. Polls until the search is complete and returns the full results. Oversized responses are truncated (truncated: true) — retrieve complete post data with get_user_search_posts. A status of results_pending means the search succeeded but results are still being written; fetch them with get_user_search.",
    {
      query: z
        .string()
        .min(1)
        .max(500)
        .describe("Username or profile URL to search"),
      platform: z
        .enum(["twitter", "facebook", "instagram"])
        .describe("Platform to search"),
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
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          query: params.query,
          platform: params.platform,
        };
        if (params.start_date) body.start_date = params.start_date;
        if (params.end_date) body.end_date = params.end_date;

        const createResult = (await apiPost(
          "/iq/user_search",
          body,
        )) as Record<string, unknown>;
        const searchId =
          (createResult.user_search as Record<string, unknown>)?.id ??
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
          path: `/iq/user_search/${searchId}`,
          recordKey: "user_search",
          ...(params.platform === "twitter"
            ? { settle: { resultsKey: "results" } }
            : {}),
        });
        if (outcome.kind === "timeout") {
          return {
            content: [
              {
                type: "text",
                text: `Search ${searchId} timed out after 10 minutes. Use get_user_search to check status.`,
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
                  resultsPendingPayload(searchId, "get_user_search"),
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
    "get_user_search",
    "Get results for a user search by ID. Returns profile info, metrics, and content analysis. Oversized responses are truncated (truncated: true) — retrieve complete post data with get_user_search_posts. results_pending: true means the search succeeded but the backend is still writing results; retry in a few seconds.",
    {
      id: z.number().int().positive().describe("User search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/iq/user_search/${params.id}`);
        const annotated = isTwitterSearch(data)
          ? annotateResultsPending(data, {
              resultsKey: "results",
              retryTool: "get_user_search",
              recordKey: "user_search",
            })
          : data;
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
