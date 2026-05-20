const BASE_URL = "https://rolli.ai/api";
const AGENT_BASE_URL = process.env.ROLLI_AGENT_BASE_URL || "https://agent.rolli.ai";

const ROLLI_API_TOKEN = process.env.ROLLI_API_TOKEN;
const ROLLI_USER_ID = process.env.ROLLI_USER_ID || "rolli-mcp";

if (!ROLLI_API_TOKEN) {
  console.error(
    "Error: ROLLI_API_TOKEN environment variable is required.\n" +
    "Set it in your MCP client configuration."
  );
  process.exit(1);
}

const REQUEST_TIMEOUT_MS = 30_000;

const headers: Record<string, string> = {
  "X-ROLLI-TOKEN": ROLLI_API_TOKEN,
  "X-ROLLI-USER-ID": ROLLI_USER_ID,
  "Content-Type": "application/json",
};

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function sanitizeErrorText(text: string): string {
  const maxLen = 200;
  const truncated = text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  return truncated.replace(/["']?[A-Za-z0-9_-]{20,}["']?/g, "[REDACTED]");
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request(method: Method, baseUrl: string, path: string, body?: unknown): Promise<unknown> {
  const init: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API error ${res.status}: ${sanitizeErrorText(text)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const apiGet = (path: string) => request("GET", BASE_URL, path);
export const apiPost = (path: string, body: unknown) => request("POST", BASE_URL, path, body);
export const apiPut = (path: string, body: unknown) => request("PUT", BASE_URL, path, body);
export const apiPatch = (path: string, body: unknown) => request("PATCH", BASE_URL, path, body);
export const apiDelete = (path: string) => request("DELETE", BASE_URL, path);

export const agentGet = (path: string) => request("GET", AGENT_BASE_URL, path);
export const agentPost = (path: string, body?: unknown) => request("POST", AGENT_BASE_URL, path, body);
export const agentPatch = (path: string, body: unknown) => request("PATCH", AGENT_BASE_URL, path, body);
export const agentDelete = (path: string) => request("DELETE", AGENT_BASE_URL, path);
