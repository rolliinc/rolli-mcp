const BASE_URL = "https://rolli.ai/api";

const ROLLI_API_TOKEN = process.env.ROLLI_API_TOKEN;
const ROLLI_USER_ID = process.env.ROLLI_USER_ID;

if (!ROLLI_API_TOKEN || !ROLLI_USER_ID) {
  console.error(
    "Error: ROLLI_API_TOKEN and ROLLI_USER_ID environment variables are required.\n" +
    "Set them in your MCP client configuration."
  );
  process.exit(1);
}

const headers: Record<string, string> = {
  "X-ROLLI-TOKEN": ROLLI_API_TOKEN,
  "X-ROLLI-USER-ID": ROLLI_USER_ID,
  "Content-Type": "application/json",
};

export async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function apiPut(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json();
}
