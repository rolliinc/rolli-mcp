import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api.js";
import { errorToText, serializeCapped } from "./_shared.js";

export function register(server: McpServer) {
  server.tool(
    "get_topic_tree",
    "Get the conversation topic tree for a keyword search. Shows how topics and subtopics are distributed across the search results.",
    {
      search_id: z.number().int().positive().describe("Keyword search ID"),
      platform: z
        .enum([
          "twitter",
          "reddit",
          "bluesky",
          "youtube",
          "facebook",
          "instagram",
          "threads",
        ])
        .optional()
        .describe("Filter by platform"),
    },
    async (params) => {
      try {
        const query = new URLSearchParams();
        if (params.platform) query.set("platform", params.platform);
        const qs = query.toString() ? `?${query}` : "";
        const data = await apiGet(
          `/iq/keyword_search/${params.search_id}/topic_tree${qs}`,
        );
        return {
          content: [{ type: "text", text: serializeCapped(data) }],
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
