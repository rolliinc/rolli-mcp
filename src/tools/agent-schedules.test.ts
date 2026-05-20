import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockAgentGet, mockAgentPost, mockAgentPatch, mockAgentDelete } = vi.hoisted(() => ({
  mockAgentGet: vi.fn(),
  mockAgentPost: vi.fn(),
  mockAgentPatch: vi.fn(),
  mockAgentDelete: vi.fn(),
}));

vi.mock("../api.js", () => ({
  agentGet: mockAgentGet,
  agentPost: mockAgentPost,
  agentPatch: mockAgentPatch,
  agentDelete: mockAgentDelete,
}));

import { register } from "./agent-schedules.js";

type ToolResult = {
  content: { type: string; text: string }[];
  isError?: boolean;
};
type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

function captureTools(): Record<string, ToolHandler> {
  const tools: Record<string, ToolHandler> = {};
  const mockServer = {
    tool: (...args: unknown[]) => {
      tools[args[0] as string] = args[args.length - 1] as ToolHandler;
    },
  };
  register(mockServer as unknown as McpServer);
  return tools;
}

const SCHEDULE_ID = "660e8400-e29b-41d4-a716-446655440111";

const REQUIRED_CREATE_PARAMS = {
  name: "Daily Crypto Trends",
  question: "What is trending in crypto?",
  recurrence_type: "daily",
  recurrence_time: "09:00",
  recurrence_timezone: "America/New_York",
  starts_at: "2026-05-20T09:00:00Z",
};

describe("list_agent_schedules", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns list with no filters", async () => {
    mockAgentGet.mockResolvedValue({ schedules: [], total: 0, limit: 50, offset: 0 });
    const result = await tools.list_agent_schedules({});
    expect(mockAgentGet).toHaveBeenCalledWith("/api/v1/schedules");
    expect(JSON.parse(result.content[0].text)).toEqual({ schedules: [], total: 0, limit: 50, offset: 0 });
  });

  it("passes limit and offset", async () => {
    mockAgentGet.mockResolvedValue({ schedules: [] });
    await tools.list_agent_schedules({ limit: 25, offset: 50 });
    expect(mockAgentGet).toHaveBeenCalledWith("/api/v1/schedules?limit=25&offset=50");
  });

  it("returns error on API failure", async () => {
    mockAgentGet.mockRejectedValue(new Error("API error 500"));
    const result = await tools.list_agent_schedules({});
    expect(result.isError).toBe(true);
  });
});

describe("create_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("posts only required fields when no optionals supplied", async () => {
    mockAgentPost.mockResolvedValue({ id: SCHEDULE_ID, ...REQUIRED_CREATE_PARAMS });
    await tools.create_agent_schedule(REQUIRED_CREATE_PARAMS);
    expect(mockAgentPost).toHaveBeenCalledWith("/api/v1/schedules", REQUIRED_CREATE_PARAMS);
  });

  it("passes all optional fields through", async () => {
    mockAgentPost.mockResolvedValue({ id: SCHEDULE_ID });
    const full = {
      ...REQUIRED_CREATE_PARAMS,
      recurrence_type: "weekly",
      recurrence_day_of_week: 1,
      recurrence_day_of_month: 15,
      ends_at: "2027-01-01T00:00:00Z",
      available_credits: 3,
      mode: "monitoring",
      time_window: "24h",
      platforms: ["twitter", "reddit"],
      max_post: 25,
      notify_email: "user@example.com",
      notify_slack_webhook: "https://hooks.slack.com/services/x",
      notify_slack_channel_id: "C123",
      slack_bot_token: "xoxb-123",
      slack_team_id: "T123",
      slack_team_name: "Test",
    };
    await tools.create_agent_schedule(full);
    expect(mockAgentPost).toHaveBeenCalledWith("/api/v1/schedules", full);
  });

  it("returns error on API failure", async () => {
    mockAgentPost.mockRejectedValue(new Error("API error 422"));
    const result = await tools.create_agent_schedule(REQUIRED_CREATE_PARAMS);
    expect(result.isError).toBe(true);
  });
});

describe("get_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns schedule details by ID", async () => {
    const mockData = { id: SCHEDULE_ID, name: "test", recent_runs: [] };
    mockAgentGet.mockResolvedValue(mockData);
    const result = await tools.get_agent_schedule({ id: SCHEDULE_ID });
    expect(mockAgentGet).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}`);
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });
});

describe("update_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("sends only the supplied fields and excludes id from body", async () => {
    mockAgentPatch.mockResolvedValue({ id: SCHEDULE_ID, name: "Renamed" });
    await tools.update_agent_schedule({ id: SCHEDULE_ID, name: "Renamed" });
    expect(mockAgentPatch).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}`, { name: "Renamed" });
  });

  it("forwards multiple recurrence fields", async () => {
    mockAgentPatch.mockResolvedValue({ id: SCHEDULE_ID });
    await tools.update_agent_schedule({
      id: SCHEDULE_ID,
      recurrence_type: "weekly",
      recurrence_time: "14:00",
      recurrence_day_of_week: 1,
    });
    expect(mockAgentPatch).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}`, {
      recurrence_type: "weekly",
      recurrence_time: "14:00",
      recurrence_day_of_week: 1,
    });
  });
});

describe("delete_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("calls the delete endpoint", async () => {
    mockAgentDelete.mockResolvedValue({ message: "Schedule deleted" });
    const result = await tools.delete_agent_schedule({ id: SCHEDULE_ID });
    expect(mockAgentDelete).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}`);
    expect(JSON.parse(result.content[0].text)).toEqual({ message: "Schedule deleted" });
  });
});

describe("pause_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("posts to the pause endpoint", async () => {
    mockAgentPost.mockResolvedValue({ id: SCHEDULE_ID, paused: true });
    await tools.pause_agent_schedule({ id: SCHEDULE_ID });
    expect(mockAgentPost).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}/pause`);
  });
});

describe("resume_agent_schedule", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("posts to the resume endpoint", async () => {
    mockAgentPost.mockResolvedValue({ id: SCHEDULE_ID, paused: false });
    await tools.resume_agent_schedule({ id: SCHEDULE_ID });
    expect(mockAgentPost).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}/resume`);
  });
});

describe("list_agent_schedule_runs", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns runs with no filters", async () => {
    mockAgentGet.mockResolvedValue({ runs: [], total: 0, limit: 50, offset: 0 });
    const result = await tools.list_agent_schedule_runs({ id: SCHEDULE_ID });
    expect(mockAgentGet).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}/runs`);
    expect(JSON.parse(result.content[0].text)).toEqual({ runs: [], total: 0, limit: 50, offset: 0 });
  });

  it("passes limit and offset", async () => {
    mockAgentGet.mockResolvedValue({ runs: [] });
    await tools.list_agent_schedule_runs({ id: SCHEDULE_ID, limit: 10, offset: 5 });
    expect(mockAgentGet).toHaveBeenCalledWith(`/api/v1/schedules/${SCHEDULE_ID}/runs?limit=10&offset=5`);
  });

  it("returns error on API failure", async () => {
    mockAgentGet.mockRejectedValue(new Error("API error 404"));
    const result = await tools.list_agent_schedule_runs({ id: SCHEDULE_ID });
    expect(result.isError).toBe(true);
  });
});
