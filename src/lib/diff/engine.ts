import type { DiffChange, RiskResult, Severity } from "@/types/diff";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function jsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
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
  }
}

export function diffJson(
  before: unknown,
  after: unknown,
  path = "$",
  out: DiffChange[] = [],
): DiffChange[] {
  const beforeType = jsonType(before);
  const afterType = jsonType(after);

  if (beforeType !== afterType) {
    const meta = classify("TYPE_CHANGED", before, after);
    out.push({ path, kind: "TYPE_CHANGED", before, after, ...meta });
    return out;
  }

  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const nextPath = `${path}.${key}`;
      if (!(key in before)) {
        const meta = classify("ADDED", undefined, after[key]);
        out.push({ path: nextPath, kind: "ADDED", after: after[key], ...meta });
      } else if (!(key in after)) {
        const meta = classify("REMOVED", before[key], undefined);
        out.push({ path: nextPath, kind: "REMOVED", before: before[key], ...meta });
      } else {
        diffJson(before[key], after[key], nextPath, out);
      }
    }
    return out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      const meta = classify("ARRAY_LENGTH_CHANGED", before.length, after.length);
      out.push({
        path,
        kind: "ARRAY_LENGTH_CHANGED",
        before: before.length,
        after: after.length,
        ...meta,
      });
    }

    const max = Math.max(before.length, after.length);
    for (let i = 0; i < max; i += 1) {
      const nextPath = `${path}[${i}]`;
      if (i >= before.length) {
        const meta = classify("ADDED", undefined, after[i]);
        out.push({ path: nextPath, kind: "ADDED", after: after[i], ...meta });
      } else if (i >= after.length) {
        const meta = classify("REMOVED", before[i], undefined);
        out.push({ path: nextPath, kind: "REMOVED", before: before[i], ...meta });
      } else {
        diffJson(before[i], after[i], nextPath, out);
      }
    }
    return out;
  }

  if (!Object.is(before, after)) {
    const meta = classify("CHANGED", before, after);
    out.push({ path, kind: "CHANGED", before, after, ...meta });
  }

  return out;
}

const severityWeight: Record<Severity, number> = {
  SAFE: 0,
  LOW: 10,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 90,
};

export function calculateRisk(changes: DiffChange[]): RiskResult {
  if (!changes.length) return { score: 0, label: "NO CHANGES" };
  const score = Math.min(100, Math.max(...changes.map((change) => severityWeight[change.severity])));
  const label = score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  return { score, label };
}
