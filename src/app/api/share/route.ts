import { NextResponse } from "next/server";
import { z } from "zod";
import { shareStore } from "@/lib/share/store";
import { rateLimiter, clientKey } from "@/lib/ratelimit";
import { tooManyRequests, badRequest } from "@/lib/errors";

const MAX_SHARE_BYTES = 256 * 1024; // 256 KB

const CHANGE_KINDS = [
  "ADDED", "REMOVED", "CHANGED", "TYPE_CHANGED", "NULLABILITY_CHANGED",
  "ARRAY_LENGTH_CHANGED", "ARRAY_REORDERED", "ENUM_VALUE_ADDED", "ENUM_VALUE_REMOVED",
  "STATUS_CHANGED", "CONTRACT_REQUIREMENT_CHANGED", "NULLABILITY_SCHEMA_CHANGED",
  "ADDITIONAL_PROPERTIES_CHANGED",
] as const;

const changeSchema = z.object({
  path:        z.string(),
  kind:        z.enum(CHANGE_KINDS),
  severity:    z.enum(["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  reason:      z.string(),
  before:      z.unknown().optional(),
  after:       z.unknown().optional(),
  compatibility:       z.enum(["BREAKING", "NON_BREAKING", "REVIEW"]).optional(),
  fieldRequirement:    z.enum(["REQUIRED", "OPTIONAL", "UNKNOWN"]).optional(),
  requirementBefore:   z.enum(["REQUIRED", "OPTIONAL", "UNKNOWN"]).optional(),
  requirementAfter:    z.enum(["REQUIRED", "OPTIONAL", "UNKNOWN"]).optional(),
  enumValue:           z.unknown().optional(),
  direction:           z.enum(["REQUEST", "RESPONSE"]).optional(),
  baselineType:        z.string().optional(),
  candidateType:       z.string().optional(),
});

const schema = z.object({
  mode:      z.enum(["json", "live", "contract"]),
  changes:   z.array(changeSchema).max(500),
  risk:      z.object({ score: z.number(), label: z.enum(["NO CHANGES", "LOW", "MEDIUM", "HIGH", "CRITICAL"]) }),
  ai:        z.object({
    summary:         z.string().max(2000),
    recommendations: z.array(z.string().max(500)).max(10),
  }).nullable(),
  direction: z.string().optional(),
  requestMeta: z.object({
    urlA: z.string().max(2048), methodA: z.string().max(16),
    urlB: z.string().max(2048), methodB: z.string().max(16),
  }).optional(),
});

export async function POST(request: Request) {
  const limit = rateLimiter.check(clientKey(request));
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_SHARE_BYTES) {
      return badRequest("Share payload is too large.", "PAYLOAD_TOO_LARGE");
    }
    raw = JSON.parse(text);
  } catch {
    return badRequest("Invalid JSON in request body.", "INVALID_JSON");
  }

  let input: z.infer<typeof schema>;
  try {
    input = schema.parse(raw);
  } catch (e) {
    return badRequest(
      e instanceof Error ? e.message : "Invalid share payload.",
      "VALIDATION_ERROR",
    );
  }

  const id = shareStore.save({ ...input, createdAt: Date.now() });
  return NextResponse.json({ id });
}
