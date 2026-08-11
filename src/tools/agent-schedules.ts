import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { agentGet, agentPost, agentPatch, agentDelete } from "../api.js";
import { errorToText } from "./_shared.js";

const PLATFORMS = ["twitter", "reddit", "bluesky", "youtube", "threads", "facebook"] as const;
const MODES = ["trend_briefing", "monitoring", "competitive_intel"] as const;
const RECURRENCE_TYPES = ["daily", "weekly", "monthly", "once"] as const;

const RECURRENCE_TIME_REGEX = /^\d{2}:\d{2}$/;

export function register(server: McpServer) {
  server.tool(
    "list_agent_schedules",
    "List Rolli Agent scheduled reports. Schedules execute on a daily/weekly/monthly/once cadence and produce a new agent run each time.",
    {
      limit: z.number().int().positive().max(100).optional().describe("Page size (default: 50, max: 100)"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset (default: 0)"),
    },
    async (params) => {
      try {
        const queryParts: string[] = [];
        if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
        if (params.offset !== undefined) queryParts.push(`offset=${params.offset}`);
        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        const data = await agentGet(`/api/v1/schedules${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "create_agent_schedule",
    "Create a recurring Rolli Agent report that runs on a cron-like cadence (daily, weekly, monthly, or one-time) with optional email and Slack notifications.",
    {
      name: z.string().min(1).describe("User-friendly name"),
      question: z.string().min(1).describe("The recurring question for the agent"),
      recurrence_type: z.enum(RECURRENCE_TYPES).describe("Schedule cadence"),
      recurrence_time: z.string().regex(RECURRENCE_TIME_REGEX, "Must be HH:MM").describe("Time of day in HH:MM format (e.g., \"09:00\")"),
      recurrence_timezone: z.string().min(1).describe("IANA timezone (e.g., \"America/New_York\")"),
      starts_at: z.string().describe("ISO 8601 timestamp when the schedule becomes active"),
      recurrence_day_of_week: z.number().int().min(0).max(6).optional().describe("0–6 for weekly schedules (0 = Sunday)"),
      recurrence_day_of_month: z.number().int().min(1).max(31).optional().describe("1–31 for monthly schedules"),
      ends_at: z.string().optional().describe("ISO 8601 timestamp when the schedule stops"),
      available_credits: z.number().int().min(1).max(4).optional().describe("Reasoning effort for each run: 1=low, 2=medium (default), 3=high, 4=max"),
      mode: z.enum(MODES).optional().describe("Investigation mode (default: trend_briefing)"),
      time_window: z.string().optional().describe("Time window per run (default: 7d)"),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe("Platforms to search"),
      max_post: z.number().int().positive().optional().describe("Posts per platform per run (default: 50)"),
      notify_email: z.string().optional().describe("Email address for run notifications"),
      notify_slack_webhook: z.string().optional().describe("Slack webhook URL"),
      notify_slack_channel_id: z.string().optional().describe("Slack channel ID"),
      slack_bot_token: z.string().optional().describe("Slack bot token"),
      slack_team_id: z.string().optional().describe("Slack workspace ID"),
      slack_team_name: z.string().optional().describe("Slack workspace name"),
    },
    async (params) => {
      try {
        const body: Record<string, unknown> = {
          name: params.name,
          question: params.question,
          recurrence_type: params.recurrence_type,
          recurrence_time: params.recurrence_time,
          recurrence_timezone: params.recurrence_timezone,
          starts_at: params.starts_at,
        };
        if (params.recurrence_day_of_week !== undefined) body.recurrence_day_of_week = params.recurrence_day_of_week;
        if (params.recurrence_day_of_month !== undefined) body.recurrence_day_of_month = params.recurrence_day_of_month;
        if (params.ends_at) body.ends_at = params.ends_at;
        if (params.available_credits !== undefined) body.available_credits = params.available_credits;
        if (params.mode) body.mode = params.mode;
        if (params.time_window) body.time_window = params.time_window;
        if (params.platforms) body.platforms = params.platforms;
        if (params.max_post !== undefined) body.max_post = params.max_post;
        if (params.notify_email) body.notify_email = params.notify_email;
        if (params.notify_slack_webhook) body.notify_slack_webhook = params.notify_slack_webhook;
        if (params.notify_slack_channel_id) body.notify_slack_channel_id = params.notify_slack_channel_id;
        if (params.slack_bot_token) body.slack_bot_token = params.slack_bot_token;
        if (params.slack_team_id) body.slack_team_id = params.slack_team_id;
        if (params.slack_team_name) body.slack_team_name = params.slack_team_name;

        const data = await agentPost("/api/v1/schedules", body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "get_agent_schedule",
    "Get a Rolli Agent schedule's full configuration plus its 10 most recent execution records.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
    },
    async (params) => {
      try {
        const data = await agentGet(`/api/v1/schedules/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "update_agent_schedule",
    "Partially update a Rolli Agent schedule. Unspecified fields are left unchanged. next_run_at is recalculated if any recurrence parameter changes.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
      name: z.string().optional().describe("New schedule name"),
      question: z.string().optional().describe("New question"),
      recurrence_type: z.enum(RECURRENCE_TYPES).optional().describe("New cadence"),
      recurrence_time: z.string().regex(RECURRENCE_TIME_REGEX, "Must be HH:MM").optional().describe("New time of day in HH:MM format"),
      recurrence_timezone: z.string().optional().describe("New IANA timezone"),
      recurrence_day_of_week: z.number().int().min(0).max(6).optional().describe("0–6 for weekly schedules"),
      recurrence_day_of_month: z.number().int().min(1).max(31).optional().describe("1–31 for monthly schedules"),
      starts_at: z.string().optional().describe("New start ISO 8601 timestamp"),
      ends_at: z.string().optional().describe("New end ISO 8601 timestamp"),
      available_credits: z.number().int().min(1).max(4).optional().describe("New reasoning effort: 1=low, 2=medium, 3=high, 4=max"),
      mode: z.enum(MODES).optional().describe("New investigation mode"),
      time_window: z.string().optional().describe("New time window"),
      platforms: z.array(z.enum(PLATFORMS)).optional().describe("New platforms array"),
      max_post: z.number().int().positive().optional().describe("New posts-per-platform limit"),
      notify_email: z.string().optional().describe("New notification email"),
      notify_slack_webhook: z.string().optional().describe("New Slack webhook URL"),
      notify_slack_channel_id: z.string().optional().describe("New Slack channel ID"),
    },
    async (params) => {
      try {
        const { id, ...rest } = params;
        const body: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
          if (value !== undefined) body[key] = value;
        }
        const data = await agentPatch(`/api/v1/schedules/${id}`, body);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "delete_agent_schedule",
    "Permanently delete a Rolli Agent schedule and its execution history. This is irreversible. Use pause_agent_schedule to temporarily stop a schedule without losing history.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
    },
    async (params) => {
      try {
        const data = await agentDelete(`/api/v1/schedules/${params.id}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "pause_agent_schedule",
    "Pause a Rolli Agent schedule so it stops executing. The schedule and its history are preserved — resume it later with resume_agent_schedule.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
    },
    async (params) => {
      try {
        const data = await agentPost(`/api/v1/schedules/${params.id}/pause`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "resume_agent_schedule",
    "Resume a paused Rolli Agent schedule. next_run_at is recalculated based on the recurrence parameters.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
    },
    async (params) => {
      try {
        const data = await agentPost(`/api/v1/schedules/${params.id}/resume`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );

  server.tool(
    "list_agent_schedule_runs",
    "List the full execution history of a Rolli Agent schedule, including a preview of each linked agent run.",
    {
      id: z.string().uuid().describe("Schedule UUID"),
      limit: z.number().int().positive().max(100).optional().describe("Page size (default: 50, max: 100)"),
      offset: z.number().int().nonnegative().optional().describe("Pagination offset (default: 0)"),
    },
    async (params) => {
      try {
        const queryParts: string[] = [];
        if (params.limit !== undefined) queryParts.push(`limit=${params.limit}`);
        if (params.offset !== undefined) queryParts.push(`offset=${params.offset}`);
        const query = queryParts.length ? `?${queryParts.join("&")}` : "";
        const data = await agentGet(`/api/v1/schedules/${params.id}/runs${query}`);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (e) {
        return { content: [{ type: "text", text: errorToText(e) }], isError: true };
      }
    }
  );
}
