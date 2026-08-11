const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MAX_POLL_MS = 10 * 60 * 1_000;
const DEFAULT_RESULTS_SETTLE_MS = 45_000;
const DEFAULT_MAX_RESPONSE_BYTES = 100_000;

// Module-level knobs. This file is deliberately env-free so it can stay
// byte-identical between rolli-mcp (stdio, process.env) and rolli-remote-mcp
// (Cloudflare Worker, Env bindings) — each entry point reads its own config
// source and calls the setters at startup / per request.
let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
let maxPollMs = DEFAULT_MAX_POLL_MS;
let resultsSettleMs = DEFAULT_RESULTS_SETTLE_MS;
let maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES;

export function setPollDefaults(opts: {
  intervalMs?: number;
  maxMs?: number;
}): void {
  if (Number.isFinite(opts.intervalMs) && opts.intervalMs! > 0) {
    pollIntervalMs = opts.intervalMs!;
  }
  if (Number.isFinite(opts.maxMs) && opts.maxMs! > 0) {
    maxPollMs = opts.maxMs!;
  }
}

export function setResultsSettleMs(ms: number): void {
  if (Number.isFinite(ms) && ms >= 0) {
    resultsSettleMs = ms;
  }
}

export function setMaxResponseBytes(bytes: number): void {
  if (Number.isFinite(bytes) && bytes > 0) {
    maxResponseBytes = bytes;
  }
}

/**
 * Normalize an arbitrary thrown value into a user-facing error message.
 * `Error` instances yield their `.message`; everything else gets stringified.
 */
export function errorToText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEFAULT_TERMINAL_STATUSES = ["finished", "failed"] as const;
const DEFAULT_SETTLE_STATUSES = ["finished"] as const;

/**
 * Minimal structural shape required by the polling / preflight helpers. Both
 * `ApiClient` and `AgentApiClient` satisfy this — the helpers only ever issue
 * GETs, so they don't need to know about post/put/patch/delete.
 */
export interface PollableClient {
  get(path: string): Promise<unknown>;
}

export interface SettleOptions {
  /**
   * Field on the status record that must be non-null before a success status
   * is treated as terminal (e.g. `"results"` for IQ searches,
   * `"expert_results"` for expert searches). The backend writes `status` and
   * results in two separate updates, so there is a window where the record
   * reports success with the results column still null.
   */
  resultsKey: string;
  /**
   * Success statuses that require `resultsKey` to be present. Failure statuses
   * always terminate immediately. Defaults to `["finished"]`.
   */
  statuses?: readonly string[];
  /**
   * Extra time to keep polling after the status first reports success without
   * results, additive to `maxMs`. Defaults to the configured settle window
   * (45s; see `setResultsSettleMs`).
   */
  extraMs?: number;
}

export interface PollOptions {
  api: PollableClient;
  /** Path to GET for the poll status check, e.g. `/iq/keyword_search/42` */
  path: string;
  /**
   * Key in the response object that wraps the status-bearing record
   * (e.g. `"keyword_search"` for `{ keyword_search: { status: ... } }`).
   * Omit when the response is flat (status at the root). The helper always
   * falls back to the root object when the key is absent or omitted.
   */
  recordKey?: string;
  /**
   * Status values that should end polling. Defaults to `["finished", "failed"]`
   * (the IQ convention). The Experts API uses `["completed", "failed"]`.
   */
  terminalStatuses?: readonly string[];
  /** When set, success statuses are only terminal once results are attached. */
  settle?: SettleOptions;
  intervalMs?: number;
  maxMs?: number;
}

export type PollOutcome =
  /** A terminal status was reached (including failures). */
  | { kind: "terminal"; data: Record<string, unknown> }
  /** Success status reached, but results never materialized within the settle window. */
  | { kind: "results_pending"; data: Record<string, unknown> }
  /** No terminal status within `maxMs`. */
  | { kind: "timeout" };

/**
 * Poll a Rolli search endpoint until its status reaches one of the configured
 * terminal values, or until the timeout elapses.
 *
 * With `settle` configured, a success status with a null/missing results field
 * is NOT terminal: the backend persists `status` and results in separate
 * updates, so the helper keeps polling for up to `settle.extraMs` more
 * (additive to `maxMs`) and reports `results_pending` if the results never
 * arrive — the caller must never present "finished" with a null payload as a
 * successful outcome.
 */
