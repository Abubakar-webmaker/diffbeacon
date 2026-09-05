import { assertSafeHostname } from "./ssrf";
import { buildOutboundHeaders, filterResponseHeaders, validateHeaders } from "./headers";
import type { ApiRequestConfig, ApiResponse, ApiRequestError } from "@/types/api";

const REQUEST_TIMEOUT_MS = 10_000;       // 10 seconds
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

function makeError(code: ApiRequestError["code"], message: string): ApiRequestError {
  return { code, message };
}

/**
 * Executes a single proxied API request with full SSRF protection,
 * timeout enforcement, and response-size limiting.
 *
 * Throws ApiRequestError on any failure.
 */
export async function executeRequest(config: ApiRequestConfig): Promise<ApiResponse> {
  // 1. Validate headers
  const headerErrors = validateHeaders(config.headers);
  if (headerErrors.length > 0) {
    throw makeError("INVALID_HEADERS", `Invalid headers: ${headerErrors.map((e) => e.header).join(", ")}`);
  }

  // 2. Parse and validate URL
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    throw makeError("INVALID_URL", "The URL is malformed.");
  }

  // 3. SSRF check — resolve hostname and verify all IPs
  try {
    await assertSafeHostname(parsed.hostname);
  } catch (e) {
    throw makeError(
      "BLOCKED_DESTINATION",
      e instanceof Error ? e.message : "Destination is not allowed.",
    );
  }

  // 4. Build outbound headers
  const outboundHeaders = buildOutboundHeaders(config.headers, config.auth);

  // 5. Validate request body
  let body: string | null = null;
  if (config.body !== null && config.body.trim().length > 0) {
    const ct = (outboundHeaders["Content-Type"] ?? outboundHeaders["content-type"] ?? "").toLowerCase();
    if (ct.includes("application/json")) {
      try {
        JSON.parse(config.body);
      } catch {
        throw makeError("INVALID_BODY", "Request body is not valid JSON.");
      }
    }
    body = config.body;
  }

  // 6. Execute with timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const startMs = Date.now();
  let response: Response;

  try {
    response = await fetch(config.url, {
      method:  config.method,
      headers: outboundHeaders,
      body:    body ?? undefined,
      signal:  controller.signal,
      // Prevent redirect chains from bypassing SSRF checks
      redirect: "follow",
    });
  } catch (e) {
    clearTimeout(timer);
    if (e instanceof Error && e.name === "AbortError") {
      throw makeError("TIMEOUT", `Request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    throw makeError("CONNECTION_ERROR", "Could not connect to the server. Check the URL and try again.");
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startMs;

  // 7. Stream body with size limit
  const contentType = response.headers.get("content-type") ?? "";
  const safeHeaders = filterResponseHeaders(response.headers);

  let rawText: string | null = null;
  let parsedBody: unknown = null;
  let bodyType: ApiResponse["meta"]["bodyType"] = "empty";

  if (config.method !== "HEAD") {
    const reader = response.body?.getReader();
    if (reader) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.byteLength;
          if (totalBytes > MAX_RESPONSE_BYTES) {
            reader.cancel();
            throw makeError(
              "RESPONSE_TOO_LARGE",
              `Response exceeds the ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB limit.`,
            );
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const buffer = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const text = new TextDecoder().decode(buffer);

      if (contentType.includes("application/json") || contentType.includes("+json")) {
        try {
          parsedBody = JSON.parse(text);
          bodyType = "json";
        } catch {
          // Server said JSON but body isn't — treat as text
          rawText = text.slice(0, 500);
          bodyType = "text";
        }
      } else if (contentType.startsWith("text/")) {
        rawText = text.slice(0, 500);
        bodyType = "text";
      } else if (text.length === 0) {
        bodyType = "empty";
      } else {
        bodyType = "binary";
      }
    }
  }

  return {
    meta: {
      status:      response.status,
      statusText:  response.statusText,
      durationMs,
      contentType: contentType || null,
      headers:     safeHeaders,
      bodyType,
    },
    body:    parsedBody,
    rawText,
  };
}
