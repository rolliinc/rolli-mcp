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
    "list_keyword_searches",
    "List all keyword searches. Returns a paginated list filtered by status.",
    {
      show: z
        .enum(["all", "started", "finished", "pending", "failed"])
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
        const data = await apiGet(`/iq/keyword_search${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "keyword_search",
    "Create a keyword/hashtag search across social media platforms (X, Reddit, Bluesky, YouTube, LinkedIn, Facebook, Instagram, Weibo). Polls until the search is complete and returns the full results.",
    {
      query: z.string().min(1).max(500).describe("Search query (keyword or hashtag)"),
      platforms: z
        .array(z.enum(["twitter", "reddit", "bluesky", "youtube", "linkedin", "facebook", "instagram", "weibo"]))
        .optional()
        .describe("Platforms to search (default: twitter, reddit, bluesky, youtube)"),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().describe("Start date (YYYY-MM-DD)"),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD").optional().describe("End date (YYYY-MM-DD)"),
      max_post: z.number().int().positive().max(10000).optional().describe("Maximum number of posts to retrieve (default: 100)"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { query: params.query };
        if (params.platforms) body.platforms = params.platforms;
        if (params.start_date) body.start_date = params.start_date;
        if (params.end_date) body.end_date = params.end_date;
        if (params.max_post !== undefined) body.max_post = params.max_post;

        const createResult = await apiPost("/iq/keyword_search", body) as Record<string, unknown>;
        const searchId = (createResult.keyword_search as Record<string, unknown>)?.id ?? createResult.id;
        if (searchId == null) {
          return { content: [{ type: "text", text: JSON.stringify(createResult, null, 2) }] };
        }

        const startTime = Date.now();
        while (Date.now() - startTime < MAX_POLL_MS) {
          await sleep(POLL_INTERVAL_MS);
          const data = await apiGet(`/iq/keyword_search/${searchId}`) as Record<string, unknown>;
          const status = (data.keyword_search as Record<string, unknown>)?.status ?? data.status;
          if (status === "finished" || status === "failed") {
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
          }
        }

        return { content: [{ type: "text", text: `Search ${searchId} timed out after 10 minutes. Use get_keyword_search to check status.` }], isError: true };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_keyword_search",
    "Get results for a keyword search by ID. Returns search status, analytics summary, and posts.",
    {
      id: z.number().int().positive().describe("Keyword search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/iq/keyword_search/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
