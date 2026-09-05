import type { DiffChange, Severity } from "@/types/diff";

// ─── Identity key detection ───────────────────────────────────────────────────

const IDENTITY_KEYS = ["id", "key", "uuid"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Returns the identity key if every item in the array is an object that
 * consistently contains the same stable identity key with a unique primitive
 * value. Returns null if the array is empty, contains non-objects, has
 * duplicate identity values, or has no recognised identity key.
 */
export function detectIdentityKey(items: unknown[]): string | null {
  if (items.length === 0) return null;

  for (const key of IDENTITY_KEYS) {
    if (!items.every((item) => isRecord(item) && key in item)) continue;

    const values = (items as Record<string, unknown>[]).map((item) => item[key]);
    if (!values.every((v) => typeof v === "string" || typeof v === "number")) continue;

    // Reject duplicate identity values — fall back to index-based comparison.
    const set = new Set(values);
    if (set.size !== values.length) continue;

    return key;
  }

  return null;
}

// ─── Severity / reason helpers ────────────────────────────────────────────────

function severityFor(kind: DiffChange["kind"], before: unknown, after: unknown): { severity: Severity; reason: string } {
  switch (kind) {
    case "REMOVED":
      return { severity: "CRITICAL", reason: "A response property was removed. Existing consumers may fail when they read it." };
    case "TYPE_CHANGED":
      return { severity: "HIGH", reason: `The value type changed from ${jsonType(before)} to ${jsonType(after)}. Downstream parsing or validation may break.` };
    case "ARRAY_LENGTH_CHANGED":
      return { severity: "LOW", reason: "The response array length changed. Clients should confirm their pagination or empty-state assumptions." };
    case "ADDED":
      return { severity: "LOW", reason: "A new response property was added. Most clients can ignore unknown properties." };
    case "ARRAY_REORDERED":
      return { severity: "LOW", reason: "Array items were reordered. Consumers that rely on positional access should review their logic." };
    default:
      return { severity: "MEDIUM", reason: "An existing response value changed. Client assumptions or business logic may need review." };
  }
}

function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// ─── Identity-based array diff ────────────────────────────────────────────────

/**
 * Diffs two arrays using identity-key matching.
 * Delegates structural comparison of matched items back to the engine via the
 * provided `diffItem` callback to avoid circular imports.
 */
export function diffByIdentity(
  before: unknown[],
  after: unknown[],
  path: string,
  identityKey: string,
  diffItem: (a: unknown, b: unknown, p: string, out: DiffChange[]) => void,
  out: DiffChange[],
): void {
  const beforeMap = new Map<unknown, Record<string, unknown>>();
  for (const item of before as Record<string, unknown>[]) {
    beforeMap.set(item[identityKey], item);
  }

  const afterMap = new Map<unknown, Record<string, unknown>>();
  for (const item of after as Record<string, unknown>[]) {
    afterMap.set(item[identityKey], item);
  }

  // Detect reordering: same set of ids, different order.
  const beforeIds = (before as Record<string, unknown>[]).map((i) => i[identityKey]);
  const afterIds  = (after  as Record<string, unknown>[]).map((i) => i[identityKey]);
  const sameSet =
    beforeIds.length === afterIds.length &&
    beforeIds.every((id) => afterMap.has(id));

  if (sameSet && JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) {
    out.push({
      path,
      kind: "ARRAY_REORDERED",
      before: beforeIds,
      after: afterIds,
      ...severityFor("ARRAY_REORDERED", beforeIds, afterIds),
    });
  }

  // Length change.
  if (before.length !== after.length) {
    out.push({
      path,
      kind: "ARRAY_LENGTH_CHANGED",
      before: before.length,
      after: after.length,
      ...severityFor("ARRAY_LENGTH_CHANGED", before.length, after.length),
    });
  }

  // Removed items.
  for (const [id, item] of beforeMap) {
    if (!afterMap.has(id)) {
      const idx = (before as Record<string, unknown>[]).findIndex((i) => i[identityKey] === id);
      out.push({
        path: `${path}[${idx}]`,
        kind: "REMOVED",
        before: item,
        ...severityFor("REMOVED", item, undefined),
      });
    }
  }

  // Added items.
  for (const [id, item] of afterMap) {
    if (!beforeMap.has(id)) {
      const idx = (after as Record<string, unknown>[]).findIndex((i) => i[identityKey] === id);
      out.push({
        path: `${path}[${idx}]`,
        kind: "ADDED",
        after: item,
        ...severityFor("ADDED", undefined, item),
      });
    }
  }

  // Structural diff of matched items.
  for (const [id, beforeItem] of beforeMap) {
    const afterItem = afterMap.get(id);
    if (afterItem !== undefined) {
      const idx = (after as Record<string, unknown>[]).findIndex((i) => i[identityKey] === id);
      diffItem(beforeItem, afterItem, `${path}[${idx}]`, out);
    }
  }
}

// ─── Index-based array diff ───────────────────────────────────────────────────

/**
 * Diffs two arrays using positional (index-based) comparison.
 * This is the default when no stable identity key is detected.
 */
export function diffByIndex(
  before: unknown[],
  after: unknown[],
  path: string,
  diffItem: (a: unknown, b: unknown, p: string, out: DiffChange[]) => void,
  out: DiffChange[],
): void {
  if (before.length !== after.length) {
    out.push({
      path,
      kind: "ARRAY_LENGTH_CHANGED",
      before: before.length,
      after: after.length,
      ...severityFor("ARRAY_LENGTH_CHANGED", before.length, after.length),
    });
  }

  const max = Math.max(before.length, after.length);
  for (let i = 0; i < max; i++) {
    const itemPath = `${path}[${i}]`;
    if (i >= before.length) {
      out.push({ path: itemPath, kind: "ADDED", after: after[i], ...severityFor("ADDED", undefined, after[i]) });
    } else if (i >= after.length) {
      out.push({ path: itemPath, kind: "REMOVED", before: before[i], ...severityFor("REMOVED", before[i], undefined) });
    } else {
      diffItem(before[i], after[i], itemPath, out);
    }
  }
}
