import { NextResponse } from "next/server";

export interface ApiError {
  error: string;
  code: string;
}

export function errorResponse(
  error: string,
  code: string,
  status: number,
): NextResponse<ApiError> {
  return NextResponse.json({ error, code }, { status });
}

export function badRequest(error: string, code = "BAD_REQUEST") {
  return errorResponse(error, code, 400);
}

export function unprocessable(error: string, code = "UNPROCESSABLE") {
  return errorResponse(error, code, 422);
}

export function tooManyRequests(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please wait before retrying.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export function internalError(code = "INTERNAL_ERROR") {
  return errorResponse("An unexpected error occurred. Please try again.", code, 500);
}
