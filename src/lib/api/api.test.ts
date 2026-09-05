import { describe, it, expect, vi, afterEach } from "vitest";
import { isBlockedIPv4, isBlockedIPv6, isBlockedIP, assertSafeHostname } from "@/lib/api/ssrf";
import { validateHeaders, buildOutboundHeaders, filterResponseHeaders } from "@/lib/api/headers";
import { apiRequestConfigSchema } from "@/lib/api/validation";
import { compareStatus, classifyStatusChange } from "@/lib/diff/status";

// ─── SSRF — IPv4 blocking ─────────────────────────────────────────────────────

describe("isBlockedIPv4", () => {
  it("blocks loopback 127.0.0.1", () => expect(isBlockedIPv4("127.0.0.1")).toBe(true));
  it("blocks loopback 127.0.0.2", () => expect(isBlockedIPv4("127.0.0.2")).toBe(true));
  it("blocks private 10.0.0.1",   () => expect(isBlockedIPv4("10.0.0.1")).toBe(true));
  it("blocks private 10.255.255.255", () => expect(isBlockedIPv4("10.255.255.255")).toBe(true));
  it("blocks private 172.16.0.1", () => expect(isBlockedIPv4("172.16.0.1")).toBe(true));
  it("blocks private 172.31.255.255", () => expect(isBlockedIPv4("172.31.255.255")).toBe(true));
  it("blocks private 192.168.1.1", () => expect(isBlockedIPv4("192.168.1.1")).toBe(true));
  it("blocks link-local 169.254.0.1", () => expect(isBlockedIPv4("169.254.0.1")).toBe(true));
  it("blocks metadata 169.254.169.254", () => expect(isBlockedIPv4("169.254.169.254")).toBe(true));
  it("blocks 0.0.0.0",            () => expect(isBlockedIPv4("0.0.0.0")).toBe(true));
  it("blocks CGNAT 100.64.0.1",   () => expect(isBlockedIPv4("100.64.0.1")).toBe(true));
  it("allows public 8.8.8.8",     () => expect(isBlockedIPv4("8.8.8.8")).toBe(false));
  it("allows public 1.1.1.1",     () => expect(isBlockedIPv4("1.1.1.1")).toBe(false));
  it("allows public 93.184.216.34", () => expect(isBlockedIPv4("93.184.216.34")).toBe(false));
});

// ─── SSRF — IPv6 blocking ─────────────────────────────────────────────────────

describe("isBlockedIPv6", () => {
  it("blocks loopback ::1",          () => expect(isBlockedIPv6("::1")).toBe(true));
  it("blocks unspecified ::",        () => expect(isBlockedIPv6("::")).toBe(true));
  it("blocks IPv4-mapped ::ffff:127.0.0.1", () => expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true));
  it("blocks link-local fe80::1",    () => expect(isBlockedIPv6("fe80::1")).toBe(true));
  it("blocks unique-local fc00::1",  () => expect(isBlockedIPv6("fc00::1")).toBe(true));
  it("blocks unique-local fd00::1",  () => expect(isBlockedIPv6("fd00::1")).toBe(true));
  it("blocks multicast ff02::1",     () => expect(isBlockedIPv6("ff02::1")).toBe(true));
});

// ─── SSRF — isBlockedIP dispatch ─────────────────────────────────────────────

describe("isBlockedIP", () => {
  it("routes IPv4 correctly", () => expect(isBlockedIP("127.0.0.1")).toBe(true));
  it("routes IPv6 correctly", () => expect(isBlockedIP("::1")).toBe(true));
  it("allows public IPv4",    () => expect(isBlockedIP("8.8.8.8")).toBe(false));
});

// ─── SSRF — assertSafeHostname (DNS mocked) ───────────────────────────────────
// vi.mock must be at module scope; Vitest hoists it before imports.

vi.mock("dns", () => ({
  default: {
    promises: {
      lookup: vi.fn(),
    },
  },
}));

