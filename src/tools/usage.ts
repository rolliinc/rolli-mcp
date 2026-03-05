import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api.js";

export function register(server: McpServer) {
  server.tool(
    "get_usage",
    "Get API usage data. Returns search counts and per-user breakdowns. Optionally filter by month.",
    {
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM")
        .optional()
        .describe("Month to query (YYYY-MM format). Omit to get the last 12 months."),
    },
    async (params) => {
      try {
        const query = params.month ? `?month=${params.month}` : "";
        const data = await apiGet(`/usage${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
