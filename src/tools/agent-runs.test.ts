import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockApiGet, mockAgentGet, mockAgentPost, mockAgentPatch, mockAgentDelete } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockAgentGet: vi.fn(),
  mockAgentPost: vi.fn(),
  mockAgentPatch: vi.fn(),
  mockAgentDelete: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiGet: mockApiGet,
  agentGet: mockAgentGet,
  agentPost: mockAgentPost,
  agentPatch: mockAgentPatch,
  agentDelete: mockAgentDelete,
}));

import { register } from "./agent-runs.js";

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

const RUN_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("list_agent_runs", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns list with no filters", async () => {
    mockAgentGet.mockResolvedValue({ runs: [], total: 0, limit: 50, offset: 0 });
    const result = await tools.list_agent_runs({});
    expect(mockAgentGet).toHaveBeenCalledWith("/api/v1/runs");
    expect(JSON.parse(result.content[0].text)).toEqual({ runs: [], total: 0, limit: 50, offset: 0 });
  });

  it("passes all query params", async () => {
    mockAgentGet.mockResolvedValue({ runs: [], total: 0, limit: 10, offset: 20 });
    await tools.list_agent_runs({ status: "completed", user_id: "user-123", limit: 10, offset: 20 });
    expect(mockAgentGet).toHaveBeenCalledWith(
      "/api/v1/runs?status=completed&user_id=user-123&limit=10&offset=20",
    );
  });

  it("url-encodes user_id", async () => {
    mockAgentGet.mockResolvedValue({ runs: [] });
    await tools.list_agent_runs({ user_id: "user with space" });
    // URLSearchParams encodes spaces as "+" (form-urlencoded), which the
    // backend decodes identically to %20.
    expect(mockAgentGet).toHaveBeenCalledWith("/api/v1/runs?user_id=user+with+space");
  });

  it("returns error on API failure", async () => {
    mockAgentGet.mockRejectedValue(new Error("API error 500"));
    const result = await tools.list_agent_runs({});
    expect(result.isError).toBe(true);
  });
});

describe("start_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Credits preflight (GET /iq/credits) passes by default.
    mockApiGet.mockResolvedValue({ available_credits: 10 });
    tools = captureTools();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits and returns results when completed on first poll", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "completed", result: { report_markdown: "..." } });

    const promise = tools.start_agent_run({ question: "Smoke test" });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(mockAgentPost).toHaveBeenCalledWith("/api/v1/runs", { question: "Smoke test" });
    expect(mockAgentGet).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}`);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("polls through pending → running → waiting → completed", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet
      .mockResolvedValueOnce({ id: RUN_ID, status: "running" })
      .mockResolvedValueOnce({ id: RUN_ID, status: "waiting" })
      .mockResolvedValueOnce({ id: RUN_ID, status: "completed", result: {} });

    const promise = tools.start_agent_run({ question: "test" });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(mockAgentGet).toHaveBeenCalledTimes(3);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("returns results when run fails", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "failed", error: "boom" });

    const promise = tools.start_agent_run({ question: "test" });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(JSON.parse(result.content[0].text).status).toBe("failed");
    expect(result.isError).toBeUndefined();
  });

  it("passes all optional params to API", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "completed" });

    const promise = tools.start_agent_run({
      question: "test",
      available_credits: 3,
      mode: "monitoring",
      time_window: "24h",
      platforms: ["twitter", "reddit"],
      max_post: 25,
      parent_run_id: "660e8400-e29b-41d4-a716-446655440111",
      metadata: { tag: "smoke" },
    });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockAgentPost).toHaveBeenCalledWith("/api/v1/runs", {
      question: "test",
      available_credits: 3,
      mode: "monitoring",
      time_window: "24h",
      platforms: ["twitter", "reddit"],
      max_post: 25,
      parent_run_id: "660e8400-e29b-41d4-a716-446655440111",
      metadata: { tag: "smoke" },
    });
  });

  it("falls back to async after the 120s inline poll budget", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "running" });

    const promise = tools.start_agent_run({ question: "test" });
    for (let i = 0; i < 25; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(result.isError).toBeUndefined();
    const payload = JSON.parse(result.content[0].text);
    expect(payload.id).toBe(RUN_ID);
    expect(payload.status).toBe("running");
    expect(payload.message).toContain("get_agent_run");
  });

  it("fails fast without POSTing when credits are insufficient", async () => {
    mockApiGet.mockResolvedValue({ available_credits: 1 });

    const result = await tools.start_agent_run({ question: "test" });

    expect(mockApiGet).toHaveBeenCalledWith("/iq/credits");
    expect(mockAgentPost).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe("insufficient_credits");
    expect(payload.required_credits).toBe(2);
    expect(payload.available_credits).toBe(1);
    expect(payload.message).toContain("not started");
  });

  it("uses the requested effort as the required credit balance", async () => {
    mockApiGet.mockResolvedValue({ available_credits: 3 });

    const result = await tools.start_agent_run({
      question: "test",
      available_credits: 4,
    });

    expect(mockAgentPost).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.required_credits).toBe(4);
    expect(payload.available_credits).toBe(3);
  });

  it("proceeds with the run when the credits endpoint fails", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 500"));
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "completed", result: {} });

    const result = await tools.start_agent_run({ question: "test" });

    expect(mockAgentPost).toHaveBeenCalledWith("/api/v1/runs", { question: "test" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("proceeds with the run when the credits response has an unexpected shape", async () => {
    mockApiGet.mockResolvedValue({ unexpected: "shape" });
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({ id: RUN_ID, status: "completed", result: {} });

    const result = await tools.start_agent_run({ question: "test" });

    expect(mockAgentPost).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("strips result.report_html from completed run output", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    mockAgentGet.mockResolvedValue({
      id: RUN_ID,
      status: "completed",
      result: { report_markdown: "# Report", report_html: "<h1>Report</h1>" },
    });

    const result = await tools.start_agent_run({ question: "test" });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.result.report_markdown).toBe("# Report");
    expect(payload.result.report_html).toBeUndefined();
  });

  it("handles POST API error", async () => {
    mockAgentPost.mockRejectedValue(new Error("API error 500"));
    const result = await tools.start_agent_run({ question: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 500");
  });

  it("returns raw response if no ID in POST result", async () => {
    mockAgentPost.mockResolvedValue({ message: "unexpected" });
    const result = await tools.start_agent_run({ question: "test" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ message: "unexpected" });
  });
});

describe("get_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns run details by ID", async () => {
    const mockData = { id: RUN_ID, status: "completed", result: {} };
    mockAgentGet.mockResolvedValue(mockData);
    const result = await tools.get_agent_run({ id: RUN_ID });
    expect(mockAgentGet).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}`);
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("strips result.report_html from the output", async () => {
    mockAgentGet.mockResolvedValue({
      id: RUN_ID,
      status: "completed",
      result: { report_markdown: "# Report", report_html: "<h1>Report</h1>" },
    });

    const result = await tools.get_agent_run({ id: RUN_ID });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.result.report_markdown).toBe("# Report");
    expect(payload.result.report_html).toBeUndefined();
  });

  it("returns error on API failure", async () => {
    mockAgentGet.mockRejectedValue(new Error("Not found"));
    const result = await tools.get_agent_run({ id: RUN_ID });
    expect(result.isError).toBe(true);
  });
});

