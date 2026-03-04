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

import { register } from "./user-search.js";

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

describe("list_user_searches", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns list with no filters", async () => {
    mockApiGet.mockResolvedValue([{ id: 1 }]);
    const result = await tools.list_user_searches({});
    expect(mockApiGet).toHaveBeenCalledWith("/iq/user_search");
    expect(JSON.parse(result.content[0].text)).toEqual([{ id: 1 }]);
  });

  it("passes show and page as query params", async () => {
    mockApiGet.mockResolvedValue([]);
    await tools.list_user_searches({ show: "finished", page: 3 });
    expect(mockApiGet).toHaveBeenCalledWith(
      "/iq/user_search?show=finished&page=3",
    );
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 500"));
    const result = await tools.list_user_searches({});
    expect(result.isError).toBe(true);
  });
});

describe("user_search", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tools = captureTools();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("submits and returns results when finished on first poll", async () => {
    mockApiPost.mockResolvedValue({ id: 200 });
    mockApiGet.mockResolvedValue({
      id: 200,
      status: "finished",
      results: {},
    });

    const promise = tools.user_search({
      query: "elonmusk",
      platform: "twitter",
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(mockApiPost).toHaveBeenCalledWith("/iq/user_search", {
      query: "elonmusk",
      platform: "twitter",
    });
    expect(mockApiGet).toHaveBeenCalledWith("/iq/user_search/200");
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("finished");
  });

  it("polls multiple times until finished", async () => {
    mockApiPost.mockResolvedValue({ id: 201 });
    mockApiGet
      .mockResolvedValueOnce({ id: 201, status: "started" })
      .mockResolvedValueOnce({ id: 201, status: "started" })
      .mockResolvedValueOnce({ id: 201, status: "finished", results: {} });

    const promise = tools.user_search({
      query: "testuser",
      platform: "facebook",
    });
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(mockApiGet).toHaveBeenCalledTimes(3);
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).status).toBe("finished");
  });

  it("returns results when search fails", async () => {
    mockApiPost.mockResolvedValue({ id: 202 });
    mockApiGet.mockResolvedValue({ id: 202, status: "failed" });

    const promise = tools.user_search({
      query: "testuser",
      platform: "twitter",
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(JSON.parse(result.content[0].text).status).toBe("failed");
    expect(result.isError).toBeUndefined();
  });

  it("passes optional date params to API", async () => {
    mockApiPost.mockResolvedValue({ id: 203 });
    mockApiGet.mockResolvedValue({ id: 203, status: "finished" });

    const promise = tools.user_search({
      query: "testuser",
      platform: "instagram",
      start_date: "2026-01-01",
      end_date: "2026-02-01",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockApiPost).toHaveBeenCalledWith("/iq/user_search", {
      query: "testuser",
      platform: "instagram",
      start_date: "2026-01-01",
      end_date: "2026-02-01",
    });
  });

  it("times out after 10 minutes", async () => {
    mockApiPost.mockResolvedValue({ id: 204 });
    mockApiGet.mockResolvedValue({ id: 204, status: "started" });

    const promise = tools.user_search({
      query: "testuser",
      platform: "twitter",
    });
    for (let i = 0; i < 125; i++) {
      await vi.advanceTimersByTimeAsync(5000);
    }
    const result = await promise;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");
    expect(result.content[0].text).toContain("204");
  });

  it("handles POST API error", async () => {
    mockApiPost.mockRejectedValue(new Error("API error 500"));
    const result = await tools.user_search({
      query: "testuser",
      platform: "twitter",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 500");
  });

  it("returns raw response if no ID in POST result", async () => {
    mockApiPost.mockResolvedValue({ message: "unexpected" });
    const result = await tools.user_search({
      query: "testuser",
      platform: "twitter",
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({
      message: "unexpected",
    });
  });
});

describe("get_user_search", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns search results by ID", async () => {
    const mockData = { id: 1, status: "finished", results: {} };
    mockApiGet.mockResolvedValue(mockData);

    const result = await tools.get_user_search({ id: 1 });
    expect(mockApiGet).toHaveBeenCalledWith("/iq/user_search/1");
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("Not found"));
    const result = await tools.get_user_search({ id: 999 });
    expect(result.isError).toBe(true);
  });
});
