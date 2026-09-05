import type { DiffChange } from "@/types/diff";
import { classifyCompatibility } from "@/lib/diff/compatibility";

/**
 * Schema-aware enum diff.
 *
 * IMPORTANT: This function must only be called with explicit enum value arrays
 * sourced from an API contract (OpenAPI / JSON Schema). It must NEVER be called
 * with values observed from a raw JSON response, because response values alone
 * do not prove enum membership.
 *
 * Raw JSON comparison (diffJson) never calls this function. The deterministic
 * diff engine produces CHANGED for ordinary value differences and does not
 * fabricate enum semantics.
 *
 * Comparison is set-based (order-independent) and type-strict:
 *   - 1 and "1" are treated as distinct values.
 *   - Duplicate values within a single enum array are deduplicated before
 *     comparison — membership is what matters, not multiplicity.
 *
 * @param path       JSON path of the field whose enum definition changed.
 * @param baseline   Enum values from the baseline contract.
 * @param candidate  Enum values from the candidate contract.
 * @returns          Array of DiffChange (ENUM_VALUE_ADDED / ENUM_VALUE_REMOVED).
 *                   Empty when the enum sets are identical.
 */
export function diffEnumValues(
  path: string,
  baseline: readonly unknown[],
  candidate: readonly unknown[],
): DiffChange[] {
  // Use JSON.stringify as the map key to handle strict type distinction
  // (1 vs "1", true vs "true") without coercion.
  const toKey = (v: unknown): string => JSON.stringify(v);

  const baselineSet = new Map<string, unknown>();
  for (const v of baseline) {
    baselineSet.set(toKey(v), v);
  }

  const candidateSet = new Map<string, unknown>();
  for (const v of candidate) {
    candidateSet.set(toKey(v), v);
  }

  const out: DiffChange[] = [];

  // Values present in baseline but absent in candidate → REMOVED.
  for (const [key, value] of baselineSet) {
    if (!candidateSet.has(key)) {
      out.push({
        path,
        kind: "ENUM_VALUE_REMOVED",
        severity: "HIGH",
        enumValue: value,
        compatibility: classifyCompatibility("ENUM_VALUE_REMOVED"),
        reason: `Enum value ${JSON.stringify(value)} was removed from the contract. Consumers sending or expecting this value will break.`,
      });
    }
  }

  // Values present in candidate but absent in baseline → ADDED.
  for (const [key, value] of candidateSet) {
    if (!baselineSet.has(key)) {
      out.push({
        path,
        kind: "ENUM_VALUE_ADDED",
        severity: "LOW",
        enumValue: value,
        compatibility: classifyCompatibility("ENUM_VALUE_ADDED"),
        reason: `Enum value ${JSON.stringify(value)} was added to the contract. Existing consumers are unaffected, but exhaustive switch/match logic may need updating.`,
      });
    }
  }

  return out;
}
