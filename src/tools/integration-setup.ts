import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet, apiPut } from "../api.js";

export function register(server: McpServer) {
  server.tool(
    "get_integration_setup",
    "Get the current integration settings (webhook return URL and integration name).",
    {},
    async () => {
      try {
        const data = await apiGet("/setup");
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "update_integration_setup",
    "Update integration configuration. Set the webhook URL that receives notifications when a search completes.",
    {
      return_url: z.string().url("Must be a valid URL").max(2048).describe("URL that will receive webhook notifications when a search completes"),
    },
    async (params) => {
      try {
        const data = await apiPut("/setup", { return_url: params.return_url });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
