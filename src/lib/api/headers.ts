// Headers that must never be forwarded to the AI or returned to the client
const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
  "x-secret",
  "x-secret-key",
]);

// Hop-by-hop headers that must not be forwarded
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

// Response headers safe to return to the client
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "cache-control",
  "etag",
  "last-modified",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
  "x-correlation-id",
  "x-api-version",
  "api-version",
  "vary",
  "age",
  "expires",
]);

// Valid header name: token characters only (RFC 7230)
const VALID_HEADER_NAME = /^[a-zA-Z0-9!#$%&'*+\-.^_`|~]+$/;

// Reject values containing CR or LF (header injection)
const INVALID_HEADER_VALUE = /[\r\n]/;

export interface HeaderValidationError {
  header: string;
  reason: string;
}

/**
 * Validates user-supplied headers.
 * Returns a list of validation errors (empty = all valid).
 */
export function validateHeaders(
  headers: Record<string, string>,
): HeaderValidationError[] {
  const errors: HeaderValidationError[] = [];

  for (const [name, value] of Object.entries(headers)) {
    if (!VALID_HEADER_NAME.test(name)) {
      errors.push({ header: name, reason: "Invalid header name characters." });
      continue;
    }
    if (INVALID_HEADER_VALUE.test(value)) {
      errors.push({ header: name, reason: "Header value contains illegal characters (CR/LF)." });
    }
  }

  return errors;
}

/**
 * Builds the final outbound headers for a proxied request.
 * - Applies user headers (validated)
 * - Applies auth
 * - Removes hop-by-hop headers
 * - Never logs sensitive values
 */
export function buildOutboundHeaders(
  userHeaders: Record<string, string>,
  auth: { type: "none" } | { type: "bearer"; token: string },
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [name, value] of Object.entries(userHeaders)) {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower)) continue;
    out[name] = value;
  }

  if (auth.type === "bearer") {
    out["Authorization"] = `Bearer ${auth.token}`;
  }

  return out;
}

/**
 * Filters response headers to only include safe, non-sensitive fields.
 */
export function filterResponseHeaders(
  headers: Headers,
): Record<string, string> {
  const safe: Record<string, string> = {};

  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (SAFE_RESPONSE_HEADERS.has(lower) && !SENSITIVE_HEADER_NAMES.has(lower)) {
      safe[lower] = value;
    }
  });

  return safe;
}

export { SENSITIVE_HEADER_NAMES };
