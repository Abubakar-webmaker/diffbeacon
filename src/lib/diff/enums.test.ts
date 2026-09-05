import { describe, it, expect } from "vitest";
import { diffEnumValues } from "@/lib/diff/enums";
import { diffJson } from "@/lib/diff/engine";
import { classifyCompatibility } from "@/lib/diff/compatibility";

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — STEP 5: ENUM CHANGE DETECTION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. Raw value change remains CHANGED ─────────────────────────────────────

describe("raw JSON: value change is CHANGED, not an enum change", () => {
  it("string value change → CHANGED", () => {
    const [c] = diffJson({ status: "active" }, { status: "pending" });
    expect(c!.kind).toBe("CHANGED");
  });

  it("numeric value change → CHANGED", () => {
    const [c] = diffJson({ code: 1 }, { code: 2 });
    expect(c!.kind).toBe("CHANGED");
  });

  it("string role change → CHANGED", () => {
    const [c] = diffJson({ role: "admin" }, { role: "user" });
    expect(c!.kind).toBe("CHANGED");
  });
});

// ─── 2. Raw string values do not become enum changes ─────────────────────────

describe("raw JSON: no ENUM_VALUE_ADDED or ENUM_VALUE_REMOVED without schema", () => {
  it("diffJson never produces ENUM_VALUE_ADDED", () => {
    const changes = diffJson({ a: "x" }, { a: "y", b: "z" });
    expect(changes.every((c) => c.kind !== "ENUM_VALUE_ADDED")).toBe(true);
  });

  it("diffJson never produces ENUM_VALUE_REMOVED", () => {
    const changes = diffJson({ a: "x", b: "y" }, { a: "x" });
    expect(changes.every((c) => c.kind !== "ENUM_VALUE_REMOVED")).toBe(true);
  });
});

// ─── 3. Raw response arrays do not become enums ───────────────────────────────

describe("raw JSON: response arrays are not treated as enum definitions", () => {
  it("array of strings produces array intelligence changes, not enum changes", () => {
    const changes = diffJson({ roles: ["admin", "user"] }, { roles: ["admin"] });
    expect(changes.every((c) => c.kind !== "ENUM_VALUE_ADDED" && c.kind !== "ENUM_VALUE_REMOVED")).toBe(true);
  });
});

// ─── 4. Explicit enum value added ────────────────────────────────────────────

describe("schema-aware: enum value added", () => {
  const changes = diffEnumValues("$.status", ["active", "disabled"], ["active", "disabled", "pending"]);

  it("produces one ENUM_VALUE_ADDED change", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_ADDED");
  });

  it("enumValue is 'pending'", () => {
    expect(changes[0]!.enumValue).toBe("pending");
  });

  it("path is $.status", () => {
    expect(changes[0]!.path).toBe("$.status");
  });

  it("compatibility is NON_BREAKING", () => {
    expect(changes[0]!.compatibility).toBe("NON_BREAKING");
  });

  it("severity is LOW", () => {
    expect(changes[0]!.severity).toBe("LOW");
  });
});

// ─── 5. Explicit enum value removed ──────────────────────────────────────────

describe("schema-aware: enum value removed", () => {
  const changes = diffEnumValues("$.status", ["active", "disabled", "pending"], ["active", "disabled"]);

  it("produces one ENUM_VALUE_REMOVED change", () => {
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_REMOVED");
  });

  it("enumValue is 'pending'", () => {
    expect(changes[0]!.enumValue).toBe("pending");
  });

  it("compatibility is BREAKING", () => {
    expect(changes[0]!.compatibility).toBe("BREAKING");
  });

  it("severity is HIGH", () => {
    expect(changes[0]!.severity).toBe("HIGH");
  });
});

// ─── 6. Multiple enum values added and removed ───────────────────────────────

