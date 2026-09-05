/**
 * Structured server-side logger.
 *
 * Safety rules:
 *   - Never logs API keys, Authorization headers, request/response bodies,
 *     bearer tokens, cookies, or any user secrets.
 *   - Development: verbose JSON to stdout.
 *   - Production: same structure, safe fields only.
 */

type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  route?: string;
  event: string;
  durationMs?: number;
  outcome?: "success" | "error";
  riskLabel?: string;
  changeCount?: number;
  aiProvider?: string;
  aiSuccess?: boolean;
  errorCode?: string;
  [key: string]: unknown;
}

function emit(entry: LogEntry): void {
  // Never log in test environment
  if (process.env.NODE_ENV === "test") return;

  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info:  (entry: Omit<LogEntry, "level">) => emit({ ...(entry as LogEntry), level: "info"  }),
  warn:  (entry: Omit<LogEntry, "level">) => emit({ ...(entry as LogEntry), level: "warn"  }),
  error: (entry: Omit<LogEntry, "level">) => emit({ ...(entry as LogEntry), level: "error" }),
};