describe("assertSafeHostname", () => {
  afterEach(() => vi.restoreAllMocks());

  it("blocks bare 127.0.0.1 without DNS", async () => {
    await expect(assertSafeHostname("127.0.0.1")).rejects.toThrow(/private or reserved/i);
  });

  it("blocks bare ::1 without DNS", async () => {
    await expect(assertSafeHostname("::1")).rejects.toThrow(/private or reserved/i);
  });

  async function mockLookup(addresses: { address: string; family: number }[]) {
    const dns = await import("dns");
    vi.mocked(dns.default.promises.lookup).mockResolvedValue(addresses as never);
  }

  it("blocks hostname that resolves to private IP", async () => {
    await mockLookup([{ address: "192.168.1.1", family: 4 }]);
    await expect(assertSafeHostname("internal.corp")).rejects.toThrow(/private or reserved/i);
  });

  it("blocks hostname that resolves to metadata IP", async () => {
    await mockLookup([{ address: "169.254.169.254", family: 4 }]);
    await expect(assertSafeHostname("metadata.internal")).rejects.toThrow(/private or reserved/i);
  });

  it("blocks hostname where one of multiple resolved IPs is private (DNS rebinding)", async () => {
    await mockLookup([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.1",      family: 4 },
    ]);
    await expect(assertSafeHostname("rebind.example.com")).rejects.toThrow(/private or reserved/i);
  });

  it("allows hostname that resolves to public IP", async () => {
    await mockLookup([{ address: "93.184.216.34", family: 4 }]);
    await expect(assertSafeHostname("safe.example.com")).resolves.toBeUndefined();
  });

  it("throws on DNS failure", async () => {
    const dns = await import("dns");
    vi.mocked(dns.default.promises.lookup).mockRejectedValue(new Error("ENOTFOUND"));
    await expect(assertSafeHostname("fail.example.com")).rejects.toThrow(/DNS resolution failed/i);
  });
});

// ─── Header validation ────────────────────────────────────────────────────────

describe("validateHeaders", () => {
  it("accepts valid headers", () => {
    expect(validateHeaders({ "Content-Type": "application/json", "X-Custom": "value" })).toHaveLength(0);
  });

  it("rejects header name with CR/LF injection", () => {
    const errors = validateHeaders({ "Bad\r\nHeader": "value" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects header value with CR injection", () => {
    const errors = validateHeaders({ "X-Test": "value\rinjected" });
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects header value with LF injection", () => {
    const errors = validateHeaders({ "X-Test": "value\ninjected" });
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── buildOutboundHeaders ─────────────────────────────────────────────────────

describe("buildOutboundHeaders", () => {
  it("adds Bearer token when auth type is bearer", () => {
    const headers = buildOutboundHeaders({}, { type: "bearer", token: "tok123" });
    expect(headers["Authorization"]).toBe("Bearer tok123");
  });

  it("does not add Authorization when auth type is none", () => {
    const headers = buildOutboundHeaders({}, { type: "none" });
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("strips hop-by-hop headers", () => {
    const headers = buildOutboundHeaders({ "connection": "keep-alive", "X-Custom": "ok" }, { type: "none" });
    expect(headers["connection"]).toBeUndefined();
    expect(headers["X-Custom"]).toBe("ok");
  });
});

// ─── filterResponseHeaders ────────────────────────────────────────────────────

describe("filterResponseHeaders", () => {
  function makeHeaders(obj: Record<string, string>): Headers {
    return new Headers(obj);
  }

  it("passes through safe headers", () => {
    const result = filterResponseHeaders(makeHeaders({ "content-type": "application/json", "cache-control": "no-cache" }));
    expect(result["content-type"]).toBe("application/json");
    expect(result["cache-control"]).toBe("no-cache");
  });

  it("strips Set-Cookie", () => {
    const result = filterResponseHeaders(makeHeaders({ "set-cookie": "session=abc", "content-type": "application/json" }));
    expect(result["set-cookie"]).toBeUndefined();
  });

  it("strips Authorization from response", () => {
    const result = filterResponseHeaders(makeHeaders({ "authorization": "Bearer secret", "content-type": "text/plain" }));
    expect(result["authorization"]).toBeUndefined();
  });

  it("strips unknown/internal headers", () => {
    const result = filterResponseHeaders(makeHeaders({ "x-internal-trace": "abc123", "content-type": "application/json" }));
    expect(result["x-internal-trace"]).toBeUndefined();
  });
});

// ─── URL / Zod validation ─────────────────────────────────────────────────────

describe("apiRequestConfigSchema URL validation", () => {
  const base = { method: "GET" as const, headers: {}, body: null, auth: { type: "none" as const } };

  it("accepts https URL", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "https://example.com/api" })).not.toThrow();
  });

  it("accepts http URL", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "http://example.com/api" })).not.toThrow();
  });

  it("rejects file: protocol", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "file:///etc/passwd" })).toThrow();
  });

  it("rejects javascript: protocol", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "javascript:alert(1)" })).toThrow();
  });

  it("rejects ftp: protocol", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "ftp://example.com/file" })).toThrow();
  });

  it("rejects URL with embedded credentials", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "https://user:pass@example.com" })).toThrow();
  });

  it("rejects malformed URL", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "not a url" })).toThrow();
  });

  it("rejects bearer token that is empty", () => {
    expect(() => apiRequestConfigSchema.parse({ ...base, url: "https://example.com", auth: { type: "bearer", token: "" } })).toThrow();
  });
});

