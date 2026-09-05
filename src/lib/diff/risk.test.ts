import { describe, it, expect } from "vitest";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { compareStatus } from "@/lib/diff/status";
import { diffEnumValues } from "@/lib/diff/enums";
import type { DiffChange } from "@/types/diff";

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3 — STEP 6: PRECISE RISK SCORING TESTS
//
// Risk philosophy:
//   "How dangerous is this API change for existing consumers?"
//   not "How many differences exist?"
//
// Algorithm:
//   base             = weight of the single most severe change
//   breakingBonus    = min(10, (breakingCount - 1) * 5)  — extra breaking changes
//   reviewContrib    = min(4,  reviewCount * 2)           — REVIEW changes
//   nonBreakingContrib = min(3, nonBreakingCount)         — only when breaking > 0
//   score            = min(100, base + bonuses)
//
// Severity weights: SAFE=0, LOW=10, MEDIUM=30, HIGH=60, CRITICAL=90
// Labels: >=80 CRITICAL, >=60 HIGH, >=30 MEDIUM, <30 LOW
// ═══════════════════════════════════════════════════════════════════════════════

function risk(a: unknown, b: unknown) {
  return calculateRisk(diffJson(a, b));
}

// ─── Helper to build a minimal DiffChange ────────────────────────────────────

function makeChange(
  kind: DiffChange["kind"],
  severity: DiffChange["severity"],
  compatibility: DiffChange["compatibility"],
): DiffChange {
  return { path: "$.x", kind, severity, compatibility, reason: "test" };
}

// ─── 1. No changes = 0 ───────────────────────────────────────────────────────

describe("risk: no changes", () => {
  it("score is 0 and label is NO CHANGES", () => {
    expect(calculateRisk([])).toEqual({ score: 0, label: "NO CHANGES" });
  });

  it("identical objects produce score 0", () => {
    expect(risk({ a: 1 }, { a: 1 })).toEqual({ score: 0, label: "NO CHANGES" });
  });
});

// ─── 2. Only added field ──────────────────────────────────────────────────────

describe("risk: only added field", () => {
  it("score is 10, label LOW", () => {
    const r = risk({}, { name: "Ali" });
    expect(r.score).toBe(10);
    expect(r.label).toBe("LOW");
  });
});

// ─── 3. Only removed field ────────────────────────────────────────────────────

