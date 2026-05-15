import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockApiGet, mockApiPost } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPost: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiGet: mockApiGet,
  apiPost: mockApiPost,
}));

import { register } from "./experts.js";

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

describe("list_expert_searches", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns list with no filters", async () => {
    mockApiGet.mockResolvedValue([{ id: 1 }]);
    const result = await tools.list_expert_searches({});
    expect(mockApiGet).toHaveBeenCalledWith("/search");
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 1 }]);
  });

  it("passes show and page as query params", async () => {
    mockApiGet.mockResolvedValue([]);
    await tools.list_expert_searches({ show: "completed", page: 2 });
    expect(mockApiGet).toHaveBeenCalledWith("/search?show=completed&page=2");
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 500"));
    const result = await tools.list_expert_searches({});
    expect(result.isError).toBe(true);
  });
});

describe("expert_search", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tools = captureTools();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits and returns results when completed on first poll", async () => {
    mockApiPost.mockResolvedValue({ id: 100 });
    mockApiGet.mockResolvedValue({ id: 100, status: "completed", experts: [] });

    const promise = tools.expert_search({ query: "AI ethics researchers" });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(mockApiPost).toHaveBeenCalledWith("/search", {
      query: "AI ethics researchers",
    });
    expect(mockApiGet).toHaveBeenCalledWith("/search/100");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("polls multiple times until completed", async () => {
    mockApiPost.mockResolvedValue({ id: 101 });
    mockApiGet
      .mockResolvedValueOnce({ id: 101, status: "running" })
      .mockResolvedValueOnce({ id: 101, status: "running" })
      .mockResolvedValueOnce({ id: 101, status: "completed", experts: [] });

    const promise = tools.expert_search({ query: "test" });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(mockApiGet).toHaveBeenCalledTimes(3);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("completed");
  });

  it("returns results when search fails", async () => {
    mockApiPost.mockResolvedValue({ id: 102 });
    mockApiGet.mockResolvedValue({ id: 102, status: "failed" });

    const promise = tools.expert_search({ query: "test" });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(JSON.parse(result.content[0].text).status).toBe("failed");
    expect(result.isError).toBeUndefined();
  });

  it("reads status from nested `search` key when present", async () => {
    mockApiPost.mockResolvedValue({ id: 103 });
    mockApiGet.mockResolvedValue({ search: { id: 103, status: "completed" } });

    const promise = tools.expert_search({ query: "test" });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).search.status).toBe("completed");
  });

  it("falls back to `search.id` when top-level id is missing", async () => {
    mockApiPost.mockResolvedValue({ search: { id: 104 } });
    mockApiGet.mockResolvedValue({ id: 104, status: "completed" });

    const promise = tools.expert_search({ query: "test" });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockApiGet).toHaveBeenCalledWith("/search/104");
  });

  it("times out after 10 minutes", async () => {
    mockApiPost.mockResolvedValue({ id: 105 });
    mockApiGet.mockResolvedValue({ id: 105, status: "running" });

    const promise = tools.expert_search({ query: "test" });
    for (let i = 0; i < 125; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");
    expect(result.content[0].text).toContain("105");
  });

  it("handles POST API error", async () => {
    mockApiPost.mockRejectedValue(new Error("API error 500"));
    const result = await tools.expert_search({ query: "test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 500");
  });

  it("returns raw response if no ID in POST result", async () => {
    mockApiPost.mockResolvedValue({ message: "unexpected" });
    const result = await tools.expert_search({ query: "test" });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({
      message: "unexpected",
    });
  });
});

describe("get_expert_search", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns search results by ID", async () => {
    const mockData = { id: 1, status: "completed", experts: [] };
    mockApiGet.mockResolvedValue(mockData);

    const result = await tools.get_expert_search({ id: 1 });
    expect(mockApiGet).toHaveBeenCalledWith("/search/1");
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("Not found"));
    const result = await tools.get_expert_search({ id: 999 });
    expect(result.isError).toBe(true);
  });
});
