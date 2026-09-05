import type { DiffChange, FieldRequirement, RiskResult, Severity } from "@/types/diff";
import { annotateCompatibility, classifyCompatibility } from "@/lib/diff/compatibility";
import { detectIdentityKey, diffByIdentity, diffByIndex } from "@/lib/diff/arrays";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Nullability change detection.
 *
 * Fires when exactly one side is null (null XOR non-null).
 * Direction rules:
 *   value → null  → HIGH severity, BREAKING  (consumers may not handle null)
 *   null  → value → LOW  severity, NON_BREAKING (previously null, now has a value)
 */
function classifyNullability(
  path: string,
  before: unknown,
  after: unknown,
): DiffChange {
  const valueToNull = before !== null && after === null;
  const baselineType  = jsonType(before);
  const candidateType = jsonType(after);

  if (valueToNull) {
    return {
      path,
      kind: "NULLABILITY_CHANGED",
      severity: "HIGH",
      before,
      after,
      baselineType,
      candidateType,
      compatibility: "BREAKING",
      reason: `The value changed from ${baselineType} to null. Consumers that do not handle null may throw or produce incorrect results.`,
    };
  }

  // null → value
  return {
    path,
    kind: "NULLABILITY_CHANGED",
    severity: "LOW",
    before,
    after,
    baselineType,
    candidateType,
    compatibility: "NON_BREAKING",
    reason: `The value changed from null to ${candidateType}. Consumers that previously handled null should verify the new value type.`,
  };
}

function classify(
  kind: DiffChange["kind"],
  before: unknown,
  after: unknown,
): { severity: Severity; reason: string } {
  switch (kind) {
    case "REMOVED":
      return {
        severity: "CRITICAL",
        reason: "A response property was removed. Existing consumers may fail when they read it.",
      };
    case "TYPE_CHANGED":
      return {
        severity: "HIGH",
        reason: `The value type changed from ${jsonType(before)} to ${jsonType(after)}. Downstream parsing or validation may break.`,
      };
    case "ARRAY_LENGTH_CHANGED":
      return {
        severity: "LOW",
        reason: "The response array length changed. Clients should confirm their pagination or empty-state assumptions.",
      };
    case "ADDED":
      return {
        severity: "LOW",
        reason: "A new response property was added. Most clients can ignore unknown properties.",
      };
    case "CHANGED":
      return {
        severity: "MEDIUM",
        reason: "An existing response value changed. Client assumptions or business logic may need review.",
      };
    default:
      return {
        severity: "MEDIUM",
        reason: "A response property changed.",
      };
  }
}

/**
 * Raw JSON field-presence semantics.
 *
 * ADDED   — field is present in candidate but absent in baseline.
 * REMOVED — field is present in baseline but absent in candidate.
 *
 * NOTE: These changes carry fieldRequirement: "UNKNOWN" because raw JSON
 * response comparison cannot determine whether a field is formally required
 * or optional. That requires API contract information (OpenAPI / JSON Schema).
 * A future schema-aware layer can upgrade fieldRequirement to REQUIRED or
 * OPTIONAL once contract information is available.
 */
const UNKNOWN_REQUIREMENT: FieldRequirement = "UNKNOWN";