export async function pollUntilDone(options: PollOptions): Promise<PollOutcome> {
  const interval = options.intervalMs ?? pollIntervalMs;
  const maxMs = options.maxMs ?? maxPollMs;
  const terminal = options.terminalStatuses ?? DEFAULT_TERMINAL_STATUSES;
  const settleStatuses = options.settle?.statuses ?? DEFAULT_SETTLE_STATUSES;
  const settleMs = options.settle?.extraMs ?? resultsSettleMs;
  const startTime = Date.now();
  let settleStart: number | null = null;

  for (;;) {
    const data = (await options.api.get(options.path)) as Record<
      string,
      unknown
    >;
    const wrapped =
      options.recordKey !== undefined
        ? (data[options.recordKey] as Record<string, unknown> | undefined)
        : undefined;
    const record = wrapped ?? data;
    const status = record.status ?? data.status;
    if (typeof status === "string" && terminal.includes(status)) {
      const settle = options.settle;
      if (
        settle === undefined ||
        !settleStatuses.includes(status) ||
        record[settle.resultsKey] != null
      ) {
        return { kind: "terminal", data };
      }
      settleStart ??= Date.now();
      if (Date.now() - settleStart >= settleMs) {
        return { kind: "results_pending", data };
      }
    } else if (Date.now() - startTime >= maxMs) {
      return { kind: "timeout" };
    }
    await sleep(interval);
  }
}

/**
 * Payload returned when a search finished collecting but the backend has not
 * yet written the results column. Deliberately NOT an error and NOT
 * `status: "finished"` — the one thing this must never look like is a
 * successful search with empty results.
 */
export function resultsPendingPayload(
  id: unknown,
  retryTool: string,
): Record<string, unknown> {
  return {
    id,
    status: "results_pending",
    message:
      `Search ${id} finished collecting data, but the results are still being ` +
      `written by the backend. Call ${retryTool} with id ${id} in a few seconds ` +
      `to retrieve them.`,
  };
}

/**
 * Annotate a raw GET response that reports a success status while its results
 * field is still null/missing. Used by the `get_*` tools, which stay
 * single-GET "truth tellers" but must not let a transient success+null state
 * read as "the search found nothing".
 */
export function annotateResultsPending(
  data: unknown,
  opts: {
    resultsKey: string;
    retryTool: string;
    statuses?: readonly string[];
    recordKey?: string;
  },
): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }
  const obj = data as Record<string, unknown>;
  const wrapped =
    opts.recordKey !== undefined
      ? (obj[opts.recordKey] as Record<string, unknown> | undefined)
      : undefined;
  const record = wrapped ?? obj;
  const statuses = opts.statuses ?? DEFAULT_SETTLE_STATUSES;
  const status = record.status ?? obj.status;
  if (
    typeof status === "string" &&
    statuses.includes(status) &&
    record[opts.resultsKey] == null
  ) {
    return {
      ...obj,
      results_pending: true,
      results_pending_note:
        `The search reports status "${status}" but its ${opts.resultsKey} ` +
        `field has not been written yet — this is a transient backend state, ` +
        `not an empty result. Retry ${opts.retryTool} in a few seconds.`,
    };
  }
  return data;
}

const TRUNCATION_RESERVE_BYTES = 2_048;
const MIN_KEEP = 3;
const MAX_TRIM_ITERATIONS = 20;
const FALLBACK_STRING_LIMIT = 4_000;

const TRUNCATION_NOTE =
  "Response exceeded the size cap, so the largest arrays were shortened from " +
  "the end (analytics, sentiment, and summary fields are complete). For full " +
  "post data use get_keyword_search_posts / get_user_search_posts with a " +
  "platform filter, or narrow the search.";

const textEncoder = new TextEncoder();

function utf8Bytes(s: string): number {
  return textEncoder.encode(s).length;
}

interface ArrayEntry {
  path: string;
  array: unknown[];
  remainingBytes: number;
}