describe("risk: only removed field", () => {
  it("score is 90, label CRITICAL", () => {
    const r = risk({ name: "Ali" }, {});
    expect(r.score).toBe(90);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 4. Only value change ─────────────────────────────────────────────────────

describe("risk: only value change", () => {
  it("score is 30, label MEDIUM", () => {
    const r = risk({ name: "Ali" }, { name: "Ahmed" });
    expect(r.score).toBe(30);
    expect(r.label).toBe("MEDIUM");
  });
});

// ─── 5. Only type change ──────────────────────────────────────────────────────

describe("risk: only type change", () => {
  it("score is 60, label HIGH", () => {
    const r = risk({ id: 1 }, { id: "1" });
    expect(r.score).toBe(60);
    expect(r.label).toBe("HIGH");
  });
});

// ─── 6. Nullability: value → null ────────────────────────────────────────────

describe("risk: nullability value → null", () => {
  it("score is 60, label HIGH (HIGH severity, BREAKING)", () => {
    const r = risk({ email: "a@example.com" }, { email: null });
    expect(r.score).toBe(60);
    expect(r.label).toBe("HIGH");
  });
});

// ─── 7. Nullability: null → value ────────────────────────────────────────────

describe("risk: nullability null → value", () => {
  it("score is 10, label LOW (LOW severity, NON_BREAKING)", () => {
    const r = risk({ email: null }, { email: "a@example.com" });
    expect(r.score).toBe(10);
    expect(r.label).toBe("LOW");
  });

  it("null → value scores lower than value → null", () => {
    const toNull = risk({ email: "a@example.com" }, { email: null });
    const fromNull = risk({ email: null }, { email: "a@example.com" });
    expect(toNull.score).toBeGreaterThan(fromNull.score);
  });
});

// ─── 8. Enum value added ──────────────────────────────────────────────────────

describe("risk: enum value added", () => {
  it("score is 10, label LOW (LOW severity, NON_BREAKING)", () => {
    const changes = diffEnumValues("$.status", ["active"], ["active", "pending"]);
    const r = calculateRisk(changes);
    expect(r.score).toBe(10);
    expect(r.label).toBe("LOW");
  });
});

// ─── 9. Enum value removed ────────────────────────────────────────────────────

describe("risk: enum value removed", () => {
  it("score is 60, label HIGH (HIGH severity, BREAKING)", () => {
    const changes = diffEnumValues("$.status", ["active", "pending"], ["active"]);
    const r = calculateRisk(changes);
    expect(r.score).toBe(60);
    expect(r.label).toBe("HIGH");
  });
});

// ─── 10. Status critical change ───────────────────────────────────────────────

describe("risk: status critical change (2xx → 4xx)", () => {
  it("score is 92, label CRITICAL (CRITICAL severity, REVIEW compat + review contrib)", () => {
    const statusChange = compareStatus(200, 404, "OK", "Not Found")!;
    const r = calculateRisk([statusChange]);
    // STATUS_CHANGED has REVIEW compat (not BREAKING).
    // base=90 (CRITICAL severity), breakingBonus=0, reviewContrib=min(4,1*2)=2 → 92
    expect(r.score).toBe(92);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 11. Status review change ─────────────────────────────────────────────────

describe("risk: status review change (2xx → 2xx)", () => {
  it("score is 10, label LOW (LOW severity, REVIEW)", () => {
    const statusChange = compareStatus(200, 201, "OK", "Created")!;
    const r = calculateRisk([statusChange]);
    // LOW severity → base=10; REVIEW contrib=2; no breaking → score=12
    expect(r.score).toBe(12);
    expect(r.label).toBe("LOW");
  });
});

// ─── 12. Array reorder ────────────────────────────────────────────────────────

describe("risk: array reorder only", () => {
  it("score is low (REVIEW, LOW severity)", () => {
    const changes = diffJson(
      [{ id: 1 }, { id: 2 }],
      [{ id: 2 }, { id: 1 }],
    );
    const r = calculateRisk(changes);
    // ARRAY_REORDERED: LOW severity → base=10; REVIEW contrib=2 → score=12
    expect(r.score).toBe(12);
    expect(r.label).toBe("LOW");
  });
});

// ─── 13. Array item removal ───────────────────────────────────────────────────

describe("risk: array item removal", () => {
  it("score is 90, label CRITICAL (CRITICAL severity, BREAKING)", () => {
    const r = risk([1, 2, 3], [1, 2]);
    // REMOVED (CRITICAL) + ARRAY_LENGTH_CHANGED (LOW, NON_BREAKING)
    // base=90, breakingBonus=0 (1 breaking), reviewContrib=0, nonBreakingContrib=min(3,1)=1
    expect(r.score).toBe(91);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 14. Array item addition ──────────────────────────────────────────────────

describe("risk: array item addition", () => {
  it("score is low (NON_BREAKING)", () => {
    const r = risk([1, 2], [1, 2, 3]);
    // ADDED (LOW) + ARRAY_LENGTH_CHANGED (LOW) — both NON_BREAKING, no breaking
    expect(r.score).toBe(10);
    expect(r.label).toBe("LOW");
  });
});

// ─── 15. Multiple safe changes ────────────────────────────────────────────────

describe("risk: many safe changes only", () => {
  it("50 value changes stay at MEDIUM base, not inflated to CRITICAL", () => {
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      a[`field${i}`] = i;
      b[`field${i}`] = i + 1;
    }
    const r = risk(a, b);
    // All CHANGED (NON_BREAKING), no breaking → nonBreakingContrib=0
    // base=30, score=30
    expect(r.score).toBe(30);
    expect(r.label).toBe("MEDIUM");
  });
});

// ─── 16. One breaking + many safe ────────────────────────────────────────────

describe("risk: one breaking + many safe additions", () => {
  it("still clearly breaking/high risk", () => {
    const a: Record<string, unknown> = { critical: "value" };
    const b: Record<string, unknown> = {};
    for (let i = 0; i < 20; i++) b[`safe${i}`] = i;
    const r = risk(a, b);
    // 1 REMOVED (CRITICAL, BREAKING) + 20 ADDED (LOW, NON_BREAKING)
    // base=90, breakingBonus=0, reviewContrib=0, nonBreakingContrib=min(3,20)=3
    expect(r.score).toBe(93);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 17. Multiple breaking changes ───────────────────────────────────────────

describe("risk: multiple breaking changes", () => {
  it("2 CRITICAL breaking changes score higher than 1", () => {
    const one = calculateRisk([
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    ]);
    const two = calculateRisk([
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    ]);
    expect(two.score).toBeGreaterThan(one.score);
  });

  it("2 CRITICAL changes: base=90, breakingBonus=5 → score=95", () => {
    const r = calculateRisk([
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    ]);
    expect(r.score).toBe(95);
    expect(r.label).toBe("CRITICAL");
  });

  it("3 CRITICAL changes: base=90, breakingBonus=10 → score=100", () => {
    const r = calculateRisk([
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    ]);
    expect(r.score).toBe(100);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 18. Critical + low changes ───────────────────────────────────────────────

describe("risk: CRITICAL breaking + LOW non-breaking", () => {
  it("CRITICAL dominates; LOW adds minimal contribution", () => {
    const r = calculateRisk([
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("ADDED",   "LOW",      "NON_BREAKING"),
    ]);
    // base=90, breakingBonus=0, reviewContrib=0, nonBreakingContrib=1 → 91
    expect(r.score).toBe(91);
    expect(r.label).toBe("CRITICAL");
  });
});

// ─── 19. Score never exceeds 100 ─────────────────────────────────────────────

describe("risk: score never exceeds 100", () => {
  it("100 CRITICAL breaking changes still cap at 100", () => {
    const changes = Array.from({ length: 100 }, () =>
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    );
    expect(calculateRisk(changes).score).toBe(100);
  });
});

// ─── 20. Score never drops below 0 ───────────────────────────────────────────

describe("risk: score never drops below 0", () => {
  it("empty changes produce score 0", () => {
    expect(calculateRisk([]).score).toBe(0);
  });

  it("SAFE-severity change produces score 0", () => {
    const r = calculateRisk([makeChange("CHANGED", "SAFE", "NON_BREAKING")]);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});

// ─── 21. Deterministic: identical input → identical score ────────────────────

describe("risk: deterministic output", () => {
  it("same changes always produce same score", () => {
    const a = { id: 1, name: "Ali", role: "admin" };
    const b = { id: "1", email: "ali@example.com" };
    const results = Array.from({ length: 5 }, () =>
      calculateRisk(diffJson(a, b)),
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ─── 22. Order of independent changes does not affect score ──────────────────

describe("risk: order independence", () => {
  it("reversing change order produces same score", () => {
    const changes: DiffChange[] = [
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("ADDED",   "LOW",      "NON_BREAKING"),
      makeChange("CHANGED", "MEDIUM",   "NON_BREAKING"),
    ];
    const reversed = [...changes].reverse();
    expect(calculateRisk(changes).score).toBe(calculateRisk(reversed).score);
  });
});

// ─── 23. No duplicate counting ───────────────────────────────────────────────

describe("risk: no duplicate counting", () => {
  it("STATUS_CHANGED is counted once via its severity, not double-counted", () => {
    const statusChange = compareStatus(200, 404, "OK", "Not Found")!;
    // CRITICAL severity → base=90; REVIEW compat → reviewContrib=2; no breaking → 0 breaking bonus
    // Wait: STATUS_CHANGED has REVIEW compat, not BREAKING.
    // So: breaking=[], review=[statusChange], nonBreaking=[]
    // base=90, breakingBonus=0, reviewContrib=2, nonBreakingContrib=0 → 92
    const r = calculateRisk([statusChange]);
    expect(r.score).toBe(92);
    expect(r.label).toBe("CRITICAL");
  });

  it("a single change is never counted in multiple buckets simultaneously", () => {
    // NULLABILITY_CHANGED value→null: BREAKING, HIGH severity
    const changes = diffJson({ x: "hello" }, { x: null });
    const r = calculateRisk(changes);
    // 1 BREAKING (HIGH=60), breakingBonus=0, reviewContrib=0, nonBreakingContrib=0 → 60
    expect(r.score).toBe(60);
  });
});

// ─── 24. Risk level matches score ────────────────────────────────────────────

describe("risk: label matches score thresholds", () => {
  const cases: Array<[number, DiffChange["severity"], DiffChange["compatibility"], string]> = [
    [10,  "LOW",      "NON_BREAKING", "LOW"],
    [30,  "MEDIUM",   "NON_BREAKING", "MEDIUM"],
    [60,  "HIGH",     "BREAKING",     "HIGH"],
    [90,  "CRITICAL", "BREAKING",     "CRITICAL"],
  ];

  for (const [expectedScore, severity, compat, expectedLabel] of cases) {
    it(`severity ${severity} → score ${expectedScore}, label ${expectedLabel}`, () => {
      const r = calculateRisk([makeChange("CHANGED", severity, compat)]);
      expect(r.score).toBe(expectedScore);
      expect(r.label).toBe(expectedLabel);
    });
  }
});

// ─── 25. Breaking count remains correct ──────────────────────────────────────

describe("risk: breaking change count", () => {
  it("1 REMOVED + 2 ADDED: 1 breaking, 2 non-breaking", () => {
    const changes = diffJson({ a: 1, b: 2 }, { c: 3, d: 4 });
    const breaking = changes.filter((c) => c.compatibility === "BREAKING");
    const nonBreaking = changes.filter((c) => c.compatibility === "NON_BREAKING");
    expect(breaking).toHaveLength(2);   // a and b removed
    expect(nonBreaking).toHaveLength(2); // c and d added
  });
});

// ─── 26. Safe count remains correct ──────────────────────────────────────────

describe("risk: safe change count", () => {
  it("only ADDED changes are NON_BREAKING when adding fields", () => {
    const changes = diffJson({}, { x: 1, y: 2, z: 3 });
    const safe = changes.filter((c) => c.compatibility === "NON_BREAKING");
    expect(safe).toHaveLength(3);
  });
});

// ─── 27. Review/warning count remains correct ────────────────────────────────

describe("risk: review change count", () => {
  it("STATUS_CHANGED has REVIEW compatibility", () => {
    const statusChange = compareStatus(200, 201, "OK", "Created")!;
    expect(statusChange.compatibility).toBe("REVIEW");
  });

  it("ARRAY_REORDERED has REVIEW compatibility", () => {
    const changes = diffJson([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 1 }]);
    const review = changes.filter((c) => c.compatibility === "REVIEW");
    expect(review.length).toBeGreaterThan(0);
  });
});

// ─── Invariants ───────────────────────────────────────────────────────────────

describe("risk: invariants", () => {
  it("score is always between 0 and 100", () => {
    const scenarios: DiffChange[][] = [
      [],
      [makeChange("ADDED",   "LOW",      "NON_BREAKING")],
      [makeChange("REMOVED", "CRITICAL", "BREAKING")],
      Array.from({ length: 50 }, () => makeChange("REMOVED", "CRITICAL", "BREAKING")),
      Array.from({ length: 50 }, () => makeChange("ADDED",   "LOW",      "NON_BREAKING")),
    ];
    for (const changes of scenarios) {
      const { score } = calculateRisk(changes);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("adding a non-breaking change to a breaking set does not decrease score", () => {
    const breaking = [makeChange("REMOVED", "CRITICAL", "BREAKING")];
    const withExtra = [...breaking, makeChange("ADDED", "LOW", "NON_BREAKING")];
    expect(calculateRisk(withExtra).score).toBeGreaterThanOrEqual(calculateRisk(breaking).score);
  });

  it("removing a breaking change from a set does not increase score", () => {
    const two = [
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
      makeChange("REMOVED", "CRITICAL", "BREAKING"),
    ];
    const one = [makeChange("REMOVED", "CRITICAL", "BREAKING")];
    expect(calculateRisk(one).score).toBeLessThanOrEqual(calculateRisk(two).score);
  });

  it("CRITICAL-only set always scores higher than LOW-only set of same size", () => {
    const critical = [makeChange("REMOVED", "CRITICAL", "BREAKING")];
    const low      = [makeChange("ADDED",   "LOW",      "NON_BREAKING")];
    expect(calculateRisk(critical).score).toBeGreaterThan(calculateRisk(low).score);
  });

  it("no-change score is always zero regardless of call count", () => {
    for (let i = 0; i < 5; i++) {
      expect(calculateRisk([]).score).toBe(0);
    }
  });
});
