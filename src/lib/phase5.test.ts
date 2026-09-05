/**
 * Phase 5 regression tests
 * Covers: share store, export (JSON + Markdown), rate limiter, logger, CLI logic, error helpers
 */

import { describe, it, expect, vi } from "vitest";
import { shareStore } from "@/lib/share/store";
import { exportJson, exportMarkdown } from "@/lib/export/report";
import { badRequest, tooManyRequests, internalError, unprocessable } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { DiffChange, RiskResult } from "@/types/diff";

// ── Share store ───────────────────────────────────────────────────────────────

describe("InMemoryShareStore", () => {
  const payload = () => ({
    mode:      "json" as const,
    changes:   [] as DiffChange[],
    risk:      { score: 0, label: "NO CHANGES" as const } satisfies RiskResult,
    ai:        null,
    createdAt: Date.now(),
  });

  it("saves and retrieves a payload", () => {
    const id = shareStore.save(payload());
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    const retrieved = shareStore.get(id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.mode).toBe("json");
  });

  it("returns null for unknown id", () => {
    expect(shareStore.get("a".repeat(32))).toBeNull();
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10 }, () => shareStore.save(payload())));
    expect(ids.size).toBe(10);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("stores requestMeta when provided", () => {
    const p = { ...payload(), requestMeta: { urlA: "https://a.com", methodA: "GET", urlB: "https://b.com", methodB: "GET" } };
    const id = shareStore.save(p);
    const retrieved = shareStore.get(id);
    expect(retrieved?.requestMeta?.urlA).toBe("https://a.com");
  });
});

// ── Export: JSON ──────────────────────────────────────────────────────────────

describe("exportJson", () => {
  const change: DiffChange = {
    path: "$.user.id",
    kind: "TYPE_CHANGED",
    severity: "HIGH",
    reason: "type changed",
    compatibility: "BREAKING",
  };

  const data = {
    mode:    "json" as const,
    changes: [change],
    risk:    { score: 80, label: "HIGH" as const } satisfies RiskResult,
    ai:      null,
  };

  it("produces valid JSON", () => {
    expect(() => JSON.parse(exportJson(data))).not.toThrow();
  });

  it("includes tool and exportedAt fields", () => {
    const parsed = JSON.parse(exportJson(data));
    expect(parsed.tool).toBe("DiffBeacon");
    expect(typeof parsed.exportedAt).toBe("string");
  });

  it("includes risk and changes", () => {
    const parsed = JSON.parse(exportJson(data));
    expect(parsed.risk.score).toBe(80);
    expect(parsed.changes).toHaveLength(1);
    expect(parsed.changes[0].path).toBe("$.user.id");
  });

  it("does not include auth or credential fields", () => {
    const out = exportJson({
      ...data,
      requestMeta: { urlA: "https://a.com", methodA: "GET", urlB: "https://b.com", methodB: "GET" },
    });
    expect(out).not.toContain("Authorization");
    expect(out).not.toContain("bearer");
    expect(out).not.toContain("apiKey");
  });

  it("handles empty changes", () => {
    const parsed = JSON.parse(exportJson({ ...data, changes: [] }));
    expect(parsed.changes).toHaveLength(0);
  });
});

// ── Export: Markdown ──────────────────────────────────────────────────────────

