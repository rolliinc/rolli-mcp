import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  annotateResultsPending,
  DEFAULT_MAX_RESPONSE_BYTES,
  describePostsPage,
  errorToText,
  insufficientCreditsPayload,
  LARGE_RESULT_META,
  mergeUsageAndCredits,
  pollUntilDone,
  preflightCredits,
  resultsPendingPayload,
  serializeCapped,
  setMaxResponseBytes,
  setPollDefaults,
  setResultsSettleMs,
  stripReportHtml,
} from "./_shared.js";

const DEFAULTS = {
  intervalMs: 5_000,
  maxMs: 600_000,
  settleMs: 45_000,
  maxBytes: 100_000,
};

afterEach(() => {
  // The setters mutate module state; restore defaults so tests stay isolated.
  setPollDefaults({ intervalMs: DEFAULTS.intervalMs, maxMs: DEFAULTS.maxMs });
  setResultsSettleMs(DEFAULTS.settleMs);
  setMaxResponseBytes(DEFAULTS.maxBytes);
});

describe("errorToText", () => {
  it("extracts Error messages and stringifies the rest", () => {
    expect(errorToText(new Error("boom"))).toBe("boom");
    expect(errorToText("plain")).toBe("plain");
    expect(errorToText(42)).toBe("42");
  });
});

