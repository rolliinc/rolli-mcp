const BASE_URL = "https://rolli.ai/api";

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

export async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API error ${res.status}: ${sanitizeErrorText(text)}`);
  }
  return res.json();
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API error ${res.status}: ${sanitizeErrorText(text)}`);
  }
  return res.json();
}

export async function apiPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ApiError(res.status, `API error ${res.status}: ${sanitizeErrorText(text)}`);
  }
  return res.json();
}
