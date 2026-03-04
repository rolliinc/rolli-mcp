import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiPost, apiGet } from "../api.js";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 10 * 60 * 1_000; // 10 minutes

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      page: z.number().optional().describe("Page number (100 results per page)"),
    },
    async (params) => {
      try {
        const queryParts: string[] = [];
        if (params.show) queryParts.push(`show=${params.show}`);
        if (params.page !== undefined) queryParts.push(`page=${params.page}`);
        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        const data = await apiGet(`/iq/user_search${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "user_search",
    "Create a user profile search on a social media platform. Polls until the search is complete and returns the full results.",
    {
      query: z.string().describe("Username or profile URL to search"),
      platform: z.enum(["twitter", "facebook", "instagram"]).describe("Platform to search"),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD)"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          query: params.query,
          platform: params.platform,
        };
        if (params.start_date) body.start_date = params.start_date;
        if (params.end_date) body.end_date = params.end_date;

        const createResult = await apiPost("/iq/user_search", body) as Record<string, unknown>;
        const searchId = (createResult.user_search as Record<string, unknown>)?.id ?? createResult.id;
        if (searchId == null) {
          return { content: [{ type: "text", text: JSON.stringify(createResult, null, 2) }] };
        }

        const startTime = Date.now();
        while (Date.now() - startTime < MAX_POLL_MS) {
          await sleep(POLL_INTERVAL_MS);
          const data = await apiGet(`/iq/user_search/${searchId}`) as Record<string, unknown>;
          const status = (data.user_search as Record<string, unknown>)?.status ?? data.status;
          if (status === "finished" || status === "failed") {
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
          }
        }

        return { content: [{ type: "text", text: `Search ${searchId} timed out after 10 minutes. Use get_user_search to check status.` }], isError: true };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_user_search",
    "Get results for a user search by ID. Returns profile info, metrics, and content analysis.",
    {
      id: z.number().describe("User search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/iq/user_search/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
