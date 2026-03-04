import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockApiGet } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiGet: mockApiGet,
}));

import { register } from "./usage.js";

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

describe("get_usage", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns last 12 months when no month specified", async () => {
    const mockData = { searches_count: 50, usage_by_user: [] };
    mockApiGet.mockResolvedValue(mockData);

    const result = await tools.get_usage({});
    expect(mockApiGet).toHaveBeenCalledWith("/usage");
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("passes month as query param", async () => {
    mockApiGet.mockResolvedValue({ searches_count: 10 });

    await tools.get_usage({ month: "2026-02" });
    expect(mockApiGet).toHaveBeenCalledWith("/usage?month=2026-02");
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 403"));
    const result = await tools.get_usage({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 403");
  });
});
