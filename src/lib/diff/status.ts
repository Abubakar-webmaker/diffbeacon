import type { DiffChange, Severity } from "@/types/diff";
import { classifyCompatibility } from "@/lib/diff/compatibility";

function statusClass(code: number): "2xx" | "3xx" | "4xx" | "5xx" | "other" {
  if (code >= 200 && code < 300) return "2xx";
  if (code >= 300 && code < 400) return "3xx";
  if (code >= 400 && code < 500) return "4xx";
  if (code >= 500 && code < 600) return "5xx";
  return "other";
}

/**
 * Deterministic severity table for HTTP status-code transitions.
 *
 * Rules (applied in order, first match wins):
 *  1. Same code          → no change (caller should not call this)
 *  2. 2xx → 2xx          → LOW   (different success code, not breaking by itself)
 *  3. 2xx → 4xx          → CRITICAL (was working, now client error)
 *  4. 2xx → 5xx          → CRITICAL (was working, now server error)
 *  5. 2xx → 3xx          → MEDIUM  (redirect introduced)
 *  6. 4xx/5xx → 2xx      → HIGH    (error resolved — significant behavioral change)
 *  7. 4xx → 4xx          → MEDIUM  (different client error)
 *  8. 5xx → 5xx          → HIGH    (different server error, may indicate new failure mode)
 *  9. 4xx → 5xx          → HIGH    (client error became server error)
 * 10. 5xx → 4xx          → MEDIUM  (server error became client error)
 * 11. anything → 3xx     → MEDIUM  (redirect introduced)
 * 12. fallback            → MEDIUM
 */
export function classifyStatusChange(baseline: number, candidate: number): Severity {
  const a = statusClass(baseline);
  const b = statusClass(candidate);

  if (a === "2xx" && b === "2xx") return "LOW";
  if (a === "2xx" && (b === "4xx" || b === "5xx")) return "CRITICAL";
  if (a === "2xx" && b === "3xx") return "MEDIUM";
  if ((a === "4xx" || a === "5xx") && b === "2xx") return "HIGH";
  if (a === "4xx" && b === "4xx") return "MEDIUM";
  if (a === "5xx" && b === "5xx") return "HIGH";
  if (a === "4xx" && b === "5xx") return "HIGH";
  if (a === "5xx" && b === "4xx") return "MEDIUM";
  if (b === "3xx") return "MEDIUM";
  return "MEDIUM";
}

/**
 * Compares two HTTP status codes and returns a DiffChange if they differ,
 * or null if they are identical.
 */
export function compareStatus(
  baseline: number,
  candidate: number,
  baselineText: string,
  candidateText: string,
): DiffChange | null {
  if (baseline === candidate) return null;

  const severity = classifyStatusChange(baseline, candidate);

  return {
    path: "$.status",
    kind: "STATUS_CHANGED",
    severity,
    compatibility: classifyCompatibility("STATUS_CHANGED"),
    before: baseline,
    after: candidate,
    reason: `HTTP status changed from ${baseline} ${baselineText} to ${candidate} ${candidateText}. ${severityReason(severity)}`,
  };
}

function severityReason(severity: Severity): string {
  switch (severity) {
    case "CRITICAL": return "A previously successful endpoint is now returning an error. Consumers will break.";
    case "HIGH":     return "A significant status transition occurred. Verify consumer behaviour and error handling.";
    case "MEDIUM":   return "The status code changed within the same class. Review downstream error handling.";
    case "LOW":      return "Both codes indicate success. Confirm consumers accept the new code.";
    default:         return "Review the impact on downstream consumers.";
  }
}
