import { describe, it, expect } from "vitest";
import { diffJson, calculateRisk } from "@/lib/diff/engine";

// ─── helpers ────────────────────────────────────────────────────────────────

function diff(a: unknown, b: unknown) {
  return diffJson(a, b);
}

function risk(a: unknown, b: unknown) {
  return calculateRisk(diff(a, b));
}

// ─── TEST 1 — Identical JSON ─────────────────────────────────────────────────

describe("identical JSON", () => {
  const obj = { user: { id: 123, name: "Abubakar" } };

  it("produces no changes", () => {
    expect(diff(obj, obj)).toHaveLength(0);
  });

  it("risk score is 0 with label NO CHANGES", () => {
    expect(risk(obj, obj)).toEqual({ score: 0, label: "NO CHANGES" });
  });
});

// ─── TEST 2 — Property Added ─────────────────────────────────────────────────

describe("property added", () => {
  const a = { user: { id: 123 } };
  const b = { user: { id: 123, country: "Pakistan" } };
  const changes = diff(a, b);

  it("detects one ADDED change at $.user.country", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.country", kind: "ADDED" });
  });

  it("severity is LOW", () => {
    expect(changes[0].severity).toBe("LOW");
  });

  it("is not a breaking change (risk label LOW)", () => {
    expect(calculateRisk(changes).label).toBe("LOW");
  });
});

// ─── TEST 3 — Property Removed ───────────────────────────────────────────────

describe("property removed", () => {
  const a = { user: { id: 123, name: "Abubakar" } };
  const b = { user: { id: 123 } };
  const changes = diff(a, b);

  it("detects one REMOVED change at $.user.name", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.name", kind: "REMOVED" });
  });

  it("severity is CRITICAL", () => {
    expect(changes[0].severity).toBe("CRITICAL");
  });

  it("is a breaking change (risk score 90, label CRITICAL)", () => {
    const r = calculateRisk(changes);
    expect(r.score).toBe(90);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── TEST 4 — Type Changed ───────────────────────────────────────────────────

describe("type changed", () => {
  const a = { user: { id: 123 } };
  const b = { user: { id: "123" } };
  const changes = diff(a, b);

  it("detects one TYPE_CHANGED at $.user.id", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.id", kind: "TYPE_CHANGED" });
  });

  it("severity is HIGH", () => {
    expect(changes[0].severity).toBe("HIGH");
  });

  it("is a breaking change (risk score 60, label HIGH)", () => {
    const r = calculateRisk(changes);
    expect(r.score).toBe(60);
    expect(r.label).toBe("HIGH");
  });
});

// ─── TEST 5 — Value Changed ───────────────────────────────────────────────────

describe("value changed", () => {
  const a = { user: { name: "Abubakar" } };
  const b = { user: { name: "Ali" } };
  const changes = diff(a, b);

  it("detects one CHANGED at $.user.name", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.name", kind: "CHANGED" });
  });

  it("severity is MEDIUM", () => {
    expect(changes[0].severity).toBe("MEDIUM");
  });

  it("is not breaking (risk label MEDIUM)", () => {
    expect(calculateRisk(changes).label).toBe("MEDIUM");
  });
});

// ─── TEST 6 — Deeply Nested Object ───────────────────────────────────────────

describe("deeply nested object", () => {
  const a = { a: { b: { c: { d: 1 } } } };
  const b = { a: { b: { c: { d: 2 } } } };

  it("reports the full nested path", () => {
    const changes = diff(a, b);
    expect(changes).toHaveLength(1);
    expect(changes[0].path).toBe("$.a.b.c.d");
    expect(changes[0].kind).toBe("CHANGED");
  });
});

// ─── TEST 7 — Array Item Added ────────────────────────────────────────────────

describe("array item added", () => {
  const a = { items: [1, 2] };
  const b = { items: [1, 2, 3] };
  const changes = diff(a, b);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports ADDED for the new item at index 2", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$.items[2]")).toBe(true);
  });
});

// ─── TEST 8 — Array Item Removed ─────────────────────────────────────────────

describe("array item removed", () => {
  const a = { items: [1, 2, 3] };
  const b = { items: [1, 2] };
  const changes = diff(a, b);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports REMOVED for the missing item at index 2", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$.items[2]")).toBe(true);
  });
});

// ─── TEST 9 — Null vs Value ───────────────────────────────────────────────────