function collectArrays(node: unknown, path: string, out: ArrayEntry[]): void {
  if (Array.isArray(node)) {
    if (node.length >= 2) {
      let remainingBytes = 0;
      for (const el of node) {
        remainingBytes += utf8Bytes(JSON.stringify(el) ?? "null") + 8;
      }
      out.push({ path, array: node, remainingBytes });
    }
    node.forEach((el, i) => collectArrays(el, `${path}[${i}]`, out));
  } else if (node !== null && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      collectArrays(v, path === "" ? k : `${path}.${k}`, out);
    }
  }
}

function resolveArray(root: unknown, path: string): unknown[] | null {
  const tokens = path.split(/[.[\]]+/).filter((t) => t !== "");
  let node: unknown = root;
  for (const t of tokens) {
    if (node === null || typeof node !== "object") return null;
    node = Array.isArray(node)
      ? node[Number(t)]
      : (node as Record<string, unknown>)[t];
  }
  return Array.isArray(node) ? node : null;
}

function truncationBlock(
  cap: number,
  root: unknown,
  droppedByPath: Map<string, number>,
): Record<string, unknown> {
  const arrays: { path: string; kept: number; dropped: number }[] = [];
  for (const [path, dropped] of droppedByPath) {
    const arr = resolveArray(root, path);
    if (arr === null) continue; // trimmed array was itself dropped later
    arrays.push({ path: path === "" ? "(root)" : path, kept: arr.length, dropped });
  }
  arrays.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { max_bytes: cap, arrays, note: TRUNCATION_NOTE };
}

function scalarFallback(
  root: unknown,
  cap: number,
  droppedByPath: Map<string, number>,
): string {
  const out: Record<string, unknown> = {};
  if (root !== null && typeof root === "object" && !Array.isArray(root)) {
    for (const [k, v] of Object.entries(root)) {
      if (v === null || typeof v !== "object") {
        out[k] =
          typeof v === "string" && v.length > FALLBACK_STRING_LIMIT
            ? `${v.slice(0, FALLBACK_STRING_LIMIT)}…[truncated]`
            : v;
      }
    }
  }
  out.truncated = true;
  out.truncation = {
    ...truncationBlock(cap, root, droppedByPath),
    note:
      "Response exceeded the size cap and could not be reduced by array " +
      "trimming alone; only top-level scalar fields are included. Use the " +
      "posts tools with a platform filter to retrieve the data in pieces.",
  };
  return JSON.stringify(out, null, 2);
}

/**
 * Serialize `data` as pretty-printed JSON, deterministically capped to
 * `maxBytes` (default: the configured cap; see `setMaxResponseBytes`).
 *
 * Payloads under the cap are returned byte-for-byte unchanged (no keys added).
 * Oversized payloads have their largest arrays trimmed from the END (backend
 * ordering puts top posts first) down to at most `MIN_KEEP` elements each,
 * never touching scalar fields — so counts, sentiment, and summary analytics
 * survive intact. The result is always valid JSON and carries
 * `truncated: true` plus a `truncation` block reporting exactly what was
 * dropped.
 */
export function serializeCapped(data: unknown, maxBytes?: number): string {
  const cap = maxBytes ?? maxResponseBytes;
  const full = JSON.stringify(data, null, 2) ?? "null";
  if (utf8Bytes(full) <= cap) {
    return full;
  }

  const root = JSON.parse(full) as unknown;
  const budget = Math.max(cap - TRUNCATION_RESERVE_BYTES, 1_024);
  const droppedByPath = new Map<string, number>();

  for (let i = 0; i < MAX_TRIM_ITERATIONS; i++) {
    const size = utf8Bytes(JSON.stringify(root, null, 2) ?? "null");
    if (size <= budget) break;

    const entries: ArrayEntry[] = [];
    collectArrays(root, "", entries);
    const trimmable = entries.filter((e) => e.array.length > MIN_KEEP);
    if (trimmable.length === 0) {
      return scalarFallback(root, cap, droppedByPath);
    }
    trimmable.sort((a, b) =>
      b.remainingBytes !== a.remainingBytes
        ? b.remainingBytes - a.remainingBytes
        : a.path < b.path
          ? -1
          : 1,
    );

    const target = trimmable[0];
    let overshoot = size - budget;
    let dropped = 0;
    while (target.array.length > MIN_KEEP && overshoot > 0) {
      const el = target.array.pop();
      overshoot -= utf8Bytes(JSON.stringify(el) ?? "null") + 8;
      dropped++;
    }
    droppedByPath.set(target.path, (droppedByPath.get(target.path) ?? 0) + dropped);
  }

  if (utf8Bytes(JSON.stringify(root, null, 2) ?? "null") > budget) {
    return scalarFallback(root, cap, droppedByPath);
  }

  const truncation = truncationBlock(cap, root, droppedByPath);
  const out =
    root !== null && typeof root === "object" && !Array.isArray(root)
      ? { ...(root as Record<string, unknown>), truncated: true, truncation }
      : { items: root, truncated: true, truncation };
  return JSON.stringify(out, null, 2);
}

