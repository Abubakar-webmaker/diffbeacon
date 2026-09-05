import type { ChangeKind, Compatibility, DiffChange } from "@/types/diff";

/**
 * Deterministic compatibility classification table.
 *
 * Rules:
 *   REMOVED              → BREAKING   (consumers reading the field will fail)
 *   TYPE_CHANGED         → BREAKING   (downstream parsing / validation will break)
 *   NULLABILITY_CHANGED  → BREAKING   (safe default; engine overrides to NON_BREAKING
 *                                      for null → value transitions — see engine.ts)
 *   ENUM_VALUE_REMOVED   → BREAKING   (a previously valid value is no longer accepted)
 *   ADDED                → NON_BREAKING (consumers can ignore unknown fields)
 *   CHANGED              → NON_BREAKING (value changed, same shape)
 *   ARRAY_LENGTH_CHANGED → NON_BREAKING (length is not a contract guarantee by default)
 *   ENUM_VALUE_ADDED     → NON_BREAKING (new allowed value; existing values still valid)
 *   ARRAY_REORDERED      → REVIEW     (order-sensitive consumers may be affected)
 *   ADDITIONAL_PROPERTIES_CHANGED → REVIEW     (tightening may break consumers)
 */
export function classifyCompatibility(kind: ChangeKind): Compatibility {
  switch (kind) {
    case "REMOVED":
    case "TYPE_CHANGED":
    case "NULLABILITY_CHANGED":
    case "ENUM_VALUE_REMOVED":
    case "NULLABILITY_SCHEMA_CHANGED":
      return "BREAKING";

    case "ADDED":
    case "CHANGED":
    case "ARRAY_LENGTH_CHANGED":
    case "ENUM_VALUE_ADDED":
      return "NON_BREAKING";

    case "ARRAY_REORDERED":
    case "STATUS_CHANGED":
    case "CONTRACT_REQUIREMENT_CHANGED":
    case "ADDITIONAL_PROPERTIES_CHANGED":
      return "REVIEW";
  }
}

/** Returns true when the change is deterministically breaking. */
export function isBreakingChange(change: DiffChange): boolean {
  return (change.compatibility ?? classifyCompatibility(change.kind)) === "BREAKING";
}

/**
 * Stamps a `compatibility` field onto every change in the array.
 * Preserves any compatibility already set on the change (e.g. direction-aware
 * nullability changes stamped by the engine before this runs).
 * Returns a new array; the originals are not mutated.
 */
export function annotateCompatibility(changes: DiffChange[]): DiffChange[] {
  return changes.map((c) => ({
    ...c,
    compatibility: c.compatibility ?? classifyCompatibility(c.kind),
  }));
}
