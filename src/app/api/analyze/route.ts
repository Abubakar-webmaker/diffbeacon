import { NextResponse } from "next/server";
import { z } from "zod";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { analyzeWithAI } from "@/lib/ai/router";
import { rateLimiter, clientKey } from "@/lib/ratelimit";
import { tooManyRequests, badRequest } from "@/lib/errors";
import { logger } from "@/lib/logger";

const MAX_JSON_BYTES = 512 * 1024; // 512 KB per side

const schema = z.object({
  before: z.unknown(),
  after:  z.unknown(),
  ai:     z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const start = Date.now();

  // Rate limit
  const limit = rateLimiter.check(clientKey(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  // Parse body
  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_JSON_BYTES * 2) {
      return badRequest("Request body is too large.", "PAYLOAD_TOO_LARGE");
    }
    raw = JSON.parse(text);
  } catch {
    return badRequest("Invalid JSON in request body.", "INVALID_JSON");
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(raw);
  } catch (e) {
    return badRequest(e instanceof Error ? e.message : "Invalid request payload.", "VALIDATION_ERROR");
  }

  const changes = diffJson(input.before, input.after);
  const risk    = calculateRisk(changes);
  const ai      = input.ai ? await analyzeWithAI({ changes, risk }) : null;

  logger.info({
    route:       "/api/analyze",
    event:       "analysis_complete",
    outcome:     "success",
    durationMs:  Date.now() - start,
    riskLabel:   risk.label,
    changeCount: changes.length,
    aiSuccess:   ai !== null,
  });

  return NextResponse.json({ changes, risk, ai });
}
