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
  it("null → string is NULLABILITY_CHANGED LOW", () => {
    const changes = diff({ v: null }, { v: "hello" });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "NULLABILITY_CHANGED", severity: "LOW" });
  });

  it("string → null is NULLABILITY_CHANGED HIGH", () => {
    const changes = diff({ v: "hello" }, { v: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "NULLABILITY_CHANGED", severity: "HIGH" });
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
    // Multiple CRITICAL changes push toward 100 via breaking bonus.
    // 3 CRITICAL changes: base=90, breakingBonus=min(10,(3-1)*5)=10 → 100.
    const changes = diff({ a: 1, b: 2, c: 3 }, {});
    expect(calculateRisk(changes).score).toBe(100);
    expect(calculateRisk(changes).score).toBeLessThanOrEqual(100);
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

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — ARRAY INTELLIGENCE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Array item added (object array, no identity key) ──────────────────────

describe("array item added — object array", () => {
  const a = [{ id: 1 }, { id: 2 }];
  const b = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const changes = diff(a, b);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports ADDED for the new item at index 2", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$[2]")).toBe(true);
  });

  it("ADDED is NON_BREAKING", () => {
    const added = changes.find((c) => c.kind === "ADDED" && c.path === "$[2]");
    expect(added!.compatibility).toBe("NON_BREAKING");
  });
});

// ─── 2. Array item removed (object array, no identity key) ───────────────────

describe("array item removed — object array", () => {
  const a = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const b = [{ id: 1 }, { id: 2 }];
  const changes = diff(a, b);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports REMOVED for the missing item at index 2", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$[2]")).toBe(true);
  });

  it("REMOVED is BREAKING", () => {
    const removed = changes.find((c) => c.kind === "REMOVED" && c.path === "$[2]");
    expect(removed!.compatibility).toBe("BREAKING");
  });
});

// ─── 3. Array item scalar value changed ──────────────────────────────────────

describe("array item scalar value changed", () => {
  const a = [{ id: 1, name: "Ali" }];
  const b = [{ id: 1, name: "Ahmed" }];
  const changes = diff(a, b);

  it("reports CHANGED for [0].name — not a removal/addition", () => {
    expect(changes.some((c) => c.kind === "CHANGED" && c.path === "$[0].name")).toBe(true);
  });

  it("does not report the item as REMOVED or ADDED", () => {
    expect(changes.some((c) => (c.kind === "REMOVED" || c.kind === "ADDED") && c.path === "$[0]")).toBe(false);
  });
});

// ─── 4. Array item type changed ───────────────────────────────────────────────

describe("array item type changed", () => {
  const a = [123];
  const b = ["123"];
  const changes = diff(a, b);

  it("reports TYPE_CHANGED at [0]", () => {
    expect(changes.some((c) => c.kind === "TYPE_CHANGED" && c.path === "$[0]")).toBe(true);
  });

  it("TYPE_CHANGED is BREAKING", () => {
    const tc = changes.find((c) => c.kind === "TYPE_CHANGED");
    expect(tc!.compatibility).toBe("BREAKING");
  });
});

// ─── 5. Array object shape change — field added ───────────────────────────────

describe("array object shape change — field added", () => {
  const a = [{ id: 1, name: "Ali" }];
  const b = [{ id: 1, name: "Ali", email: "ali@example.com" }];
  const changes = diff(a, b);

  it("reports ADDED for [0].email", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$[0].email")).toBe(true);
  });

  it("does not treat the whole item as replaced", () => {
    expect(changes.every((c) => c.path !== "$[0]" || c.kind === "ADDED")).toBe(true);
  });
});

// ─── 6. Array object shape change — field removed ────────────────────────────

describe("array object shape change — field removed", () => {
  const a = [{ id: 1, name: "Ali" }];
  const b = [{ id: 1, fullName: "Ali" }];
  const changes = diff(a, b);

  it("reports REMOVED for [0].name", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$[0].name")).toBe(true);
  });

  it("reports ADDED for [0].fullName", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$[0].fullName")).toBe(true);
  });

  it("does not treat the whole item as replaced", () => {
    expect(changes.some((c) => c.path === "$[0]" && c.kind === "REMOVED")).toBe(false);
  });
});

