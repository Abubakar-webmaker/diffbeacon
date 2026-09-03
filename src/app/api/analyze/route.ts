import { NextResponse } from "next/server";
import { z } from "zod";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { analyzeWithAI } from "@/lib/ai/router";

const schema = z.object({
  before: z.unknown(),
  after: z.unknown(),
  ai: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const changes = diffJson(input.before, input.after);
    const risk = calculateRisk(changes);
    const ai = input.ai ? await analyzeWithAI({ changes, risk }) : null;

    return NextResponse.json({ changes, risk, ai });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 },
    );
  }
}