describe("null vs value", () => {
  it("null → string is TYPE_CHANGED HIGH", () => {
    const changes = diff({ v: null }, { v: "hello" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "TYPE_CHANGED", severity: "HIGH" });
  });

  it("string → null is TYPE_CHANGED HIGH", () => {
    const changes = diff({ v: "hello" }, { v: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "TYPE_CHANGED", severity: "HIGH" });
  });
});

// ─── TEST 10 — Mixed Changes ──────────────────────────────────────────────────

describe("mixed changes", () => {
  const a = { id: 1, name: "Abubakar", role: "admin", score: 10 };
  const b = { id: "1", name: "Ali", extra: true };
  const changes = diff(a, b);

  it("detects TYPE_CHANGED for id", () => {
    expect(changes.some((c) => c.path === "$.id" && c.kind === "TYPE_CHANGED")).toBe(true);
  });

  it("detects CHANGED for name", () => {
    expect(changes.some((c) => c.path === "$.name" && c.kind === "CHANGED")).toBe(true);
  });

  it("detects REMOVED for role", () => {
    expect(changes.some((c) => c.path === "$.role" && c.kind === "REMOVED")).toBe(true);
  });

  it("detects REMOVED for score", () => {
    expect(changes.some((c) => c.path === "$.score" && c.kind === "REMOVED")).toBe(true);
  });

  it("detects ADDED for extra", () => {
    expect(changes.some((c) => c.path === "$.extra" && c.kind === "ADDED")).toBe(true);
  });

  it("overall risk is CRITICAL due to REMOVED property", () => {
    expect(calculateRisk(changes).label).toBe("CRITICAL");
  });
});

// ─── Risk score behavior ──────────────────────────────────────────────────────

describe("calculateRisk score boundaries", () => {
  it("single LOW change → score 10, label LOW", () => {
    const r = calculateRisk(diff({ a: 1 }, { a: 1, b: 2 }));
    expect(r).toEqual({ score: 10, label: "LOW" });
  });

  it("single MEDIUM change → score 30, label MEDIUM", () => {
    const r = calculateRisk(diff({ a: "x" }, { a: "y" }));
    expect(r).toEqual({ score: 30, label: "MEDIUM" });
  });

  it("single HIGH change → score 60, label HIGH", () => {
    const r = calculateRisk(diff({ a: 1 }, { a: "1" }));
    expect(r).toEqual({ score: 60, label: "HIGH" });
  });

  it("single CRITICAL change → score 90, label CRITICAL", () => {
    const r = calculateRisk(diff({ a: 1 }, {}));
    expect(r).toEqual({ score: 90, label: "CRITICAL" });
  });

  it("score is capped at 100", () => {
    // Multiple CRITICAL changes still cap at 100
    const changes = diff({ a: 1, b: 2, c: 3 }, {});
    expect(calculateRisk(changes).score).toBe(90); // max of weights, not sum
  });
});

// ─── Deterministic behavior ───────────────────────────────────────────────────

describe("deterministic output", () => {
  const a = { user: { id: 1, name: "Abubakar", role: "admin" } };
  const b = { user: { id: "1", email: "a@b.com" } };

  it("produces identical results across multiple runs", () => {
    const results = Array.from({ length: 5 }, () => diff(a, b));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("empty objects produce no changes", () => {
    expect(diff({}, {})).toHaveLength(0);
  });

  it("empty arrays produce no changes", () => {
    expect(diff([], [])).toHaveLength(0);
  });

  it("nested empty objects produce no changes", () => {
    expect(diff({ a: {} }, { a: {} })).toHaveLength(0);
  });

  it("boolean true → false is CHANGED MEDIUM", () => {
    const changes = diff({ flag: true }, { flag: false });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "CHANGED", severity: "MEDIUM" });
  });

  it("boolean → number is TYPE_CHANGED HIGH", () => {
    const changes = diff({ v: true }, { v: 1 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "TYPE_CHANGED", severity: "HIGH" });
  });

  it("number change is CHANGED MEDIUM", () => {
    const changes = diff({ count: 5 }, { count: 10 });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "CHANGED", severity: "MEDIUM" });
  });

  it("object → array at same path is TYPE_CHANGED HIGH", () => {
    const changes = diff({ data: {} }, { data: [] });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "TYPE_CHANGED", severity: "HIGH" });
  });
});