// ─── 7. Nested array changes ──────────────────────────────────────────────────

describe("nested array changes", () => {
  const a = { users: [{ id: 1, roles: ["admin"] }] };
  const b = { users: [{ id: 1, roles: ["admin", "editor"] }] };
  const changes = diff(a, b);

  it("reports ARRAY_LENGTH_CHANGED at $.users[0].roles", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED" && c.path === "$.users[0].roles")).toBe(true);
  });

  it("reports ADDED at $.users[0].roles[1]", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$.users[0].roles[1]")).toBe(true);
  });
});

// ─── 8. Empty array → item ────────────────────────────────────────────────────

describe("empty array → item", () => {
  const changes = diff([], [{ id: 1 }]);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports ADDED at [0]", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$[0]")).toBe(true);
  });
});

// ─── 9. Item → empty array ────────────────────────────────────────────────────

describe("item → empty array", () => {
  const changes = diff([{ id: 1 }], []);

  it("reports ARRAY_LENGTH_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_LENGTH_CHANGED")).toBe(true);
  });

  it("reports REMOVED at [0]", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$[0]")).toBe(true);
  });
});

// ─── 10. Stable id-based matching ────────────────────────────────────────────

describe("stable id-based matching", () => {
  const a = [{ id: 1, name: "Ali" }, { id: 2, name: "Ahmed" }];
  const b = [{ id: 1, name: "Ali" }, { id: 2, name: "Ahmet" }];
  const changes = diff(a, b);

  it("reports CHANGED for [1].name (matched by id)", () => {
    expect(changes.some((c) => c.kind === "CHANGED" && c.path.endsWith(".name"))).toBe(true);
  });

  it("does not report spurious REMOVED/ADDED for matched items", () => {
    expect(changes.some((c) => (c.kind === "REMOVED" || c.kind === "ADDED") && c.path === "$[0]")).toBe(false);
    expect(changes.some((c) => (c.kind === "REMOVED" || c.kind === "ADDED") && c.path === "$[1]")).toBe(false);
  });
});

// ─── 11. Stable id-based reorder ─────────────────────────────────────────────

describe("stable id-based reorder", () => {
  const a = [{ id: 1, name: "Ali" }, { id: 2, name: "Ahmed" }];
  const b = [{ id: 2, name: "Ahmed" }, { id: 1, name: "Ali" }];
  const changes = diff(a, b);

  it("reports ARRAY_REORDERED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_REORDERED")).toBe(true);
  });

  it("does not report spurious field changes for reordered items", () => {
    expect(changes.some((c) => c.kind === "CHANGED")).toBe(false);
    expect(changes.some((c) => c.kind === "TYPE_CHANGED")).toBe(false);
  });

  it("ARRAY_REORDERED compatibility is REVIEW", () => {
    const reorder = changes.find((c) => c.kind === "ARRAY_REORDERED");
    expect(reorder!.compatibility).toBe("REVIEW");
  });
});

// ─── 12. Duplicate ids fall back to index-based comparison ───────────────────

describe("duplicate ids fall back to index-based comparison", () => {
  const a = [{ id: 1, name: "Ali" }, { id: 1, name: "Duplicate" }];
  const b = [{ id: 1, name: "Ali" }, { id: 1, name: "Changed" }];
  const changes = diff(a, b);

  it("falls back to index-based: reports CHANGED for [1].name", () => {
    expect(changes.some((c) => c.kind === "CHANGED" && c.path === "$[1].name")).toBe(true);
  });

  it("does not report ARRAY_REORDERED", () => {
    expect(changes.some((c) => c.kind === "ARRAY_REORDERED")).toBe(false);
  });
});

// ─── 13. Mixed array types ────────────────────────────────────────────────────

