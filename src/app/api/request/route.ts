import { NextResponse } from "next/server";
import { liveRequestPayloadSchema } from "@/lib/api/validation";
import { executeRequest } from "@/lib/api/client";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { compareStatus } from "@/lib/diff/status";
import { analyzeWithAI } from "@/lib/ai/router";
import { rateLimiter, clientKey } from "@/lib/ratelimit";
import { tooManyRequests, badRequest, unprocessable } from "@/lib/errors";
import { logger } from "@/lib/logger";
import type { ApiAnalysisResult } from "@/types/api";

export async function POST(request: Request) {
  const start = Date.now();

  // Rate limit
  const limit = rateLimiter.check(clientKey(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  // Parse and validate input
  let input: ReturnType<typeof liveRequestPayloadSchema.parse>;
  try {
    const raw = await request.json();
    input = liveRequestPayloadSchema.parse(raw);
  } catch (e) {
    return badRequest(
      e instanceof Error ? e.message : "Invalid request payload.",
      "VALIDATION_ERROR",
    );
  }

  // Execute both requests in parallel
  const [resultA, resultB] = await Promise.allSettled([
    executeRequest(input.requestA),
    executeRequest(input.requestB),
  ]);

  if (resultA.status === "rejected") {
    const err = resultA.reason as { message?: string };
    return unprocessable(`Request A failed: ${err.message ?? "Unknown error"}`, "REQUEST_FAILED");
  }
  if (resultB.status === "rejected") {
    const err = resultB.reason as { message?: string };
    return unprocessable(`Request B failed: ${err.message ?? "Unknown error"}`, "REQUEST_FAILED");
  }

  const responseA = resultA.value;
  const responseB = resultB.value;

  // Deterministic diff
  const statusChange = compareStatus(
    responseA.meta.status,
    responseB.meta.status,
    responseA.meta.statusText,
    responseB.meta.statusText,
  );
  const bodyChanges = diffJson(responseA.body ?? null, responseB.body ?? null);
  const changes     = statusChange ? [statusChange, ...bodyChanges] : bodyChanges;
  const risk        = calculateRisk(changes);

  // AI — never include auth headers or tokens
  const ai = input.ai ? await analyzeWithAI({ changes, risk }) : null;

  // Safe result — strip auth from echo
  const safeResult: ApiAnalysisResult = {
    requestA:  { url: input.requestA.url, method: input.requestA.method },
    requestB:  { url: input.requestB.url, method: input.requestB.method },
    responseA,
    responseB,
  };

  logger.info({
    route:       "/api/request",
    event:       "live_analysis_complete",
    outcome:     "success",
    durationMs:  Date.now() - start,
    riskLabel:   risk.label,
    changeCount: changes.length,
    aiSuccess:   ai !== null,
  });

  return NextResponse.json({ result: safeResult, changes, risk, ai });
}