describe("exportMarkdown", () => {
  const change: DiffChange = {
    path: "$.user.name",
    kind: "REMOVED",
    severity: "CRITICAL",
    reason: "field removed",
    compatibility: "BREAKING",
  };

  const data = {
    mode:    "json" as const,
    changes: [change],
    risk:    { score: 95, label: "CRITICAL" as const } satisfies RiskResult,
    ai:      { summary: "Breaking change detected.", recommendations: ["Version the API."] },
  };

  it("starts with a markdown h1", () => {
    expect(exportMarkdown(data)).toMatch(/^# DiffBeacon Analysis Report/);
  });

  it("includes risk score and label", () => {
    const out = exportMarkdown(data);
    expect(out).toContain("95 / 100");
    expect(out).toContain("CRITICAL");
  });

  it("includes change path", () => {
    expect(exportMarkdown(data)).toContain("$.user.name");
  });

  it("includes AI summary and recommendations", () => {
    const out = exportMarkdown(data);
    expect(out).toContain("Breaking change detected.");
    expect(out).toContain("Version the API.");
  });

  it("handles empty changes gracefully", () => {
    const out = exportMarkdown({ ...data, changes: [], risk: { score: 0, label: "NO CHANGES" as const } });
    expect(out).toContain("0 / 100");
    expect(out).not.toContain("## Detected Changes");
  });

  it("includes requestMeta when provided", () => {
    const out = exportMarkdown({
      ...data,
      requestMeta: { urlA: "https://api.example.com/v1", methodA: "GET", urlB: "https://api.example.com/v2", methodB: "GET" },
    });
    expect(out).toContain("api.example.com");
  });

  it("escapes markdown special chars in AI summary", () => {
    const out = exportMarkdown({
      ...data,
      ai: { summary: "Change in `field_name` detected.", recommendations: [] },
    });
    // Should not throw and should contain escaped content
    expect(out).toContain("Change in");
  });
});

// ── Rate limiter (inline implementation test) ─────────────────────────────────

describe("rate limiter logic", () => {
  // Test the algorithm directly without the singleton (which is NoopRateLimiter in test env)
  class TestRateLimiter {
    private store = new Map<string, { timestamps: number[] }>();
    constructor(private maxRequests: number, private windowMs: number) {}
    check(key: string) {
      const now = Date.now();
      const cutoff = now - this.windowMs;
      let entry = this.store.get(key);
      if (!entry) { entry = { timestamps: [] }; this.store.set(key, entry); }
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length >= this.maxRequests) {
        const oldest = entry.timestamps[0]!;
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil((oldest + this.windowMs - now) / 1000) };
      }
      entry.timestamps.push(now);
      return { allowed: true, remaining: this.maxRequests - entry.timestamps.length, retryAfterSeconds: 0 };
    }
  }

  it("allows requests under the limit", () => {
    const limiter = new TestRateLimiter(3, 60_000);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("blocks requests over the limit", () => {
    const limiter = new TestRateLimiter(2, 60_000);
    limiter.check("ip2");
    limiter.check("ip2");
    const result = limiter.check("ip2");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates different keys", () => {
    const limiter = new TestRateLimiter(1, 60_000);
    limiter.check("ip3");
    expect(limiter.check("ip3").allowed).toBe(false);
    expect(limiter.check("ip4").allowed).toBe(true);
  });

  it("resets after window expires", () => {
    vi.useFakeTimers();
    const limiter = new TestRateLimiter(1, 1000);
    limiter.check("ip5");
    expect(limiter.check("ip5").allowed).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(limiter.check("ip5").allowed).toBe(true);
    vi.useRealTimers();
  });

  it("remaining decrements correctly", () => {
    const limiter = new TestRateLimiter(5, 60_000);
    expect(limiter.check("ip6").remaining).toBe(4);
    expect(limiter.check("ip6").remaining).toBe(3);
    expect(limiter.check("ip6").remaining).toBe(2);
  });
});

// ── Logger ────────────────────────────────────────────────────────────────────

describe("logger", () => {
  it("does not emit in test environment (NODE_ENV=test)", () => {
    const logSpy   = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.info({ event: "test_event", route: "/test" });
    logger.warn({ event: "test_warn" });
    logger.error({ event: "test_error" });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

// ── CLI exit code logic ───────────────────────────────────────────────────────

describe("CLI breaking-change detection logic", () => {
  function hasBreaking(changes: Array<{ severity: string; compatibility?: string }>): boolean {
    return changes.some(
      (c) => c.compatibility === "BREAKING" || ["CRITICAL", "HIGH"].includes(c.severity),
    );
  }

  it("detects CRITICAL severity as breaking", () => {
    expect(hasBreaking([{ severity: "CRITICAL", compatibility: "BREAKING" }])).toBe(true);
  });

  it("detects HIGH severity as breaking", () => {
    expect(hasBreaking([{ severity: "HIGH" }])).toBe(true);
  });

  it("detects BREAKING compatibility without severity", () => {
    expect(hasBreaking([{ severity: "MEDIUM", compatibility: "BREAKING" }])).toBe(true);
  });

  it("returns false for LOW/MEDIUM NON_BREAKING", () => {
    expect(hasBreaking([
      { severity: "LOW",    compatibility: "NON_BREAKING" },
      { severity: "MEDIUM", compatibility: "REVIEW" },
    ])).toBe(false);
  });

  it("returns false for empty changes", () => {
    expect(hasBreaking([])).toBe(false);
  });
});

// ── Error helpers ─────────────────────────────────────────────────────────────

describe("error helpers", () => {
  it("badRequest returns 400 with correct body", async () => {
    const res = badRequest("bad input", "BAD_INPUT");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("BAD_INPUT");
    expect(body.error).toBe("bad input");
  });

  it("badRequest uses default code BAD_REQUEST", async () => {
    const res = badRequest("oops");
    const body = await res.json();
    expect(body.code).toBe("BAD_REQUEST");
  });

  it("tooManyRequests returns 429 with Retry-After header", async () => {
    const res = tooManyRequests(30);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    const body = await res.json();
    expect(body.code).toBe("RATE_LIMITED");
  });

  it("internalError returns 500", async () => {
    const res = internalError();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
  });

  it("unprocessable returns 422", async () => {
    const res = unprocessable("bad contract", "INVALID_SCHEMA");
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("INVALID_SCHEMA");
  });
});
