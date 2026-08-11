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

const EXPERT_TERMINAL_STATUSES = ["completed", "failed"] as const;
const EXPERT_SETTLE_STATUSES = ["completed"] as const;

export function register(server: McpServer) {
  server.tool(
    "list_expert_searches",
    "List all expert searches. Returns a paginated list filtered by status.",
    {
      show: z
        .enum(["all", "running", "completed", "failed"])
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
        const data = await apiGet(`/search${qs}`);
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
    "expert_search",
    "Find experts matching a natural-language query using Rolli's AI-driven recommendation engine. Polls until the search is complete and returns the full list of recommended experts (name, professional title, location, contact info, expertise keywords, and an AI-generated summary explaining why each expert matches). A status of results_pending means the search succeeded but results are still being written; fetch them with get_expert_search.",
    {
      query: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "Natural-language description of the topic, expertise area, or expert profile to find (e.g. \"AI ethics researchers\", \"climate scientists who can speak on tipping points\")",
        ),
    },
    async (params) => {
      try {
        const createResult = (await apiPost("/search", {
          query: params.query,
        })) as Record<string, unknown>;
        const searchId =
          createResult.id ??
          (createResult.search as Record<string, unknown>)?.id;
        if (searchId == null) {
          return {
            content: [
              { type: "text", text: JSON.stringify(createResult, null, 2) },
            ],
          };
        }

        const outcome = await pollUntilDone({
          api,
          path: `/search/${searchId}`,
          terminalStatuses: EXPERT_TERMINAL_STATUSES,
          settle: {
            resultsKey: "expert_results",
            statuses: EXPERT_SETTLE_STATUSES,
          },
        });
        if (outcome.kind === "timeout") {
          return {
            content: [
              {
                type: "text",
                text: `Expert search ${searchId} timed out after 10 minutes. Use get_expert_search to check status.`,
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
                  resultsPendingPayload(searchId, "get_expert_search"),
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
    "get_expert_search",
    "Get results for an expert search by ID. Returns search status and, once complete, the array of recommended experts with their profiles and AI-generated match summaries. results_pending: true means the search succeeded but the backend is still writing results; retry in a few seconds.",
    {
      id: z.number().int().positive().describe("Expert search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/search/${params.id}`);
        const annotated = annotateResultsPending(data, {
          resultsKey: "expert_results",
          retryTool: "get_expert_search",
          statuses: EXPERT_SETTLE_STATUSES,
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