// ─── Status comparison ────────────────────────────────────────────────────────

describe("classifyStatusChange", () => {
  it("200 → 200 is LOW (same class, different code would be LOW)", () => {
    // Same code — compareStatus returns null; classifyStatusChange is only
    // called when codes differ. Test the 2xx→2xx branch with 200→201.
    expect(classifyStatusChange(200, 201)).toBe("LOW");
  });

  it("200 → 404 is CRITICAL", () => expect(classifyStatusChange(200, 404)).toBe("CRITICAL"));
  it("200 → 500 is CRITICAL", () => expect(classifyStatusChange(200, 500)).toBe("CRITICAL"));
  it("200 → 301 is MEDIUM",   () => expect(classifyStatusChange(200, 301)).toBe("MEDIUM"));
  it("404 → 200 is HIGH",     () => expect(classifyStatusChange(404, 200)).toBe("HIGH"));
  it("500 → 200 is HIGH",     () => expect(classifyStatusChange(500, 200)).toBe("HIGH"));
  it("400 → 401 is MEDIUM",   () => expect(classifyStatusChange(400, 401)).toBe("MEDIUM"));
  it("500 → 503 is HIGH",     () => expect(classifyStatusChange(500, 503)).toBe("HIGH"));
  it("400 → 500 is HIGH",     () => expect(classifyStatusChange(400, 500)).toBe("HIGH"));
  it("500 → 400 is MEDIUM",   () => expect(classifyStatusChange(500, 400)).toBe("MEDIUM"));
});

describe("compareStatus", () => {
  it("returns null when status codes are identical (200 → 200)", () => {
    expect(compareStatus(200, 200, "OK", "OK")).toBeNull();
  });

  it("200 → 404: returns STATUS_CHANGED with CRITICAL severity", () => {
    const change = compareStatus(200, 404, "OK", "Not Found");
    expect(change).not.toBeNull();
    expect(change!.kind).toBe("STATUS_CHANGED");
    expect(change!.severity).toBe("CRITICAL");
    expect(change!.before).toBe(200);
    expect(change!.after).toBe(404);
    expect(change!.path).toBe("$.status");
  });

  it("404 → 200: returns STATUS_CHANGED with HIGH severity", () => {
    const change = compareStatus(404, 200, "Not Found", "OK");
    expect(change).not.toBeNull();
    expect(change!.kind).toBe("STATUS_CHANGED");
    expect(change!.severity).toBe("HIGH");
    expect(change!.before).toBe(404);
    expect(change!.after).toBe(200);
  });

  it("400 → 401: returns STATUS_CHANGED with MEDIUM severity", () => {
    const change = compareStatus(400, 401, "Bad Request", "Unauthorized");
    expect(change).not.toBeNull();
    expect(change!.kind).toBe("STATUS_CHANGED");
    expect(change!.severity).toBe("MEDIUM");
  });

  it("500 → 503: returns STATUS_CHANGED with HIGH severity", () => {
    const change = compareStatus(500, 503, "Internal Server Error", "Service Unavailable");
    expect(change).not.toBeNull();
    expect(change!.kind).toBe("STATUS_CHANGED");
    expect(change!.severity).toBe("HIGH");
  });

  it("reason string includes both status codes", () => {
    const change = compareStatus(200, 500, "OK", "Internal Server Error");
    expect(change!.reason).toMatch(/200/);
    expect(change!.reason).toMatch(/500/);
  });
});
