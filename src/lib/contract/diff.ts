import type { DiffChange, FieldRequirement, ContractDirection, Compatibility } from "@/types/diff";
import type { NormalizedSchema } from "./types";
import { diffEnumValues } from "@/lib/diff/enums";
import { annotateCompatibility } from "@/lib/diff/compatibility";

/**
 * Contract diff engine.
 *
 * Compares two NormalizedSchema trees and produces DiffChange[] using the
 * same change kinds and compatibility rules as the raw JSON diff engine.
 *
 * Key differences from raw JSON diff:
 *   - fieldRequirement is REQUIRED or OPTIONAL (never UNKNOWN) when schema info exists.
 *   - Enum changes use diffEnumValues() with actual contract enum arrays.
 *   - Nullability changes come from schema metadata, not observed JSON values.
 *   - CONTRACT_REQUIREMENT_CHANGED is emitted when required/optional status changes.
 *   - Direction (REQUEST/RESPONSE) affects compatibility of requirement changes.
 *
 * Direction semantics:
 *   REQUEST:
 *     optional → required = BREAKING  (clients may not send the field)
 *     required → optional = NON_BREAKING
 *
 *   RESPONSE:
 *     optional → required = NON_BREAKING (server now guarantees the field)
 *     required → optional = BREAKING     (clients can no longer rely on it)
 */

function requirementOf(schema: NormalizedSchema, key: string): FieldRequirement {
  return schema.required.has(key) ? "REQUIRED" : "OPTIONAL";
}

function requirementChangeCompatibility(
  before: FieldRequirement,
  after: FieldRequirement,
  direction: ContractDirection,
): Compatibility {
  if (before === after) return "NON_BREAKING";

  if (direction === "REQUEST") {
    // optional → required: clients may not send it → BREAKING
    // required → optional: clients can now omit it → NON_BREAKING
    return after === "REQUIRED" ? "BREAKING" : "NON_BREAKING";
  } else {
    // RESPONSE
    // optional → required: server guarantees it → NON_BREAKING
    // required → optional: clients can no longer rely on it → BREAKING
    return after === "OPTIONAL" ? "BREAKING" : "NON_BREAKING";
  }
}

