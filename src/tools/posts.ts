import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api.js";

export function register(server: McpServer) {
  server.tool(
    "get_keyword_search_posts",
    "Get raw posts from a keyword search. Returns the actual social media posts matching the search query.",
    {
      search_id: z.number().describe("Keyword search ID"),
      platform: z
        .enum(["all", "twitter", "reddit", "bluesky", "youtube", "instagram", "facebook", "weibo", "linkedin"])
        .optional()
        .describe("Filter by platform (default: all)"),
    },
    async (params) => {
      try {
        const query = params.platform ? `?platform=${params.platform}` : "";
        const data = await apiGet(`/iq/keyword_search/${params.search_id}/posts_data${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_user_search_posts",
    "Get raw posts from a user search. Returns the actual social media posts from the searched user profile.",
    {
      search_id: z.number().describe("User search ID"),
    },
    async (params) => {
      try {
        const data = await apiGet(`/iq/user_search/${params.search_id}/posts_data`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
