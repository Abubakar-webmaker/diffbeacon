/**
 * In-memory sliding-window rate limiter.
 *
 * Interface-abstracted so a Redis backend can be swapped in later
 * without changing call sites.
 *
 * Security notes:
 *   - Client identity is derived from x-forwarded-for or the connection
 *     remote address — never from user-supplied identity headers.
 *   - In production behind a trusted reverse proxy, x-forwarded-for is
 *     acceptable. Do NOT trust it if the server is directly internet-facing
 *     without a proxy.
 *   - Rate limiting is disabled in test environment.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

interface WindowEntry {
  timestamps: number[];
}

class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, WindowEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Evict expired timestamps
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldest = entry.timestamps[0]!;
      const retryAfterMs = oldest + this.windowMs - now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: this.maxRequests - entry.timestamps.length,
      retryAfterSeconds: 0,
    };
  }
}

// Disabled limiter for local dev / tests
class NoopRateLimiter implements RateLimiter {
  check(): RateLimitResult {
    return { allowed: true, remaining: 999, retryAfterSeconds: 0 };
  }
}

function parseLimitEnv(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  return isNaN(n) || n <= 0 ? fallback : n;
}

function createLimiter(): RateLimiter {
  if (process.env.NODE_ENV === "test") return new NoopRateLimiter();
  if (process.env.RATE_LIMIT_DISABLED === "true") return new NoopRateLimiter();

  const max = parseLimitEnv("RATE_LIMIT_MAX", 30);
  const windowMs = parseLimitEnv("RATE_LIMIT_WINDOW_MS", 60_000);
  return new InMemoryRateLimiter(max, windowMs);
}

export const rateLimiter: RateLimiter = createLimiter();

/**
 * Extracts a safe client key from a Next.js Request.
 * Uses x-forwarded-for (first IP only) or falls back to a constant.
 * Never trusts user-supplied identity claims.
 */
export function clientKey(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // Take only the first IP — the leftmost is the client
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  // Fallback: single-bucket (all requests share one limit)
  return "default";
}
