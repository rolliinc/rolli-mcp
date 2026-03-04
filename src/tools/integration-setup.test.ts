import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const { mockApiGet, mockApiPut } = vi.hoisted(() => ({
  mockApiGet: vi.fn(),
  mockApiPut: vi.fn(),
}));

vi.mock("../api.js", () => ({
  apiGet: mockApiGet,
  apiPut: mockApiPut,
}));

import { register } from "./integration-setup.js";

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

describe("get_integration_setup", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("returns current integration settings", async () => {
    const mockData = { return_url: "https://example.com/webhook", name: "my-integration" };
    mockApiGet.mockResolvedValue(mockData);

    const result = await tools.get_integration_setup({});
    expect(mockApiGet).toHaveBeenCalledWith("/setup");
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("returns error on API failure", async () => {
    mockApiGet.mockRejectedValue(new Error("API error 401"));
    const result = await tools.get_integration_setup({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 401");
  });
});

describe("update_integration_setup", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("updates the webhook return URL", async () => {
    const mockData = { return_url: "https://example.com/hook", name: "my-integration" };
    mockApiPut.mockResolvedValue(mockData);

    const result = await tools.update_integration_setup({
      return_url: "https://example.com/hook",
    });
    expect(mockApiPut).toHaveBeenCalledWith("/setup", {
      return_url: "https://example.com/hook",
    });
    expect(JSON.parse(result.content[0].text)).toEqual(mockData);
  });

  it("returns error on API failure", async () => {
    mockApiPut.mockRejectedValue(new Error("API error 400"));
    const result = await tools.update_integration_setup({
      return_url: "bad-url",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 400");
  });
});
