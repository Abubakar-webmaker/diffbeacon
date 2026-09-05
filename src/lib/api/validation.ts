import { z } from "zod";
import type { ApiRequestConfig } from "@/types/api";

const ALLOWED_SCHEMES = ["http:", "https:"];
const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
const MAX_HEADER_COUNT = 30;
const MAX_HEADER_NAME_LEN = 256;
const MAX_HEADER_VALUE_LEN = 4096;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB request body limit

const urlSchema = z.string().superRefine((val, ctx) => {
  let parsed: URL;
  try {
    parsed = new URL(val);
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid URL." });
    return;
  }

  if (!ALLOWED_SCHEMES.includes(parsed.protocol)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `URL scheme "${parsed.protocol}" is not allowed. Only http: and https: are supported.`,
    });
  }

  // Reject embedded credentials (http://user:pass@host)
  if (parsed.username || parsed.password) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "URLs must not contain embedded credentials.",
    });
  }
});

const headersSchema = z
  .record(z.string(), z.string())
  .superRefine((headers, ctx) => {
    const entries = Object.entries(headers);

    if (entries.length > MAX_HEADER_COUNT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Too many headers (max ${MAX_HEADER_COUNT}).`,
      });
      return;
    }

    for (const [name, value] of entries) {
      if (name.length > MAX_HEADER_NAME_LEN) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Header name too long: ${name.slice(0, 40)}…` });
      }
      if (value.length > MAX_HEADER_VALUE_LEN) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Header value too long for: ${name}` });
      }
    }
  });

const authSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("bearer"), token: z.string().min(1).max(2048) }),
]);

export const apiRequestConfigSchema = z.object({
  url:     urlSchema,
  method:  z.enum(ALLOWED_METHODS),
  headers: headersSchema,
  body:    z.string().max(MAX_BODY_BYTES).nullable(),
  auth:    authSchema,
});

export const liveRequestPayloadSchema = z.object({
  requestA: apiRequestConfigSchema,
  requestB: apiRequestConfigSchema,
  ai:       z.boolean().optional().default(true),
});

export type ValidatedApiRequestConfig = ApiRequestConfig;