export type PreflightCreditsResult =
  /** Enough credits, or the balance endpoint was unavailable (`available: null`) — proceed. */
  | { sufficient: true; available: number | null }
  | { sufficient: false; available: number; required: number };

/**
 * Check the user's IQ credit balance (`GET /iq/credits`) before starting an
 * agent run, so runs that cannot possibly complete fail at 0% instead of
 * burning tokens and failing mid-run.
 *
 * Fails OPEN: if the endpoint errors or returns an unexpected shape, the run
 * proceeds — a genuinely insufficient balance still surfaces through the agent
 * backend's own 402, and a broken balance endpoint must never block runs.
 */
export async function preflightCredits(
  api: PollableClient,
  requiredCredits: number,
): Promise<PreflightCreditsResult> {
  try {
    const data = (await api.get("/iq/credits")) as Record<string, unknown> | null;
    const available = data?.available_credits;
    if (typeof available !== "number") {
      return { sufficient: true, available: null };
    }
    if (available < requiredCredits) {
      return { sufficient: false, available, required: requiredCredits };
    }
    return { sufficient: true, available };
  } catch {
    return { sufficient: true, available: null };
  }
}

/** Error payload for a run rejected by the credits preflight. */
export function insufficientCreditsPayload(
  required: number,
  available: number,
): Record<string, unknown> {
  return {
    error: "insufficient_credits",
    required_credits: required,
    available_credits: available,
    message:
      `Starting this run requires ${required} IQ credit(s) but only ` +
      `${available} available. The run was not started, so nothing was ` +
      `charged. Note: agent-run credits and keyword-search credits may draw ` +
      `from separate pools; if you believe you have credits, retry — the run ` +
      `will fail fast if the agent backend rejects it.`,
  };
}

export const CREDITS_NOTE =
  "IQ keyword/user-search credits and agent-run credits may draw from " +
  "separate pools. credits_limit and period_reset_date are null for one-time " +
  "credit grants (e.g. trial accounts) or when the backend does not report " +
  "them.";

/**
 * Merge the `/usage` payload with the settled result of a concurrent
 * `/iq/credits` fetch. A credits failure degrades to a `credits_error` string
 * rather than failing the tool — consumption data is still useful on its own.
 */
export function mergeUsageAndCredits(
  usage: unknown,
  credits: PromiseSettledResult<unknown>,
): Record<string, unknown> {
  const base: Record<string, unknown> =
    usage !== null && typeof usage === "object" && !Array.isArray(usage)
      ? { ...(usage as Record<string, unknown>) }
      : { usage };
  if (credits.status === "fulfilled") {
    const c = (credits.value ?? {}) as Record<string, unknown>;
    base.credits = {
      credits_remaining: c.available_credits ?? null,
      credits_limit: c.credits_limit ?? null,
      period_reset_date: c.period_reset_date ?? null,
    };
    base.credits_note = CREDITS_NOTE;
  } else {
    base.credits_error = errorToText(credits.reason);
  }
  return base;
}

/**
 * `result.report_html` is a rendered duplicate of `result.report_markdown` and
 * makes up ~70% of a completed run's payload (~43 KB out of 61 KB). Stripping
 * it keeps the response under MCP client token caps without losing content.
 */
export function stripReportHtml(data: unknown): unknown {
  if (data === null || typeof data !== "object") return data;
  const obj = data as Record<string, unknown>;
  const result = obj.result;
  if (
    result === null ||
    typeof result !== "object" ||
    !("report_html" in result)
  ) {
    return obj;
  }
  const rest = { ...(result as Record<string, unknown>) };
  delete rest.report_html;
  return { ...obj, result: rest };
}
