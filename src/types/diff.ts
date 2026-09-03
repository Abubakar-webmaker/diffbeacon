export type ChangeKind =
  | "ADDED"
  | "REMOVED"
  | "CHANGED"
  | "TYPE_CHANGED"
  | "ARRAY_LENGTH_CHANGED";

export type Severity = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DiffChange {
  path: string;
  kind: ChangeKind;
  severity: Severity;
  before?: unknown;
  after?: unknown;
  reason: string;
}

export interface RiskResult {
  score: number;
  label: "NO CHANGES" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}
