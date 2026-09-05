import { NextResponse } from "next/server";
import { z } from "zod";
import { parseContract } from "@/lib/contract/parser";
import { diffContracts } from "@/lib/contract/diff";
import { calculateRisk } from "@/lib/diff/engine";
import { analyzeWithAI } from "@/lib/ai/router";
import { rateLimiter, clientKey } from "@/lib/ratelimit";
import { tooManyRequests, badRequest, unprocessable } from "@/lib/errors";
import { logger } from "@/lib/logger";

const schema = z.object({
  baseline:   z.string().min(1, "baseline is required"),
  candidate:  z.string().min(1, "candidate is required"),
  direction:  z.enum(["REQUEST", "RESPONSE"]).default("RESPONSE"),
  schemaPath: z.string().optional(),
  ai:         z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const start = Date.now();

  // Rate limit
  const limit = rateLimiter.check(clientKey(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch (e) {
    return badRequest(
      e instanceof Error ? e.message : "Invalid request payload.",
      "VALIDATION_ERROR",
    );
  }

  const baselineResult = parseContract(input.baseline, input.schemaPath);
  if (!baselineResult.ok) {
    return unprocessable(
      `Baseline contract error: ${baselineResult.error}`,
      baselineResult.code,
    );
  }

  const candidateResult = parseContract(input.candidate, input.schemaPath);
  if (!candidateResult.ok) {
    return unprocessable(
      `Candidate contract error: ${candidateResult.error}`,
      candidateResult.code,
    );
  }

  const changes = diffContracts(baselineResult.schema, candidateResult.schema, input.direction);
  const risk    = calculateRisk(changes);
  const ai      = input.ai ? await analyzeWithAI({ changes, risk }) : null;

  logger.info({
    route:       "/api/contract/diff",
    event:       "contract_analysis_complete",
    outcome:     "success",
    durationMs:  Date.now() - start,
    riskLabel:   risk.label,
    changeCount: changes.length,
    aiSuccess:   ai !== null,
    direction:   input.direction,
  });

  return NextResponse.json({
    changes,
    risk,
    ai,
    meta: {
      direction:       input.direction,
      baselineFormat:  baselineResult.format,
      candidateFormat: candidateResult.format,
    },
  });
}