describe("mixed array types", () => {
  const a = [1, { id: 2 }, "hello"];
  const b = [1, { id: 2 }, "world"];

  it("does not crash and reports CHANGED for [2]", () => {
    const changes = diff(a, b);
    expect(changes.some((c) => c.kind === "CHANGED" && c.path === "$[2]")).toBe(true);
  });

  it("reports no changes for identical mixed arrays", () => {
    expect(diff(a, a)).toHaveLength(0);
  });
});

// ─── 14. Deterministic repeated output — array intelligence ──────────────────

describe("deterministic output — array intelligence", () => {
  const a = [{ id: 1, name: "Ali" }, { id: 2, name: "Ahmed" }];
  const b = [{ id: 2, name: "Ahmed" }, { id: 1, name: "Ali Updated" }];

  it("produces identical results across multiple runs", () => {
    const results = Array.from({ length: 5 }, () => diff(a, b));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — NULLABILITY INTELLIGENCE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1–5. value → null (all non-null types) ───────────────────────────────────

describe("nullability: string → null", () => {
  const changes = diff({ v: "hello" }, { v: null });
  it("kind is NULLABILITY_CHANGED", () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is HIGH",            () => expect(changes[0]!.severity).toBe("HIGH"));
  it("compatibility is BREAKING",   () => expect(changes[0]!.compatibility).toBe("BREAKING"));
  it("baselineType is string",      () => expect(changes[0]!.baselineType).toBe("string"));
  it("candidateType is null",       () => expect(changes[0]!.candidateType).toBe("null"));
});

describe("nullability: number → null", () => {
  const changes = diff({ v: 42 }, { v: null });
  it("kind is NULLABILITY_CHANGED", () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is HIGH",            () => expect(changes[0]!.severity).toBe("HIGH"));
  it("compatibility is BREAKING",   () => expect(changes[0]!.compatibility).toBe("BREAKING"));
  it("baselineType is number",      () => expect(changes[0]!.baselineType).toBe("number"));
  it("candidateType is null",       () => expect(changes[0]!.candidateType).toBe("null"));
});

describe("nullability: boolean → null", () => {
  const changes = diff({ v: true }, { v: null });
  it("kind is NULLABILITY_CHANGED", () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is HIGH",            () => expect(changes[0]!.severity).toBe("HIGH"));
  it("compatibility is BREAKING",   () => expect(changes[0]!.compatibility).toBe("BREAKING"));
  it("baselineType is boolean",     () => expect(changes[0]!.baselineType).toBe("boolean"));
});

describe("nullability: object → null", () => {
  const changes = diff({ v: { x: 1 } }, { v: null });
  it("kind is NULLABILITY_CHANGED", () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is HIGH",            () => expect(changes[0]!.severity).toBe("HIGH"));
  it("compatibility is BREAKING",   () => expect(changes[0]!.compatibility).toBe("BREAKING"));
  it("baselineType is object",      () => expect(changes[0]!.baselineType).toBe("object"));
});

describe("nullability: array → null", () => {
  const changes = diff({ v: [1, 2] }, { v: null });
  it("kind is NULLABILITY_CHANGED", () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is HIGH",            () => expect(changes[0]!.severity).toBe("HIGH"));
  it("compatibility is BREAKING",   () => expect(changes[0]!.compatibility).toBe("BREAKING"));
  it("baselineType is array",       () => expect(changes[0]!.baselineType).toBe("array"));
});

// ─── 6–10. null → value (all non-null types) ─────────────────────────────────

describe("nullability: null → string", () => {
  const changes = diff({ v: null }, { v: "hello" });
  it("kind is NULLABILITY_CHANGED",  () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is LOW",              () => expect(changes[0]!.severity).toBe("LOW"));
  it("compatibility is NON_BREAKING",() => expect(changes[0]!.compatibility).toBe("NON_BREAKING"));
  it("baselineType is null",         () => expect(changes[0]!.baselineType).toBe("null"));
  it("candidateType is string",      () => expect(changes[0]!.candidateType).toBe("string"));
});

describe("nullability: null → number", () => {
  const changes = diff({ v: null }, { v: 99 });
  it("kind is NULLABILITY_CHANGED",  () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is LOW",              () => expect(changes[0]!.severity).toBe("LOW"));
  it("compatibility is NON_BREAKING",() => expect(changes[0]!.compatibility).toBe("NON_BREAKING"));
  it("candidateType is number",      () => expect(changes[0]!.candidateType).toBe("number"));
});

describe("nullability: null → boolean", () => {
  const changes = diff({ v: null }, { v: false });
  it("kind is NULLABILITY_CHANGED",  () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is LOW",              () => expect(changes[0]!.severity).toBe("LOW"));
  it("compatibility is NON_BREAKING",() => expect(changes[0]!.compatibility).toBe("NON_BREAKING"));
  it("candidateType is boolean",     () => expect(changes[0]!.candidateType).toBe("boolean"));
});

describe("nullability: null → object", () => {
  const changes = diff({ v: null }, { v: { x: 1 } });
  it("kind is NULLABILITY_CHANGED",  () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is LOW",              () => expect(changes[0]!.severity).toBe("LOW"));
  it("compatibility is NON_BREAKING",() => expect(changes[0]!.compatibility).toBe("NON_BREAKING"));
  it("candidateType is object",      () => expect(changes[0]!.candidateType).toBe("object"));
});

describe("nullability: null → array", () => {
  const changes = diff({ v: null }, { v: [1, 2] });
  it("kind is NULLABILITY_CHANGED",  () => expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED"));
  it("severity is LOW",              () => expect(changes[0]!.severity).toBe("LOW"));
  it("compatibility is NON_BREAKING",() => expect(changes[0]!.compatibility).toBe("NON_BREAKING"));
  it("candidateType is array",       () => expect(changes[0]!.candidateType).toBe("array"));
});

// ─── 11. Nested nullability change ───────────────────────────────────────────

describe("nullability: nested value → null", () => {
  const a = { user: { profile: { email: "a@example.com" } } };
  const b = { user: { profile: { email: null } } };
  const changes = diff(a, b);

  it("reports NULLABILITY_CHANGED at $.user.profile.email", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      path: "$.user.profile.email",
      kind: "NULLABILITY_CHANGED",
      severity: "HIGH",
      compatibility: "BREAKING",
    });
  });
});

// ─── 12. Nullability inside array ────────────────────────────────────────────

describe("nullability: inside array object field", () => {
  const a = [{ id: 1, email: "a@example.com" }];
  const b = [{ id: 1, email: null }];
  const changes = diff(a, b);

  it("reports NULLABILITY_CHANGED at [0].email", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_CHANGED" && c.path === "$[0].email")).toBe(true);
  });

  it("is BREAKING", () => {
    const nc = changes.find((c) => c.kind === "NULLABILITY_CHANGED");
    expect(nc!.compatibility).toBe("BREAKING");
  });
});

describe("nullability: scalar array item string → null", () => {
  const changes = diff(["a"], [null]);
  it("reports NULLABILITY_CHANGED at [0]", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_CHANGED" && c.path === "$[0]")).toBe(true);
  });
});

describe("nullability: scalar array item null → string", () => {
  const changes = diff([null], ["a"]);
  it("reports NULLABILITY_CHANGED at [0]", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_CHANGED" && c.path === "$[0]")).toBe(true);
  });
  it("is NON_BREAKING", () => {
    const nc = changes.find((c) => c.kind === "NULLABILITY_CHANGED");
    expect(nc!.compatibility).toBe("NON_BREAKING");
  });
});

// ─── 13. Multiple nullability changes ────────────────────────────────────────

describe("nullability: multiple fields become null", () => {
  const a = { email: "a@example.com", age: 20, active: true };
  const b = { email: null, age: null, active: true };
  const changes = diff(a, b);

  it("reports NULLABILITY_CHANGED for email", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_CHANGED" && c.path === "$.email")).toBe(true);
  });

  it("reports NULLABILITY_CHANGED for age", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_CHANGED" && c.path === "$.age")).toBe(true);
  });

  it("does not report a change for active", () => {
    expect(changes.some((c) => c.path === "$.active")).toBe(false);
  });

  it("reports exactly 2 changes", () => {
    expect(changes).toHaveLength(2);
  });
});

// ─── 14. Nullability vs normal type change ────────────────────────────────────

describe("nullability vs normal type change — non-null types remain TYPE_CHANGED", () => {
  it("number → string is TYPE_CHANGED, not NULLABILITY_CHANGED", () => {
    const changes = diff({ v: 1 }, { v: "1" });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
  });

  it("object → array is TYPE_CHANGED", () => {
    const changes = diff({ v: {} }, { v: [] });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
  });

  it("boolean → number is TYPE_CHANGED", () => {
    const changes = diff({ v: true }, { v: 1 });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
  });

  it("array → object is TYPE_CHANGED", () => {
    const changes = diff({ v: [] }, { v: {} });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
  });
});

// ─── 15. Deterministic repeated output ───────────────────────────────────────

describe("nullability: deterministic output", () => {
  const a = { email: "a@example.com", score: 10, data: { active: true } };
  const b = { email: null, score: 10, data: { active: null } };

  it("produces identical results across multiple runs", () => {
    const results = Array.from({ length: 5 }, () => diff(a, b));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ─── 16–17. Compatibility and severity classification (via engine) ────────────

describe("nullability: compatibility classification", () => {
  it("value → null is BREAKING", () => {
    const [c] = diff({ x: 1 }, { x: null });
    expect(c!.compatibility).toBe("BREAKING");
  });

  it("null → value is NON_BREAKING", () => {
    const [c] = diff({ x: null }, { x: 1 });
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

describe("nullability: severity classification", () => {
  it("value → null is HIGH", () => {
    const [c] = diff({ x: "hello" }, { x: null });
    expect(c!.severity).toBe("HIGH");
  });

  it("null → value is LOW", () => {
    const [c] = diff({ x: null }, { x: "hello" });
    expect(c!.severity).toBe("LOW");
  });
});

// ─── 18. Mixed response: nullability + normal type change ─────────────────────

describe("nullability: mixed with normal type change", () => {
  const a = { id: 1, email: "a@example.com", role: "admin" };
  const b = { id: "1", email: null, role: "admin" };
  const changes = diff(a, b);

  it("reports TYPE_CHANGED for id (number → string)", () => {
    expect(changes.some((c) => c.path === "$.id" && c.kind === "TYPE_CHANGED")).toBe(true);
  });

  it("reports NULLABILITY_CHANGED for email (string → null)", () => {
    expect(changes.some((c) => c.path === "$.email" && c.kind === "NULLABILITY_CHANGED")).toBe(true);
  });

  it("reports no change for role", () => {
    expect(changes.some((c) => c.path === "$.role")).toBe(false);
  });

  it("every change has a compatibility field", () => {
    for (const c of changes) {
      expect(c.compatibility).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — STEP 4: REQUIRED / OPTIONAL FIELD SEMANTICS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Top-level field removal ───────────────────────────────────────────────

describe("field presence: top-level field removed", () => {
  const changes = diff({ name: "Ali", role: "admin" }, { name: "Ali" });

  it("kind is REMOVED", () => {
    expect(changes[0]!.kind).toBe("REMOVED");
  });

  it("path is $.role", () => {
    expect(changes[0]!.path).toBe("$.role");
  });

  it("compatibility is BREAKING", () => {
    expect(changes[0]!.compatibility).toBe("BREAKING");
  });

  it("fieldRequirement is UNKNOWN — raw JSON cannot determine contract semantics", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 2. Top-level field addition ─────────────────────────────────────────────

describe("field presence: top-level field added", () => {
  const changes = diff({ name: "Ali" }, { name: "Ali", role: "admin" });

  it("kind is ADDED", () => {
    expect(changes[0]!.kind).toBe("ADDED");
  });

  it("path is $.role", () => {
    expect(changes[0]!.path).toBe("$.role");
  });

  it("compatibility is NON_BREAKING", () => {
    expect(changes[0]!.compatibility).toBe("NON_BREAKING");
  });

  it("fieldRequirement is UNKNOWN — raw JSON cannot determine contract semantics", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 3. Nested field removal ──────────────────────────────────────────────────

describe("field presence: nested field removed", () => {
  const a = { user: { id: 1, name: "Ali" } };
  const b = { user: { id: 1 } };
  const changes = diff(a, b);

  it("kind is REMOVED at $.user.name", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.name", kind: "REMOVED" });
  });

  it("fieldRequirement is UNKNOWN", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 4. Nested field addition ─────────────────────────────────────────────────

describe("field presence: nested field added", () => {
  const a = { user: { id: 1 } };
  const b = { user: { id: 1, name: "Ali" } };
  const changes = diff(a, b);

  it("kind is ADDED at $.user.name", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.name", kind: "ADDED" });
  });

  it("fieldRequirement is UNKNOWN", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 5. Deeply nested removal ─────────────────────────────────────────────────

describe("field presence: deeply nested field removed", () => {
  const a = { user: { profile: { email: "a@example.com" } } };
  const b = { user: { profile: {} } };
  const changes = diff(a, b);

  it("kind is REMOVED at $.user.profile.email", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.profile.email", kind: "REMOVED" });
  });

  it("fieldRequirement is UNKNOWN", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 6. Deeply nested addition ────────────────────────────────────────────────

describe("field presence: deeply nested field added", () => {
  const a = { user: { profile: {} } };
  const b = { user: { profile: { email: "a@example.com" } } };
  const changes = diff(a, b);

  it("kind is ADDED at $.user.profile.email", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ path: "$.user.profile.email", kind: "ADDED" });
  });

  it("fieldRequirement is UNKNOWN", () => {
    expect(changes[0]!.fieldRequirement).toBe("UNKNOWN");
  });
});

// ─── 7. Array object field removal ────────────────────────────────────────────

describe("field presence: array object field removed", () => {
  const a = [{ id: 1, email: "a@example.com" }];
  const b = [{ id: 1 }];
  const changes = diff(a, b);

  it("reports REMOVED for [0].email", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$[0].email")).toBe(true);
  });

  it("fieldRequirement is UNKNOWN on the removed field", () => {
    const removed = changes.find((c) => c.kind === "REMOVED" && c.path === "$[0].email");
    expect(removed!.fieldRequirement).toBe("UNKNOWN");
  });

  it("is BREAKING", () => {
    const removed = changes.find((c) => c.kind === "REMOVED" && c.path === "$[0].email");
    expect(removed!.compatibility).toBe("BREAKING");
  });
});

// ─── 8. Array object field addition ───────────────────────────────────────────

describe("field presence: array object field added", () => {
  const a = [{ id: 1 }];
  const b = [{ id: 1, email: "a@example.com" }];
  const changes = diff(a, b);

  it("reports ADDED for [0].email", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$[0].email")).toBe(true);
  });

  it("fieldRequirement is UNKNOWN on the added field", () => {
    const added = changes.find((c) => c.kind === "ADDED" && c.path === "$[0].email");
    expect(added!.fieldRequirement).toBe("UNKNOWN");
  });

  it("is NON_BREAKING", () => {
    const added = changes.find((c) => c.kind === "ADDED" && c.path === "$[0].email");
    expect(added!.compatibility).toBe("NON_BREAKING");
  });
});

// ─── 9. Field removed vs field becoming null ──────────────────────────────────

describe("field presence: removed vs nullability — distinct semantics", () => {
  it("field present but null → NULLABILITY_CHANGED, not REMOVED", () => {
    const changes = diff({ email: "a@example.com" }, { email: null });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED");
  });

  it("field null then absent → REMOVED, not NULLABILITY_CHANGED", () => {
    const changes = diff({ email: null }, {});
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("REMOVED");
  });

  it("REMOVED carries fieldRequirement UNKNOWN; NULLABILITY_CHANGED does not", () => {
    const removed = diff({ email: null }, {})[0]!;
    const nulled  = diff({ email: "a@example.com" }, { email: null })[0]!;
    expect(removed.fieldRequirement).toBe("UNKNOWN");
    expect(nulled.fieldRequirement).toBeUndefined();
  });
});

// ─── 10. Field added vs nullability change ────────────────────────────────────

describe("field presence: added vs nullability — distinct semantics", () => {
  it("field absent then present with value → ADDED, not NULLABILITY_CHANGED", () => {
    const changes = diff({}, { email: "a@example.com" });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ADDED");
  });

  it("field null then has value → NULLABILITY_CHANGED, not ADDED", () => {
    const changes = diff({ email: null }, { email: "a@example.com" });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("NULLABILITY_CHANGED");
  });
});

// ─── 11. Field added vs type change ───────────────────────────────────────────

describe("field presence: added vs type change — distinct semantics", () => {
  it("field absent then present → ADDED", () => {
    const changes = diff({}, { age: 20 });
    expect(changes[0]!.kind).toBe("ADDED");
  });

  it("field present with different type → TYPE_CHANGED, not ADDED", () => {
    const changes = diff({ age: 20 }, { age: "20" });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
  });
});

// ─── 12. Field removed vs type change ─────────────────────────────────────────

describe("field presence: removed vs type change — distinct semantics", () => {
  it("field present then absent → REMOVED", () => {
    const changes = diff({ age: 20 }, {});
    expect(changes[0]!.kind).toBe("REMOVED");
  });

  it("field present with different type → TYPE_CHANGED, not REMOVED", () => {
    const changes = diff({ age: 20 }, { age: "20" });
    expect(changes[0]!.kind).toBe("TYPE_CHANGED");
    expect(changes[0]!.fieldRequirement).toBeUndefined();
  });
});

// ─── 13. REMOVED compatibility ────────────────────────────────────────────────

describe("field presence: REMOVED compatibility", () => {
  it("REMOVED is always BREAKING", () => {
    const changes = diff({ a: 1, b: 2 }, { a: 1 });
    const removed = changes.find((c) => c.kind === "REMOVED");
    expect(removed!.compatibility).toBe("BREAKING");
  });
});

// ─── 14. ADDED compatibility ──────────────────────────────────────────────────

describe("field presence: ADDED compatibility", () => {
  it("ADDED is always NON_BREAKING", () => {
    const changes = diff({ a: 1 }, { a: 1, b: 2 });
    const added = changes.find((c) => c.kind === "ADDED");
    expect(added!.compatibility).toBe("NON_BREAKING");
  });
});

// ─── 15. Deterministic repeated output ───────────────────────────────────────

describe("field presence: deterministic output", () => {
  const a = { user: { id: 1, name: "Ali", role: "admin" } };
  const b = { user: { id: 1, email: "ali@example.com" } };

  it("produces identical results across multiple runs", () => {
    const results = Array.from({ length: 5 }, () => diff(a, b));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ─── 16. Unknown requirement status — no schema ───────────────────────────────

describe("field presence: fieldRequirement is always UNKNOWN without schema", () => {
  it("REMOVED field has fieldRequirement UNKNOWN", () => {
    const [c] = diff({ x: 1 }, {});
    expect(c!.kind).toBe("REMOVED");
    expect(c!.fieldRequirement).toBe("UNKNOWN");
  });

  it("ADDED field has fieldRequirement UNKNOWN", () => {
    const [c] = diff({}, { x: 1 });
    expect(c!.kind).toBe("ADDED");
    expect(c!.fieldRequirement).toBe("UNKNOWN");
  });

  it("CHANGED field does not carry fieldRequirement", () => {
    const [c] = diff({ x: 1 }, { x: 2 });
    expect(c!.kind).toBe("CHANGED");
    expect(c!.fieldRequirement).toBeUndefined();
  });

  it("TYPE_CHANGED field does not carry fieldRequirement", () => {
    const [c] = diff({ x: 1 }, { x: "1" });
    expect(c!.kind).toBe("TYPE_CHANGED");
    expect(c!.fieldRequirement).toBeUndefined();
  });

  it("NULLABILITY_CHANGED field does not carry fieldRequirement", () => {
    const [c] = diff({ x: "hello" }, { x: null });
    expect(c!.kind).toBe("NULLABILITY_CHANGED");
    expect(c!.fieldRequirement).toBeUndefined();
  });
});
