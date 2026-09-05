import { describe, it, expect } from "vitest";
import { classifyCompatibility, isBreakingChange, annotateCompatibility } from "@/lib/diff/compatibility";
import { diffJson } from "@/lib/diff/engine";
import { compareStatus } from "@/lib/diff/status";
import type { DiffChange } from "@/types/diff";

// ─── classifyCompatibility — rule table ──────────────────────────────────────

describe("classifyCompatibility", () => {
  it("REMOVED → BREAKING",             () => expect(classifyCompatibility("REMOVED")).toBe("BREAKING"));
  it("TYPE_CHANGED → BREAKING",        () => expect(classifyCompatibility("TYPE_CHANGED")).toBe("BREAKING"));
  it("NULLABILITY_CHANGED → BREAKING", () => expect(classifyCompatibility("NULLABILITY_CHANGED")).toBe("BREAKING"));
  it("ENUM_VALUE_REMOVED → BREAKING",  () => expect(classifyCompatibility("ENUM_VALUE_REMOVED")).toBe("BREAKING"));
  it("ADDED → NON_BREAKING",           () => expect(classifyCompatibility("ADDED")).toBe("NON_BREAKING"));
  it("CHANGED → NON_BREAKING",         () => expect(classifyCompatibility("CHANGED")).toBe("NON_BREAKING"));
  it("ARRAY_LENGTH_CHANGED → NON_BREAKING", () => expect(classifyCompatibility("ARRAY_LENGTH_CHANGED")).toBe("NON_BREAKING"));
  it("ENUM_VALUE_ADDED → NON_BREAKING", () => expect(classifyCompatibility("ENUM_VALUE_ADDED")).toBe("NON_BREAKING"));
  it("ARRAY_REORDERED → REVIEW",       () => expect(classifyCompatibility("ARRAY_REORDERED")).toBe("REVIEW"));
  it("STATUS_CHANGED → REVIEW",        () => expect(classifyCompatibility("STATUS_CHANGED")).toBe("REVIEW"));
});

// ─── isBreakingChange ─────────────────────────────────────────────────────────

describe("isBreakingChange", () => {
  function make(kind: DiffChange["kind"]): DiffChange {
    return { path: "$.x", kind, severity: "LOW", reason: "test" };
  }

  it("returns true for REMOVED",             () => expect(isBreakingChange(make("REMOVED"))).toBe(true));
  it("returns true for TYPE_CHANGED",         () => expect(isBreakingChange(make("TYPE_CHANGED"))).toBe(true));
  it("returns true for NULLABILITY_CHANGED",  () => expect(isBreakingChange(make("NULLABILITY_CHANGED"))).toBe(true));
  it("returns true for ENUM_VALUE_REMOVED",   () => expect(isBreakingChange(make("ENUM_VALUE_REMOVED"))).toBe(true));
  it("returns false for ADDED",               () => expect(isBreakingChange(make("ADDED"))).toBe(false));
  it("returns false for CHANGED",             () => expect(isBreakingChange(make("CHANGED"))).toBe(false));
  it("returns false for ARRAY_LENGTH_CHANGED",() => expect(isBreakingChange(make("ARRAY_LENGTH_CHANGED"))).toBe(false));
  it("returns false for ENUM_VALUE_ADDED",    () => expect(isBreakingChange(make("ENUM_VALUE_ADDED"))).toBe(false));
  it("returns false for ARRAY_REORDERED",     () => expect(isBreakingChange(make("ARRAY_REORDERED"))).toBe(false));
  it("returns false for STATUS_CHANGED",      () => expect(isBreakingChange(make("STATUS_CHANGED"))).toBe(false));

  it("respects an explicit compatibility field over kind", () => {
    // A change that has been manually overridden
    const c: DiffChange = { ...make("ADDED"), compatibility: "BREAKING" };
    expect(isBreakingChange(c)).toBe(true);
  });
});

// ─── annotateCompatibility ────────────────────────────────────────────────────

describe("annotateCompatibility", () => {
  it("stamps compatibility on every change", () => {
    const changes: DiffChange[] = [
      { path: "$.a", kind: "REMOVED",      severity: "CRITICAL", reason: "" },
      { path: "$.b", kind: "ADDED",        severity: "LOW",      reason: "" },
      { path: "$.c", kind: "TYPE_CHANGED", severity: "HIGH",     reason: "" },
    ];
    const annotated = annotateCompatibility(changes);
    expect(annotated[0]!.compatibility).toBe("BREAKING");
    expect(annotated[1]!.compatibility).toBe("NON_BREAKING");
    expect(annotated[2]!.compatibility).toBe("BREAKING");
  });

  it("does not mutate the original array", () => {
    const original: DiffChange[] = [
      { path: "$.a", kind: "ADDED", severity: "LOW", reason: "" },
    ];
    annotateCompatibility(original);
    expect(original[0]!.compatibility).toBeUndefined();
  });

  it("returns an empty array unchanged", () => {
    expect(annotateCompatibility([])).toEqual([]);
  });
});

