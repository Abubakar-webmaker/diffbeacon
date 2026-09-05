export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type AuthConfig =
  | { type: "none" }
  | { type: "bearer"; token: string };

export interface ApiRequestConfig {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  auth: AuthConfig;
}

export interface ResponseMetadata {
  status: number;
  statusText: string;
  durationMs: number;
  contentType: string | null;
  headers: Record<string, string>;
  bodyType: "json" | "text" | "binary" | "empty";
}

export interface ApiResponse {
  meta: ResponseMetadata;
  body: unknown; // parsed JSON, or null for non-JSON
  rawText: string | null; // first 500 chars of text for non-JSON display
}

export interface ApiAnalysisResult {
  requestA: Pick<ApiRequestConfig, "url" | "method">;
  requestB: Pick<ApiRequestConfig, "url" | "method">;
  responseA: ApiResponse;
  responseB: ApiResponse;
}

export interface ApiRequestError {
  code:
    | "INVALID_URL"
    | "BLOCKED_DESTINATION"
    | "DNS_FAILURE"
    | "TIMEOUT"
    | "CONNECTION_ERROR"
    | "RESPONSE_TOO_LARGE"
    | "INVALID_BODY"
    | "INVALID_HEADERS"
    | "UNKNOWN";
  message: string;
}