describe("cancel_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("posts to the cancel endpoint", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "failed", cancelled: true });
    const result = await tools.cancel_agent_run({ id: RUN_ID });
    expect(mockAgentPost).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}/cancel`);
    expect(JSON.parse(result.content[0].text)).toEqual({ id: RUN_ID, status: "failed", cancelled: true });
  });

  it("returns error on API failure", async () => {
    mockAgentPost.mockRejectedValue(new Error("API error 422"));
    const result = await tools.cancel_agent_run({ id: RUN_ID });
    expect(result.isError).toBe(true);
  });
});

describe("rerun_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Credits preflight (GET /iq/credits) passes by default.
    mockApiGet.mockResolvedValue({ available_credits: 10 });
    tools = captureTools();
  });

  it("posts to the rerun endpoint with no body", async () => {
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });
    const result = await tools.rerun_agent_run({ id: RUN_ID });
    expect(mockApiGet).toHaveBeenCalledWith("/iq/credits");
    expect(mockAgentPost).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}/rerun`);
    expect(JSON.parse(result.content[0].text)).toEqual({ id: RUN_ID, status: "pending" });
  });

  it("fails fast without POSTing when no credits remain", async () => {
    mockApiGet.mockResolvedValue({ available_credits: 0 });

    const result = await tools.rerun_agent_run({ id: RUN_ID });

    expect(mockAgentPost).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toBe("insufficient_credits");
    expect(payload.required_credits).toBe(1);
    expect(payload.available_credits).toBe(0);
  });

  it("proceeds with the rerun when the credits endpoint fails", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 500"));
    mockAgentPost.mockResolvedValue({ id: RUN_ID, status: "pending" });

    const result = await tools.rerun_agent_run({ id: RUN_ID });

    expect(mockAgentPost).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}/rerun`);
    expect(result.isError).toBeUndefined();
  });
});

describe("update_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("sends only the supplied fields", async () => {
    mockAgentPatch.mockResolvedValue({ id: RUN_ID, pinned: true });
    await tools.update_agent_run({ id: RUN_ID, pinned: true });
    expect(mockAgentPatch).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}`, { pinned: true });
  });

  it("sends both fields when both supplied", async () => {
    mockAgentPatch.mockResolvedValue({ id: RUN_ID, pinned: true, label: "x" });
    await tools.update_agent_run({ id: RUN_ID, pinned: true, label: "x" });
    expect(mockAgentPatch).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}`, { pinned: true, label: "x" });
  });
});

describe("delete_agent_run", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("calls the delete endpoint", async () => {
    mockAgentDelete.mockResolvedValue({ id: RUN_ID, discarded: true });
    const result = await tools.delete_agent_run({ id: RUN_ID });
    expect(mockAgentDelete).toHaveBeenCalledWith(`/api/v1/runs/${RUN_ID}`);
    expect(JSON.parse(result.content[0].text)).toEqual({ id: RUN_ID, discarded: true });
  });

  it("returns error on API failure", async () => {
    mockAgentDelete.mockRejectedValue(new Error("API error 422"));
    const result = await tools.delete_agent_run({ id: RUN_ID });
    expect(result.isError).toBe(true);
  });
});
