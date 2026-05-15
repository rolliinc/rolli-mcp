import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiGet } from "../api.js";

const POLL_INTERVAL_MS = Number(process.env.ROLLI_POLL_INTERVAL_MS) || 5_000;
const MAX_POLL_MS = Number(process.env.ROLLI_MAX_POLL_MS) || 10 * 60 * 1_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function register(server: McpServer) {
  server.tool(
    "list_expert_searches",
    "List all expert searches. Returns a paginated list filtered by status.",
    {
      show: z
        .enum(["all", "running", "completed", "failed"])
        .optional()
        .describe("Filter by status (default: all)"),
      page: z.number().int().positive().optional().describe("Page number (100 results per page)"),
    },
    async (params) => {
      try {
        const queryParts: string[] = [];
        if (params.show) queryParts.push(`show=${params.show}`);
        if (params.page !== undefined) queryParts.push(`page=${params.page}`);
        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        const data = await apiGet(`/search${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "expert_search",
    "Find experts matching a natural-language query using Rolli's AI-driven recommendation engine. Polls until the search is complete and returns the full list of recommended experts (name, professional title, location, contact info, expertise keywords, and an AI-generated summary explaining why each expert matches).",
    {
      query: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "Natural-language description of the topic, expertise area, or expert profile to find (e.g. \"AI ethics researchers\", \"climate scientists who can speak on tipping points\")"
        ),
    },
    async (params) => {
      try {
        const createResult = await apiPost("/search", { query: params.query }) as Record<string, unknown>;
        const searchId = createResult.id ?? (createResult.search as Record<string, unknown>)?.id;
        if (searchId == null) {
          return { content: [{ type: "text", text: JSON.stringify(createResult, null, 2) }] };
        }

        const startTime = Date.now();
        while (Date.now() - startTime < MAX_POLL_MS) {
          await sleep(POLL_INTERVAL_MS);
          const data = await apiGet(`/search/${searchId}`) as Record<string, unknown>;
          const status = (data.search as Record<string, unknown>)?.status ?? data.status;
          if (status === "completed" || status === "failed") {
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
          }
        }

        return { content: [{ type: "text", text: `Expert search ${searchId} timed out after 10 minutes. Use get_expert_search to check status.` }], isError: true };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_expert_search",
    "Get results for an expert search by ID. Returns search status and, once complete, the array of recommended experts with their profiles and AI-generated match summaries.",
    {
      id: z.number().int().positive().describe("Expert search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/search/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