describe("pollUntilDone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function apiReturning(...responses: unknown[]) {
    const get = vi.fn();
    for (const r of responses) get.mockResolvedValueOnce(r);
    get.mockResolvedValue(responses[responses.length - 1]);
    return { get };
  }

  it("returns terminal on the first GET when finished with results", async () => {
    const api = apiReturning({ id: 1, status: "finished", results: { data: [] } });
    const outcome = await pollUntilDone({
      api,
      path: "/iq/keyword_search/1",
      settle: { resultsKey: "results" },
    });
    expect(outcome.kind).toBe("terminal");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("keeps polling when finished but results are null, then returns them", async () => {
    const api = apiReturning(
      { id: 1, status: "finished", results: null },
      { id: 1, status: "finished", results: null },
      { id: 1, status: "finished", results: { data: [1] } },
    );
    const promise = pollUntilDone({
      api,
      path: "/iq/keyword_search/1",
      settle: { resultsKey: "results" },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = await promise;
    expect(outcome.kind).toBe("terminal");
    expect(api.get).toHaveBeenCalledTimes(3);
    if (outcome.kind === "terminal") {
      expect(outcome.data.results).toEqual({ data: [1] });
    }
  });

  it("returns results_pending when the settle window expires", async () => {
    const api = apiReturning({ id: 1, status: "finished", results: null });
    const promise = pollUntilDone({
      api,
      path: "/iq/keyword_search/1",
      settle: { resultsKey: "results", extraMs: 15_000 },
    });
    await vi.advanceTimersByTimeAsync(20_000);
    const outcome = await promise;
    expect(outcome.kind).toBe("results_pending");
    if (outcome.kind === "results_pending") {
      expect(outcome.data.status).toBe("finished");
    }
  });

  it("treats failed as terminal immediately even with null results", async () => {
    const api = apiReturning({ id: 1, status: "failed", results: null });
    const outcome = await pollUntilDone({
      api,
      path: "/iq/keyword_search/1",
      settle: { resultsKey: "results" },
    });
    expect(outcome.kind).toBe("terminal");
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("treats finished+null results as terminal when settle is not configured", async () => {
    const api = apiReturning({ id: 1, status: "finished", results: null });
    const outcome = await pollUntilDone({ api, path: "/x" });
    expect(outcome.kind).toBe("terminal");
  });

  it("grants the settle window even when finishing near maxMs (additive)", async () => {
    const api = {
      get: vi
        .fn()
        .mockResolvedValueOnce({ status: "started" })
        .mockResolvedValue({ status: "finished", results: null }),
    };
    const promise = pollUntilDone({
      api,
      path: "/x",
      maxMs: 6_000,
      settle: { resultsKey: "results", extraMs: 15_000 },
    });
    // First GET at t=0 is "started"; finished (null results) arrives at t=5s,
    // 1s before maxMs — the settle clock still gets its full 15s.
    await vi.advanceTimersByTimeAsync(30_000);
    const outcome = await promise;
    expect(outcome.kind).toBe("results_pending");
    expect(api.get.mock.calls.length).toBeGreaterThan(2);
  });

  it("returns timeout when never terminal", async () => {
    const api = apiReturning({ status: "started" });
    const promise = pollUntilDone({ api, path: "/x", maxMs: 12_000 });
    await vi.advanceTimersByTimeAsync(20_000);
    const outcome = await promise;
    expect(outcome.kind).toBe("timeout");
  });

  it("reads status through recordKey with root fallback", async () => {
    const api = apiReturning({
      keyword_search: { status: "finished", results: { ok: true } },
    });
    const outcome = await pollUntilDone({
      api,
      path: "/x",
      recordKey: "keyword_search",
      settle: { resultsKey: "results" },
    });
    expect(outcome.kind).toBe("terminal");
  });

  it("honors custom terminal/settle statuses (experts)", async () => {
    const api = apiReturning(
      { status: "completed", expert_results: null },
      { status: "completed", expert_results: [{ id: 1 }] },
    );
    const promise = pollUntilDone({
      api,
      path: "/search/1",
      terminalStatuses: ["completed", "failed"],
      settle: { resultsKey: "expert_results", statuses: ["completed"] },
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const outcome = await promise;
    expect(outcome.kind).toBe("terminal");
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

describe("resultsPendingPayload / annotateResultsPending", () => {
  it("builds a non-finished payload pointing at the retry tool", () => {
    const payload = resultsPendingPayload(42, "get_keyword_search");
    expect(payload.status).toBe("results_pending");
    expect(payload.id).toBe(42);
    expect(payload.message).toContain("get_keyword_search");
  });

  it("flags success-status responses with null results", () => {
    const annotated = annotateResultsPending(
      { id: 1, status: "finished", results: null },
      { resultsKey: "results", retryTool: "get_keyword_search" },
    ) as Record<string, unknown>;
    expect(annotated.results_pending).toBe(true);
    expect(annotated.results_pending_note).toContain("get_keyword_search");
  });

  it("leaves complete or non-success responses untouched", () => {
    const done = { id: 1, status: "finished", results: { data: [] } };
    expect(annotateResultsPending(done, { resultsKey: "results", retryTool: "t" })).toBe(done);
    const running = { id: 1, status: "started", results: null };
    expect(annotateResultsPending(running, { resultsKey: "results", retryTool: "t" })).toBe(running);
    const failed = { id: 1, status: "failed", results: null };
    expect(annotateResultsPending(failed, { resultsKey: "results", retryTool: "t" })).toBe(failed);
  });
});

describe("serializeCapped", () => {
  it("returns small payloads byte-for-byte unchanged", () => {
    const data = { id: 1, results: { data: [1, 2, 3] } };
    expect(serializeCapped(data)).toBe(JSON.stringify(data, null, 2));
    expect(serializeCapped(data)).not.toContain("truncated");
  });

  function bigPayload() {
    return {
      id: 20978,
      status: "finished",
      sentiment: { positive: 10, negative: 5 },
      results: {
        summary: "short summary",
        data: Array.from({ length: 200 }, (_, i) => ({
          platform: i % 2 ? "facebook" : "reddit",
          text: `post ${i} ${"x".repeat(1_000)}`,
        })),
      },
    };
  }

  it("trims the largest array from the end and reports it", () => {
    setMaxResponseBytes(50_000);
    const out = serializeCapped(bigPayload());
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.truncated).toBe(true);
    const truncation = parsed.truncation as {
      max_bytes: number;
      arrays: { path: string; kept: number; dropped: number }[];
      note: string;
    };
    expect(truncation.max_bytes).toBe(50_000);
    const entry = truncation.arrays.find((a) => a.path === "results.data");
    expect(entry).toBeDefined();
    expect(entry!.kept + entry!.dropped).toBe(200);
    // Dropped from the end — surviving posts are the first N in order.
    const results = parsed.results as { data: { text: string }[] };
    expect(results.data[0].text).toContain("post 0");
    expect(results.data.length).toBe(entry!.kept);
  });

  it("stays under the cap and preserves scalar/analytics fields", () => {
    setMaxResponseBytes(50_000);
    const out = serializeCapped(bigPayload());
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(50_000);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.status).toBe("finished");
    expect(parsed.sentiment).toEqual({ positive: 10, negative: 5 });
    expect((parsed.results as Record<string, unknown>).summary).toBe("short summary");
  });

  it("is deterministic", () => {
    setMaxResponseBytes(50_000);
    expect(serializeCapped(bigPayload())).toBe(serializeCapped(bigPayload()));
  });

  it("trims to the keep floor but never below it", () => {
    // Budget (4000 - reserve) forces the array from 10 down to exactly the
    // floor of 3 — trimming further would fit tighter but is not allowed.
    setMaxResponseBytes(4_000);
    const data = {
      big: Array.from({ length: 10 }, () => "y".repeat(500)),
    };
    const parsed = JSON.parse(serializeCapped(data)) as { big: string[] };
    expect(parsed.big.length).toBe(3);

    // When even the floor cannot fit, the helper switches to the scalar
    // fallback rather than emptying the array.
    setMaxResponseBytes(2_000);
    const fallback = JSON.parse(serializeCapped(data)) as Record<string, unknown>;
    expect(fallback.truncated).toBe(true);
    expect(fallback.big).toBeUndefined();
  });

  it("falls back to scalar fields when arrays cannot shrink enough", () => {
    setMaxResponseBytes(2_000);
    const data = {
      id: 7,
      status: "finished",
      report: "z".repeat(50_000),
      small: [1, 2],
    };
    const parsed = JSON.parse(serializeCapped(data)) as Record<string, unknown>;
    expect(parsed.truncated).toBe(true);
    expect(parsed.id).toBe(7);
    expect(parsed.status).toBe("finished");
    expect((parsed.report as string).length).toBeLessThan(5_000);
  });

  it("wraps a root array in items when truncating", () => {
    setMaxResponseBytes(2_000);
    const data = Array.from({ length: 50 }, () => "w".repeat(200));
    const parsed = JSON.parse(serializeCapped(data)) as Record<string, unknown>;
    expect(parsed.truncated).toBe(true);
    expect(Array.isArray(parsed.items)).toBe(true);
  });

  it("honors an explicit maxBytes argument", () => {
    const data = { list: Array.from({ length: 100 }, () => "v".repeat(100)) };
    const out = serializeCapped(data, 3_000);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(3_000);
  });

  it("accepts 140,000 bytes by default, just under the claude.ai tool-result limit", () => {
    expect(DEFAULT_MAX_RESPONSE_BYTES).toBe(140_000);
    setMaxResponseBytes(DEFAULT_MAX_RESPONSE_BYTES);
    const data = { list: Array.from({ length: 130 }, () => "u".repeat(1_000)) };
    const full = JSON.stringify(data, null, 2);
    expect(new TextEncoder().encode(full).length).toBeGreaterThan(100_000);
    expect(serializeCapped(data)).toBe(full);
    const over = { list: Array.from({ length: 150 }, () => "u".repeat(1_000)) };
    const out = serializeCapped(over);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(140_000);
    expect((JSON.parse(out) as { truncated: boolean }).truncated).toBe(true);
  });

  it("opens with the truncation report and sums it up in one line", () => {
    setMaxResponseBytes(50_000);
    const parsed = JSON.parse(serializeCapped(bigPayload())) as Record<string, unknown>;
    expect(Object.keys(parsed).slice(0, 2)).toEqual(["truncated", "truncation"]);
    const truncation = parsed.truncation as { summary: string; arrays: { kept: number; dropped: number }[] };
    expect(Object.keys(truncation)[0]).toBe("summary");
    const [entry] = truncation.arrays;
    expect(truncation.summary).toBe(
      `Cut to fit 50000 bytes: results.data shows ${entry.kept} of ${entry.kept + entry.dropped}.`,
    );
  });

  it("declares the Claude Code result-size annotation for large-result tools", () => {
    expect(LARGE_RESULT_META).toEqual({ "anthropic/maxResultSizeChars": 150_000 });
  });
});

describe("describePostsPage", () => {
  it("returns null without backend counts", () => {
    const data = { posts: [{ id: 1 }] };
    expect(describePostsPage(data, serializeCapped(data))).toBeNull();
  });

  it("names the page, the remainder and the next offset", () => {
    const data = { posts: [{ id: 1 }, { id: 2 }], total: 10, returned: 2, offset: 4, limit: 2 };
    expect(describePostsPage(data, serializeCapped(data))).toBe(
      "Showing 2 of 10 posts (offset 4). 4 more: call again with offset=6.",
    );
  });

  it("says when the page is the last one", () => {
    const data = { posts: [{ id: 1 }], total: 5, returned: 1, offset: 4, limit: null };
    expect(describePostsPage(data, serializeCapped(data))).toBe(
      "Showing 1 of 5 posts (offset 4). This is the last page.",
    );
  });

  it("counts the posts the cap dropped and suggests the lean field set", () => {
    const data = {
      posts: Array.from({ length: 40 }, (_, i) => ({ id: i, text: "t".repeat(200) })),
      total: 40,
      returned: 40,
      offset: 0,
      limit: null,
    };
    const serialized = serializeCapped(data, 3_000);
    const kept = (JSON.parse(serialized) as { posts: unknown[] }).posts.length;
    expect(kept).toBeLessThan(40);
    expect(describePostsPage(data, serialized)).toBe(
      `Showing ${kept} of 40 posts (offset 0). ${40 - kept} of the 40 posts fetched were dropped ` +
        `to fit the 3000-byte response cap. ${40 - kept} more: call again with offset=${kept} ` +
        `(add fields="lean" to fit more per page).`,
    );
  });

  it("drops the lean hint when the page is already lean, and shows 0 when the fallback removed every post", () => {
    const lean = {
      posts: Array.from({ length: 40 }, (_, i) => ({ id: i, text: "t".repeat(200) })),
      total: 40,
      returned: 40,
      offset: 0,
      limit: null,
      fields: "lean",
    };
    expect(describePostsPage(lean, serializeCapped(lean, 3_000))).not.toContain("lean");

    const fallback = { posts: [{ text: "x".repeat(5_000) }, { text: "y".repeat(5_000) }], total: 2, returned: 2, offset: 0, limit: null };
    const serialized = serializeCapped(fallback, 2_000);
    expect((JSON.parse(serialized) as { posts?: unknown }).posts).toBeUndefined();
    expect(describePostsPage(fallback, serialized)).toBe(
      "Showing 0 of 2 posts (offset 0). 2 of the 2 posts fetched were dropped to fit the " +
        "2000-byte response cap. 2 more: call again with offset=0 (add fields=\"lean\" to fit more per page).",
    );
  });
});

describe("preflightCredits", () => {
  it("passes when the balance covers the requirement", async () => {
    const api = { get: vi.fn().mockResolvedValue({ available_credits: 5 }) };
    await expect(preflightCredits(api, 2)).resolves.toEqual({
      sufficient: true,
      available: 5,
    });
    expect(api.get).toHaveBeenCalledWith("/iq/credits");
  });

  it("fails with required vs available when short", async () => {
    const api = { get: vi.fn().mockResolvedValue({ available_credits: 1 }) };
    await expect(preflightCredits(api, 3)).resolves.toEqual({
      sufficient: false,
      available: 1,
      required: 3,
    });
  });

  it("fails open when the endpoint errors", async () => {
    const api = { get: vi.fn().mockRejectedValue(new Error("500")) };
    await expect(preflightCredits(api, 3)).resolves.toEqual({
      sufficient: true,
      available: null,
    });
  });

  it("fails open on an unexpected shape", async () => {
    const api = { get: vi.fn().mockResolvedValue({ nope: true }) };
    await expect(preflightCredits(api, 3)).resolves.toEqual({
      sufficient: true,
      available: null,
    });
  });
});

describe("insufficientCreditsPayload", () => {
  it("names both numbers", () => {
    const payload = insufficientCreditsPayload(3, 1);
    expect(payload.error).toBe("insufficient_credits");
    expect(payload.required_credits).toBe(3);
    expect(payload.available_credits).toBe(1);
    expect(payload.message).toContain("3");
    expect(payload.message).toContain("1");
  });
});

describe("mergeUsageAndCredits", () => {
  it("merges a fulfilled credits fetch", () => {
    const merged = mergeUsageAndCredits(
      { searches_count: 2 },
      {
        status: "fulfilled",
        value: {
          available_credits: 12,
          credits_limit: 200,
          period_reset_date: "2026-09-01",
        },
      },
    );
    expect(merged.searches_count).toBe(2);
    expect(merged.credits).toEqual({
      credits_remaining: 12,
      credits_limit: 200,
      period_reset_date: "2026-09-01",
    });
    expect(merged.credits_note).toBeTruthy();
  });

  it("nulls missing fields from an older backend", () => {
    const merged = mergeUsageAndCredits(
      { searches_count: 2 },
      { status: "fulfilled", value: { available_credits: 12 } },
    );
    expect(merged.credits).toEqual({
      credits_remaining: 12,
      credits_limit: null,
      period_reset_date: null,
    });
  });

  it("degrades to credits_error when the credits fetch fails", () => {
    const merged = mergeUsageAndCredits(
      { searches_count: 2 },
      { status: "rejected", reason: new Error("boom") },
    );
    expect(merged.searches_count).toBe(2);
    expect(merged.credits).toBeUndefined();
    expect(merged.credits_error).toBe("boom");
  });
});

describe("stripReportHtml", () => {
  it("removes result.report_html and keeps everything else", () => {
    const stripped = stripReportHtml({
      id: "r1",
      result: { report_html: "<html>", report_markdown: "# md" },
    }) as { result: Record<string, unknown> };
    expect(stripped.result.report_html).toBeUndefined();
    expect(stripped.result.report_markdown).toBe("# md");
  });

  it("passes through payloads without report_html", () => {
    const data = { id: "r1", result: { report_markdown: "# md" } };
    expect(stripReportHtml(data)).toBe(data);
    expect(stripReportHtml(null)).toBe(null);
  });
});
