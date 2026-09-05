import { NextResponse } from "next/server";
import { liveRequestPayloadSchema } from "@/lib/api/validation";
import { executeRequest } from "@/lib/api/client";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { compareStatus } from "@/lib/diff/status";
import { analyzeWithAI } from "@/lib/ai/router";
import type { ApiAnalysisResult } from "@/types/api";

export async function POST(request: Request) {
  // 1. Parse and validate input
  let input: ReturnType<typeof liveRequestPayloadSchema.parse>;
  try {
    const raw = await request.json();
    input = liveRequestPayloadSchema.parse(raw);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid request payload." },
      { status: 400 },
    );
  }

  // 2. Execute both requests (in parallel)
  const [resultA, resultB] = await Promise.allSettled([
    executeRequest(input.requestA),
    executeRequest(input.requestB),
  ]);

  if (resultA.status === "rejected") {
    const err = resultA.reason as { message?: string };
    return NextResponse.json(
      { error: `Request A failed: ${err.message ?? "Unknown error"}` },
      { status: 422 },
    );
  }
  if (resultB.status === "rejected") {
    const err = resultB.reason as { message?: string };
    return NextResponse.json(
      { error: `Request B failed: ${err.message ?? "Unknown error"}` },
      { status: 422 },
    );
  }

  const responseA = resultA.value;
  const responseB = resultB.value;

  // 3. Run deterministic diff — status first, then body
  const statusChange = compareStatus(
    responseA.meta.status,
    responseB.meta.status,
    responseA.meta.statusText,
    responseB.meta.statusText,
  );
  const bodyChanges = diffJson(
    responseA.body ?? null,
    responseB.body ?? null,
  );
  // Status change is prepended so it appears first in the list
  const changes = statusChange ? [statusChange, ...bodyChanges] : bodyChanges;
  const risk = calculateRisk(changes);

  // 4. AI analysis — NEVER include auth headers or tokens
  const ai = input.ai
    ? await analyzeWithAI({ changes, risk })
    : null;

  // 5. Build safe result — strip auth from what we echo back
  const safeResult: ApiAnalysisResult = {
    requestA: { url: input.requestA.url, method: input.requestA.method },
    requestB: { url: input.requestB.url, method: input.requestB.method },
    responseA,
    responseB,
  };

  return NextResponse.json({ result: safeResult, changes, risk, ai });
}