// ─── diffJson integration — compatibility on engine output ───────────────────

describe("diffJson compatibility annotation", () => {
  it("removed top-level field → BREAKING", () => {
    const [change] = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(change!.kind).toBe("REMOVED");
    expect(change!.compatibility).toBe("BREAKING");
  });

  it("removed nested field → BREAKING", () => {
    const changes = diffJson({ user: { id: 1, name: "x" } }, { user: { id: 1 } });
    expect(changes).toHaveLength(1);
    expect(changes[0]!.kind).toBe("REMOVED");
    expect(changes[0]!.compatibility).toBe("BREAKING");
  });

  it("removed array item → BREAKING", () => {
    const changes = diffJson({ items: [1, 2, 3] }, { items: [1, 2] });
    const removed = changes.find((c) => c.kind === "REMOVED");
    expect(removed).toBeDefined();
    expect(removed!.compatibility).toBe("BREAKING");
  });

  it("type changed number → string → BREAKING", () => {
    const [change] = diffJson({ id: 1 }, { id: "1" });
    expect(change!.kind).toBe("TYPE_CHANGED");
    expect(change!.compatibility).toBe("BREAKING");
  });

  it("type changed object → array → BREAKING", () => {
    const [change] = diffJson({ data: {} }, { data: [] });
    expect(change!.kind).toBe("TYPE_CHANGED");
    expect(change!.compatibility).toBe("BREAKING");
  });

  it("added field → NON_BREAKING", () => {
    const [change] = diffJson({ a: 1 }, { a: 1, b: 2 });
    expect(change!.kind).toBe("ADDED");
    expect(change!.compatibility).toBe("NON_BREAKING");
  });

  it("changed scalar value → NON_BREAKING", () => {
    const [change] = diffJson({ name: "Alice" }, { name: "Bob" });
    expect(change!.kind).toBe("CHANGED");
    expect(change!.compatibility).toBe("NON_BREAKING");
  });

  it("array length change → NON_BREAKING", () => {
    const changes = diffJson({ items: [1, 2] }, { items: [1, 2, 3] });
    const lengthChange = changes.find((c) => c.kind === "ARRAY_LENGTH_CHANGED");
    expect(lengthChange).toBeDefined();
    expect(lengthChange!.compatibility).toBe("NON_BREAKING");
  });

  it("every change in a mixed diff has a compatibility field", () => {
    const changes = diffJson(
      { id: 1, name: "x", role: "admin" },
      { id: "1", extra: true },
    );
    for (const c of changes) {
      expect(c.compatibility).toBeDefined();
    }
  });
});

// ─── STATUS_CHANGED compatibility ────────────────────────────────────────────

describe("compareStatus compatibility annotation", () => {
  it("STATUS_CHANGED → REVIEW regardless of severity", () => {
    const change = compareStatus(200, 404, "OK", "Not Found");
    expect(change).not.toBeNull();
    expect(change!.compatibility).toBe("REVIEW");
  });

  it("STATUS_CHANGED 404 → 200 → REVIEW", () => {
    const change = compareStatus(404, 200, "Not Found", "OK");
    expect(change!.compatibility).toBe("REVIEW");
  });

  it("identical status → null (no change produced)", () => {
    expect(compareStatus(200, 200, "OK", "OK")).toBeNull();
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe("compatibility classification is deterministic", () => {
  it("same input always produces same compatibility values", () => {
    const a = { user: { id: 1, name: "x", role: "admin" } };
    const b = { user: { id: "1", email: "a@b.com" } };
    const runs = Array.from({ length: 5 }, () =>
      diffJson(a, b).map((c) => ({ path: c.path, compatibility: c.compatibility })),
    );
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});

// ─── NULLABILITY_CHANGED direction-aware compatibility ────────────────────────

describe("NULLABILITY_CHANGED direction-aware compatibility", () => {
  it("value → null: engine stamps BREAKING (overrides table default)", () => {
    const [c] = diffJson({ x: "hello" }, { x: null });
    expect(c!.kind).toBe("NULLABILITY_CHANGED");
    expect(c!.compatibility).toBe("BREAKING");
  });

  it("null → value: engine stamps NON_BREAKING (overrides table default)", () => {
    const [c] = diffJson({ x: null }, { x: "hello" });
    expect(c!.kind).toBe("NULLABILITY_CHANGED");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });

  it("annotateCompatibility preserves pre-stamped compatibility on nullability changes", () => {
    const [c] = diffJson({ x: null }, { x: 42 });
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});