function diffSchemas(
  baseline: NormalizedSchema,
  candidate: NormalizedSchema,
  direction: ContractDirection,
  out: DiffChange[],
): void {
  const path = baseline.path;

  // ── Type change ──────────────────────────────────────────────────────────
  const baseTypes = baseline.type.filter((t) => t !== "null").sort().join("|");
  const candTypes = candidate.type.filter((t) => t !== "null").sort().join("|");
  if (baseTypes !== candTypes && baseTypes !== "unknown" && candTypes !== "unknown") {
    out.push({
      path,
      kind: "TYPE_CHANGED",
      severity: "HIGH",
      compatibility: "BREAKING",
      direction,
      before: baseTypes,
      after: candTypes,
      reason: `Schema type changed from "${baseTypes}" to "${candTypes}". Downstream parsing or validation may break.`,
    });
  }

  // ── Nullability change ───────────────────────────────────────────────────
  if (baseline.nullable !== candidate.nullable) {
    const toNullable = !baseline.nullable && candidate.nullable;
    out.push({
      path,
      kind: "NULLABILITY_SCHEMA_CHANGED",
      severity: toNullable ? "MEDIUM" : "HIGH",
      compatibility: toNullable ? "NON_BREAKING" : "BREAKING",
      direction,
      before: baseline.nullable,
      after: candidate.nullable,
      reason: toNullable
        ? `Field became nullable. Consumers must now handle null values.`
        : `Field is no longer nullable. Consumers that send or expect null will break.`,
    });
  }

  // ── Enum changes ─────────────────────────────────────────────────────────
  if (baseline.enumValues !== null || candidate.enumValues !== null) {
    const baseEnum = baseline.enumValues ?? [];
    const candEnum = candidate.enumValues ?? [];
    const enumChanges = diffEnumValues(path, baseEnum, candEnum);
    for (const c of enumChanges) {
      out.push({ ...c, direction });
    }
  }

  // ── additionalProperties change ──────────────────────────────────────────
  const baseAp = baseline.additionalProperties;
  const candAp = candidate.additionalProperties;
  if (baseAp !== candAp) {
    const tightening = (baseAp === null || baseAp === true) && candAp === false;
    const loosening  = baseAp === false && (candAp === null || candAp === true);
    out.push({
      path,
      kind: "ADDITIONAL_PROPERTIES_CHANGED",
      severity: tightening ? "MEDIUM" : "LOW",
      compatibility: tightening ? "REVIEW" : "NON_BREAKING",
      direction,
      before: baseAp,
      after: candAp,
      reason: tightening
        ? `additionalProperties changed to false. Consumers sending extra fields will now fail validation.`
        : loosening
        ? `additionalProperties is now allowed. Previously strict schema is now permissive.`
        : `additionalProperties constraint changed.`,
    });
  }

  // ── Object properties ────────────────────────────────────────────────────
  const allKeys = new Set([...baseline.properties.keys(), ...candidate.properties.keys()]);
  for (const key of allKeys) {
    const childPath = `${path}.${key}`;
    const inBaseline = baseline.properties.has(key);
    const inCandidate = candidate.properties.has(key);

    if (!inBaseline && inCandidate) {
      // Property added
      const req = requirementOf(candidate, key);
      const addedCompat: Compatibility =
        direction === "REQUEST" && req === "REQUIRED" ? "BREAKING" : "NON_BREAKING";
      out.push({
        path: childPath,
        kind: "ADDED",
        severity: direction === "REQUEST" && req === "REQUIRED" ? "HIGH" : "LOW",
        compatibility: addedCompat,
        fieldRequirement: req,
        direction,
        after: req,
        reason:
          direction === "REQUEST" && req === "REQUIRED"
            ? `Required property "${key}" was added to the request schema. Existing clients that do not send it will fail validation.`
            : `Property "${key}" was added to the schema (${req.toLowerCase()}). Existing consumers are unaffected.`,
      });
    } else if (inBaseline && !inCandidate) {
      // Property removed
      const req = requirementOf(baseline, key);
      out.push({
        path: childPath,
        kind: "REMOVED",
        severity: "CRITICAL",
        compatibility: "BREAKING",
        fieldRequirement: req,
        direction,
        before: req,
        reason: `Property "${key}" (${req.toLowerCase()}) was removed from the schema. Consumers that reference it will break.`,
      });
    } else if (inBaseline && inCandidate) {
      // Property exists in both — check requirement change
      const baseReq = requirementOf(baseline, key);
      const candReq = requirementOf(candidate, key);
      if (baseReq !== candReq) {
        const compat = requirementChangeCompatibility(baseReq, candReq, direction);
        out.push({
          path: childPath,
          kind: "CONTRACT_REQUIREMENT_CHANGED",
          severity: compat === "BREAKING" ? "HIGH" : "LOW",
          compatibility: compat,
          fieldRequirement: candReq,
          requirementBefore: baseReq,
          requirementAfter: candReq,
          direction,
          before: baseReq,
          after: candReq,
          reason: buildRequirementReason(key, baseReq, candReq, direction, compat),
        });
      }

      // Recurse into child schema
      const baseChild = baseline.properties.get(key)!;
      const candChild = candidate.properties.get(key)!;
      diffSchemas(baseChild, candChild, direction, out);
    }
  }

  // ── Array items ──────────────────────────────────────────────────────────
  if (baseline.items !== null && candidate.items !== null) {
    diffSchemas(baseline.items, candidate.items, direction, out);
  } else if (baseline.items !== null && candidate.items === null) {
    out.push({
      path: `${path}[]`,
      kind: "REMOVED",
      severity: "HIGH",
      compatibility: "BREAKING",
      direction,
      reason: `Array item schema was removed. Consumers that validate array items will break.`,
    });
  } else if (baseline.items === null && candidate.items !== null) {
    out.push({
      path: `${path}[]`,
      kind: "ADDED",
      severity: "LOW",
      compatibility: "NON_BREAKING",
      direction,
      reason: `Array item schema was added. Consumers may now validate array items.`,
    });
  }
}

function buildRequirementReason(
  key: string,
  before: FieldRequirement,
  after: FieldRequirement,
  direction: ContractDirection,
  compat: Compatibility,
): string {
  const dir = direction.toLowerCase();
  if (before === "OPTIONAL" && after === "REQUIRED") {
    return compat === "BREAKING"
      ? `Property "${key}" changed from optional to required in the ${dir} schema. Existing clients that omit it will fail validation.`
      : `Property "${key}" changed from optional to required in the ${dir} schema. The server now guarantees this field is present.`;
  }
  return compat === "BREAKING"
    ? `Property "${key}" changed from required to optional in the ${dir} schema. Clients that rely on it being present may break.`
    : `Property "${key}" changed from required to optional in the ${dir} schema. Clients may now omit it.`;
}

/**
 * Compares two normalized schemas and returns annotated DiffChange[].
 * Reuses the existing annotateCompatibility function.
 */
export function diffContracts(
  baseline: NormalizedSchema,
  candidate: NormalizedSchema,
  direction: ContractDirection,
): DiffChange[] {
  const out: DiffChange[] = [];
  diffSchemas(baseline, candidate, direction, out);
  // annotateCompatibility preserves pre-stamped compatibility values
  return annotateCompatibility(out);
}
