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

const USAGE_DATA = { searches_count: 50, usage_by_user: [] };
const CREDITS_DATA = {
  available_credits: 7,
  credits_limit: 100,
  period_reset_date: "2026-09-01",
};

function dispatchApiGet(opts: {
  usage?: unknown;
  usageError?: Error;
  credits?: unknown;
  creditsError?: Error;
}) {
  mockApiGet.mockImplementation((path: string) => {
    if (path.startsWith("/usage")) {
      return opts.usageError
        ? Promise.reject(opts.usageError)
        : Promise.resolve(opts.usage);
    }
    if (path === "/iq/credits") {
      return opts.creditsError
        ? Promise.reject(opts.creditsError)
        : Promise.resolve(opts.credits);
    }
    return Promise.reject(new Error(`unexpected path: ${path}`));
  });
}

describe("get_usage", () => {
  let tools: Record<string, ToolHandler>;

  beforeEach(() => {
    vi.clearAllMocks();
    tools = captureTools();
  });

  it("merges usage with the credit balance", async () => {
    dispatchApiGet({ usage: USAGE_DATA, credits: CREDITS_DATA });

    const result = await tools.get_usage({});
    expect(mockApiGet).toHaveBeenCalledWith("/usage");
    expect(mockApiGet).toHaveBeenCalledWith("/iq/credits");
    expect(result.isError).toBeUndefined();

    const payload = JSON.parse(result.content[0].text);
    expect(payload.searches_count).toBe(50);
    expect(payload.usage_by_user).toEqual([]);
    expect(payload.credits).toEqual({
      credits_remaining: 7,
      credits_limit: 100,
      period_reset_date: "2026-09-01",
    });
    expect(typeof payload.credits_note).toBe("string");
  });

  it("passes month as query param", async () => {
    dispatchApiGet({ usage: { searches_count: 10 }, credits: CREDITS_DATA });

    await tools.get_usage({ month: "2026-02" });
    expect(mockApiGet).toHaveBeenCalledWith("/usage?month=2026-02");
    expect(mockApiGet).toHaveBeenCalledWith("/iq/credits");
  });

  it("nulls missing credit fields", async () => {
    dispatchApiGet({ usage: USAGE_DATA, credits: { available_credits: 3 } });

    const result = await tools.get_usage({});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.credits).toEqual({
      credits_remaining: 3,
      credits_limit: null,
      period_reset_date: null,
    });
  });

  it("degrades to credits_error when the credits endpoint fails", async () => {
    dispatchApiGet({
      usage: USAGE_DATA,
      creditsError: new Error("credits down"),
    });

    const result = await tools.get_usage({});
    expect(result.isError).toBeUndefined();

    const payload = JSON.parse(result.content[0].text);
    expect(payload.searches_count).toBe(50);
    expect(payload.credits).toBeUndefined();
    expect(payload.credits_error).toContain("credits down");
  });

  it("returns error when the usage endpoint fails", async () => {
    dispatchApiGet({
      usageError: new Error("API error 403"),
      credits: CREDITS_DATA,
    });

    const result = await tools.get_usage({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API error 403");
  });
});