export function diffJson(
  before: unknown,
  after: unknown,
  path = "$",
  out: DiffChange[] = [],
): DiffChange[] {
  const beforeType = jsonType(before);
  const afterType  = jsonType(after);

  if (beforeType !== afterType) {
    // Nullability check MUST come before generic TYPE_CHANGED.
    // Fires when exactly one side is null.
    if (before === null || after === null) {
      out.push(classifyNullability(path, before, after));
    } else {
      const meta = classify("TYPE_CHANGED", before, after);
      out.push({ path, kind: "TYPE_CHANGED", before, after, ...meta });
    }
    return path === "$" ? annotateCompatibility(out) : out;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const nextPath = `${path}.${key}`;
      if (!(key in before)) {
        const meta = classify("ADDED", undefined, after[key]);
        out.push({ path: nextPath, kind: "ADDED", after: after[key], fieldRequirement: UNKNOWN_REQUIREMENT, ...meta });
      } else if (!(key in after)) {
        const meta = classify("REMOVED", before[key], undefined);
        out.push({ path: nextPath, kind: "REMOVED", before: before[key], fieldRequirement: UNKNOWN_REQUIREMENT, ...meta });
      } else {
        diffJson(before[key], after[key], nextPath, out);
      }
    }
    return path === "$" ? annotateCompatibility(out) : out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const diffItem = (a: unknown, b: unknown, p: string, o: DiffChange[]) => {
      diffJson(a, b, p, o);
    };
    // Detect identity key from the larger of the two arrays (or either if same size).
    // detectIdentityKey checks for uniqueness within the provided array.
    const identityKey = detectIdentityKey(before.length >= after.length ? before : after);
    if (identityKey !== null) {
      diffByIdentity(before, after, path, identityKey, diffItem, out);
    } else {
      diffByIndex(before, after, path, diffItem, out);
    }
    return path === "$" ? annotateCompatibility(out) : out;
  }

  if (!Object.is(before, after)) {
    const meta = classify("CHANGED", before, after);
    out.push({ path, kind: "CHANGED", before, after, ...meta });
  }

  return path === "$" ? annotateCompatibility(out) : out;
}

/**
 * Risk scoring philosophy:
 *
 * The score answers "How dangerous is this API change for existing consumers?"
 * not "How many differences exist?"
 *
 * Algorithm (O(n), bounded 0–100):
 *
 * 1. BASE — the weight of the single most severe change. This preserves
 *    deterministic single-change scores and ensures one serious breaking
 *    change always dominates.
 *
 * 2. BREAKING BONUS — each additional breaking change beyond the first
 *    contributes a diminishing amount (5 pts each, capped at 10 pts total).
 *    This lets 2+ breaking changes push the score higher without letting
 *    a large count of minor breaking changes inflate it unboundedly.
 *
 * 3. REVIEW CONTRIBUTION — each REVIEW-compatibility change contributes
 *    2 pts (capped at 4 pts total). Status changes and array reorders
 *    warrant attention but should not dominate.
 *
 * 4. NON-BREAKING CONTRIBUTION — each NON_BREAKING change contributes
 *    1 pt (capped at 3 pts total). Many safe additions should not
 *    overpower a single serious breaking change.
 *
 * Severity weights (unchanged from original model):
 *   SAFE     =  0
 *   LOW      = 10
 *   MEDIUM   = 30
 *   HIGH     = 60
 *   CRITICAL = 90
 *
 * Score-to-label thresholds:
 *   >= 80 → CRITICAL
 *   >= 60 → HIGH
 *   >= 30 → MEDIUM
 *    < 30 → LOW
 */
const severityWeight: Record<Severity, number> = {
  SAFE: 0,
  LOW: 10,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 90,
};

export function calculateRisk(changes: DiffChange[]): RiskResult {
  if (!changes.length) return { score: 0, label: "NO CHANGES" };

  // Resolve compatibility for each change (respect pre-stamped values).
  const compat = (c: DiffChange) =>
    c.compatibility ?? classifyCompatibility(c.kind);

  const breaking    = changes.filter((c) => compat(c) === "BREAKING");
  const review      = changes.filter((c) => compat(c) === "REVIEW");
  const nonBreaking = changes.filter((c) => compat(c) === "NON_BREAKING");

  // 1. Base: highest severity weight across ALL changes.
  const base = Math.max(...changes.map((c) => severityWeight[c.severity]));

  // 2. Breaking bonus: each additional breaking change beyond the first
  //    contributes 5 pts, capped at 10 pts.
  const breakingBonus = Math.min(10, Math.max(0, breaking.length - 1) * 5);

  // 3. Review contribution: 2 pts each, capped at 4 pts.
  const reviewContrib = Math.min(4, review.length * 2);

  // 4. Non-breaking contribution: 1 pt each, capped at 3 pts.
  //    Only applied when breaking changes are also present — pure non-breaking
  //    scenarios stay at their base score so single-change tests are unaffected.
  const nonBreakingContrib = breaking.length > 0 ? Math.min(3, nonBreaking.length) : 0;

  const score = Math.min(100, base + breakingBonus + reviewContrib + nonBreakingContrib);
  const label = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  return { score, label };
}
