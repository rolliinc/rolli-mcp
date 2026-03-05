import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api.js";

export function register(server: McpServer) {
  server.tool(
    "get_topic_tree",
    "Get the conversation topic tree for a keyword search. Shows how topics and subtopics are distributed across the search results.",
    {
      search_id: z.number().int().positive().describe("Keyword search ID"),
      platform: z
        .enum(["twitter", "bluesky", "youtube"])
        .optional()
        .describe("Filter by platform"),
    },
    async (params) => {
      try {
        const query = params.platform ? `?platform=${params.platform}` : "";
        const data = await apiGet(`/iq/keyword_search/${params.search_id}/topic_tree${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
