import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiGet } from "../api.js";
import { errorToText, mergeUsageAndCredits } from "./_shared.js";

export function register(server: McpServer) {
  server.tool(
    "get_usage",
    "Get API usage data. Returns search counts, per-user breakdowns, and the current IQ credit balance (credits.credits_remaining, credits.credits_limit, credits.period_reset_date — the latter two are null for one-time credit grants). Optionally filter by month.",
    {
      month: z
        .string()
        .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM")
        .optional()
        .describe(
          "Month to query (YYYY-MM format). Omit to get the last 12 months.",
        ),
    },
    async (params) => {
      try {
        const query = new URLSearchParams();
        if (params.month) query.set("month", params.month);
        const qs = query.toString() ? `?${query}` : "";
        const [usageResult, creditsResult] = await Promise.allSettled([
          apiGet(`/usage${qs}`),
          apiGet("/iq/credits"),
        ]);
        if (usageResult.status === "rejected") {
          throw usageResult.reason;
        }
        const data = mergeUsageAndCredits(usageResult.value, creditsResult);
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
}
