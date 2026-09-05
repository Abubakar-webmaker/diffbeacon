import { NextResponse } from "next/server";
import { z } from "zod";
import { parseContract } from "@/lib/contract/parser";
import { diffContracts } from "@/lib/contract/diff";
import { calculateRisk } from "@/lib/diff/engine";
import { analyzeWithAI } from "@/lib/ai/router";

const schema = z.object({
  baseline: z.string().min(1, "baseline is required"),
  candidate: z.string().min(1, "candidate is required"),
  direction: z.enum(["REQUEST", "RESPONSE"]).default("RESPONSE"),
  schemaPath: z.string().optional(),
  ai: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(await request.json());
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request payload." },
      { status: 400 },
    );
  }

  const baselineResult = parseContract(input.baseline, input.schemaPath);
  if (!baselineResult.ok) {
    return NextResponse.json(
      { error: `Baseline contract error: ${baselineResult.error}`, code: baselineResult.code },
      { status: 422 },
    );
  }

  const candidateResult = parseContract(input.candidate, input.schemaPath);
  if (!candidateResult.ok) {
    return NextResponse.json(
      { error: `Candidate contract error: ${candidateResult.error}`, code: candidateResult.code },
      { status: 422 },
    );
  }

  const changes = diffContracts(baselineResult.schema, candidateResult.schema, input.direction);
  const risk = calculateRisk(changes);
  const ai = input.ai ? await analyzeWithAI({ changes, risk }) : null;

  return NextResponse.json({
    changes,
    risk,
    ai,
    meta: {
      direction: input.direction,
      baselineFormat: baselineResult.format,
      candidateFormat: candidateResult.format,
    },
  });
}