describe("schema-aware: multiple enum values added and removed", () => {
  // baseline: [A, B, C] → candidate: [A, C, D]
  // removed: B, added: D
  const changes = diffEnumValues("$.state", ["A", "B", "C"], ["A", "C", "D"]);

  it("produces exactly 2 changes", () => {
    expect(changes).toHaveLength(2);
  });

  it("detects ENUM_VALUE_REMOVED for B", () => {
    expect(changes.some((c) => c.kind === "ENUM_VALUE_REMOVED" && c.enumValue === "B")).toBe(true);
  });

  it("detects ENUM_VALUE_ADDED for D", () => {
    expect(changes.some((c) => c.kind === "ENUM_VALUE_ADDED" && c.enumValue === "D")).toBe(true);
  });
});

// ─── 7. Enum order change is ignored ─────────────────────────────────────────

describe("schema-aware: enum order change produces no changes", () => {
  it("reordered enum values → no changes", () => {
    const changes = diffEnumValues(
      "$.status",
      ["active", "disabled", "pending"],
      ["pending", "active", "disabled"],
    );
    expect(changes).toHaveLength(0);
  });
});

// ─── 8. Duplicate enum values handled deterministically ──────────────────────

describe("schema-aware: duplicate enum values are deduplicated", () => {
  it("duplicate in baseline does not produce spurious REMOVED", () => {
    // baseline has 'active' twice; candidate has it once — membership unchanged
    const changes = diffEnumValues("$.status", ["active", "active", "disabled"], ["active", "disabled"]);
    expect(changes).toHaveLength(0);
  });

  it("duplicate in candidate does not produce spurious ADDED", () => {
    const changes = diffEnumValues("$.status", ["active", "disabled"], ["active", "disabled", "disabled"]);
    expect(changes).toHaveLength(0);
  });
});

// ─── 9. String enum values ────────────────────────────────────────────────────

