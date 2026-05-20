import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { agentGet, agentPost, agentPatch, agentDelete } from "../api.js";

const POLL_INTERVAL_MS = Number(process.env.ROLLI_POLL_INTERVAL_MS) || 5_000;
const MAX_POLL_MS = Number(process.env.ROLLI_MAX_POLL_MS) || 10 * 60 * 1_000;

const RUN_STATUSES = ["pending", "running", "completed", "failed", "waiting"] as const;
const PLATFORMS = ["twitter", "reddit", "bluesky", "youtube", "threads", "facebook", "weibo"] as const;
const MODES = ["trend_briefing", "monitoring", "competitive_intel"] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function register(server: McpServer) {
  server.tool(
    "list_agent_runs",
    "List Rolli Agent runs (AI-driven social intelligence investigations). Returns a paginated summary list. Discarded runs are excluded.",
    {
      status: z.enum(RUN_STATUSES).optional().describe("Filter by status"),
      user_id: z.string().optional().describe("Filter to a specific Rolli user"),
      limit: z.number().int().positive().max(100).optional().describe("Page size (default: 50, max: 100)"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset (default: 0)"),
    },
    async (params) => {
      try {
        const queryParts: string[] = [];
        if (params.status) queryParts.push(`status=${params.status}`);
        if (params.user_id) queryParts.push(`user_id=${encodeURIComponent(params.user_id)}`);
        if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
        if (params.offset !== undefined) queryParts.push(`offset=${params.offset}`);
        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        const data = await agentGet(`/api/v1/runs${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "start_agent_run",
    "Start a Rolli Agent investigation. Submit a plain-English question; the agent plans a search strategy, queries Rolli IQ across platforms, analyzes posts, and produces a markdown intelligence report with signals, evidence links, and a confidence rating. Polls until the run is complete and returns the full results.",
    {
      question: z.string().min(1).describe("Plain-English question (e.g., \"What is being said about Tesla battery recalls this week?\")"),
      available_credits: z.number().int().min(1).max(4).optional().describe("Reasoning effort: 1=low, 2=medium (default), 3=high, 4=max. Higher values let the agent perform more searches at higher cost."),
      mode: z.enum(MODES).optional().describe("Investigation mode (default: trend_briefing)"),
      time_window: z.string().optional().describe("Time window to search (default: 7d). Examples: 24h, 7d, 30d"),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe("Platforms to search"),
      max_post: z.number().int().positive().optional().describe("Maximum posts per platform (default: 50)"),
      parent_run_id: z.string().uuid().optional().describe("UUID of a parent run (for follow-ups)"),
      metadata: z.record(z.unknown()).optional().describe("Arbitrary JSON object stored on the run for your own tracking"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = { question: params.question };
        if (params.available_credits !== undefined) body.available_credits = params.available_credits;
        if (params.mode) body.mode = params.mode;
        if (params.time_window) body.time_window = params.time_window;
        if (params.platforms) body.platforms = params.platforms;
        if (params.max_post !== undefined) body.max_post = params.max_post;
        if (params.parent_run_id) body.parent_run_id = params.parent_run_id;
        if (params.metadata) body.metadata = params.metadata;

        const createResult = await agentPost("/api/v1/runs", body) as Record<string, unknown>;
        const runId = createResult.id;
        if (runId == null) {
          return { content: [{ type: "text", text: JSON.stringify(createResult, null, 2) }] };
        }

        const startTime = Date.now();
        while (Date.now() - startTime < MAX_POLL_MS) {
          await sleep(POLL_INTERVAL_MS);
          const data = await agentGet(`/api/v1/runs/${runId}`) as Record<string, unknown>;
          const status = data.status;
          if (status === "completed" || status === "failed") {
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
          }
        }

        return { content: [{ type: "text", text: `Agent run ${runId} timed out after 10 minutes. Use get_agent_run to check status.` }], isError: true };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_agent_run",
    "Get a Rolli Agent run by ID. While running, returns progress (percentage, phase, current tool). Once complete, returns the full markdown report, signals, evidence links, and usage metrics.",
    {
      id: z.string().uuid().describe("Run UUID"),
    },
    async (params) => {
      try {
        const data = await agentGet(`/api/v1/runs/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "cancel_agent_run",
    "Cancel a pending or running Rolli Agent run. Marks the run as failed.",
    {
      id: z.string().uuid().describe("Run UUID"),
    },
    async (params) => {
      try {
        const data = await agentPost(`/api/v1/runs/${params.id}/cancel`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "rerun_agent_run",
    "Rerun a failed, waiting, or stuck Rolli Agent run. Resets the run to pending and re-enqueues it. Running runs are force-cancelled first. Returns 422 if the run is already completed.",
    {
      id: z.string().uuid().describe("Run UUID"),
    },
    async (params) => {
      try {
        const data = await agentPost(`/api/v1/runs/${params.id}/rerun`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "update_agent_run",
    "Update a Rolli Agent run's metadata (rename or pin). At least one of pinned or label is required.",
    {
      id: z.string().uuid().describe("Run UUID"),
      pinned: z.boolean().optional().describe("Pin or unpin the run"),
      label: z.string().optional().describe("Custom label (e.g., \"Weekly trend report\")"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {};
        if (params.pinned !== undefined) body.pinned = params.pinned;
        if (params.label !== undefined) body.label = params.label;
        const data = await agentPatch(`/api/v1/runs/${params.id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );

  server.tool(
    "delete_agent_run",
    "Soft-delete a Rolli Agent run. The record remains in the database for audit purposes but is hidden from listings. Only works on completed or failed runs — cancel the run first if it is still running.",
    {
      id: z.string().uuid().describe("Run UUID"),
    },
    async (params) => {
      try {
        const data = await agentDelete(`/api/v1/runs/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: String(e) }], isError: true };
      }
    }
  );
}