describe("schema-aware: string enum values", () => {
  it("detects added string value", () => {
    const changes = diffEnumValues("$.color", ["red", "blue"], ["red", "blue", "green"]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_ADDED");
    expect(changes[0]!.enumValue).toBe("green");
  });
});

// ─── 10. Numeric enum values ──────────────────────────────────────────────────

describe("schema-aware: numeric enum values", () => {
  it("detects removed numeric value", () => {
    const changes = diffEnumValues("$.code", [1, 2, 3], [1, 2]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_REMOVED");
    expect(changes[0]!.enumValue).toBe(3);
  });
});

// ─── 11. Boolean enum values ──────────────────────────────────────────────────

describe("schema-aware: boolean enum values", () => {
  it("identical boolean enums produce no changes", () => {
    expect(diffEnumValues("$.flag", [true, false], [false, true])).toHaveLength(0);
  });

  it("detects added boolean value", () => {
    const changes = diffEnumValues("$.flag", [true], [true, false]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_ADDED");
    expect(changes[0]!.enumValue).toBe(false);
  });
});

// ─── 12. Strict type distinction: 1 ≠ "1" ────────────────────────────────────

describe("schema-aware: strict type distinction", () => {
  it("numeric 1 and string '1' are distinct enum values", () => {
    // baseline has number 1; candidate has string "1" — treated as different
    const changes = diffEnumValues("$.code", [1], ["1"]);
    expect(changes).toHaveLength(2);
    expect(changes.some((c) => c.kind === "ENUM_VALUE_REMOVED" && c.enumValue === 1)).toBe(true);
    expect(changes.some((c) => c.kind === "ENUM_VALUE_ADDED" && c.enumValue === "1")).toBe(true);
  });

  it("boolean true and string 'true' are distinct", () => {
    const changes = diffEnumValues("$.flag", [true], ["true"]);
    expect(changes).toHaveLength(2);
    expect(changes.some((c) => c.kind === "ENUM_VALUE_REMOVED" && c.enumValue === true)).toBe(true);
    expect(changes.some((c) => c.kind === "ENUM_VALUE_ADDED" && c.enumValue === "true")).toBe(true);
  });
});

// ─── 13. Enum + nullability interaction ──────────────────────────────────────

describe("enum + nullability: distinct semantics", () => {
  it("value → null in raw JSON is NULLABILITY_CHANGED, not an enum change", () => {
    const [c] = diffJson({ status: "active" }, { status: null });
    expect(c!.kind).toBe("NULLABILITY_CHANGED");
    expect(c!.kind).not.toBe("ENUM_VALUE_REMOVED");
  });

  it("diffEnumValues does not interact with nullability — null is not an enum value unless explicit", () => {
    // If the contract explicitly includes null as an enum value, it is treated
    // as a regular enum member. This is a contract decision, not a raw JSON one.
    const changes = diffEnumValues("$.status", ["active", null], ["active"]);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("ENUM_VALUE_REMOVED");
    expect(changes[0]!.enumValue).toBeNull();
  });
});

// ─── 14. Nested schema-aware enum path ───────────────────────────────────────

describe("schema-aware: nested path support", () => {
  it("path is preserved on enum changes", () => {
    const changes = diffEnumValues("$.user.status", ["active"], ["active", "pending"]);
    expect(changes[0]!.path).toBe("$.user.status");
  });

  it("array item path is preserved", () => {
    const changes = diffEnumValues("$.items[0].status", ["draft"], ["draft", "published"]);
    expect(changes[0]!.path).toBe("$.items[0].status");
  });
});

// ─── 15. Enum added compatibility ────────────────────────────────────────────

describe("compatibility: ENUM_VALUE_ADDED → NON_BREAKING", () => {
  it("classifyCompatibility returns NON_BREAKING", () => {
    expect(classifyCompatibility("ENUM_VALUE_ADDED")).toBe("NON_BREAKING");
  });

  it("diffEnumValues stamps NON_BREAKING on added values", () => {
    const [c] = diffEnumValues("$.x", ["a"], ["a", "b"]);
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

// ─── 16. Enum removed compatibility ──────────────────────────────────────────

describe("compatibility: ENUM_VALUE_REMOVED → BREAKING", () => {
  it("classifyCompatibility returns BREAKING", () => {
    expect(classifyCompatibility("ENUM_VALUE_REMOVED")).toBe("BREAKING");
  });

  it("diffEnumValues stamps BREAKING on removed values", () => {
    const [c] = diffEnumValues("$.x", ["a", "b"], ["a"]);
    expect(c!.compatibility).toBe("BREAKING");
  });
});

// ─── 17. No schema → no enum change emitted ──────────────────────────────────

describe("no schema: enum status is UNKNOWN — no enum changes from raw JSON", () => {
  it("diffJson never emits ENUM_VALUE_ADDED or ENUM_VALUE_REMOVED", () => {
    const inputs: Array<[unknown, unknown]> = [
      [{ s: "active" }, { s: "pending" }],
      [{ n: 1 }, { n: 2 }],
      [{ arr: ["a", "b"] }, { arr: ["a", "b", "c"] }],
      [{ obj: { x: "y" } }, { obj: { x: "z" } }],
    ];
    for (const [a, b] of inputs) {
      const changes = diffJson(a, b);
      for (const c of changes) {
        expect(c.kind).not.toBe("ENUM_VALUE_ADDED");
        expect(c.kind).not.toBe("ENUM_VALUE_REMOVED");
      }
    }
  });

  it("identical enum arrays produce no changes", () => {
    expect(diffEnumValues("$.x", ["a", "b"], ["a", "b"])).toHaveLength(0);
  });

  it("empty enum arrays produce no changes", () => {
    expect(diffEnumValues("$.x", [], [])).toHaveLength(0);
  });
});

// ─── 18. Deterministic repeated output ───────────────────────────────────────

describe("enum: deterministic output", () => {
  it("diffEnumValues produces identical results across multiple runs", () => {
    const baseline = ["active", "disabled", "pending"];
    const candidate = ["active", "suspended", "pending"];
    const results = Array.from({ length: 5 }, () =>
      diffEnumValues("$.status", baseline, candidate),
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});
