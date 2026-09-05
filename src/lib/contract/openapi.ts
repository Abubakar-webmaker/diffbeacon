import type { NormalizedSchema, ContractParseError } from "./types";
import { emptySchema } from "./types";
import { inlineRefs } from "./resolver";
import { normalizeJsonSchema } from "./json-schema";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Validates that the document looks like an OpenAPI 3.x document.
 * Returns an error string if invalid, null if valid.
 */
export function validateOpenApiVersion(doc: unknown): string | null {
  if (!isRecord(doc)) return "Document is not an object.";
  const openapi = doc["openapi"];
  if (typeof openapi !== "string") {
    // Could be Swagger 2.x
    if ("swagger" in doc) {
      return `Swagger 2.x is not supported. Please provide an OpenAPI 3.x document.`;
    }
    return "Missing 'openapi' version field. Provide an OpenAPI 3.x document.";
  }
  if (!openapi.startsWith("3.")) {
    return `OpenAPI version "${openapi}" is not supported. Only OpenAPI 3.x is supported.`;
  }
  return null;
}

/**
 * Extracts a schema from an OpenAPI 3.x document.
 *
 * Resolution order (first match wins):
 *   1. schemaPath hint (e.g. "#/components/schemas/User")
 *   2. First response schema found under paths
 *   3. components.schemas (first entry)
 *
 * Returns the normalized schema or an error.
 */
export function extractOpenApiSchema(
  doc: unknown,
  schemaPath?: string,
): { ok: true; schema: NormalizedSchema } | { ok: false; error: Pick<ContractParseError, "error" | "code"> } {
  if (!isRecord(doc)) {
    return { ok: false, error: { error: "Document is not an object.", code: "INVALID_SCHEMA" } };
  }

  let rawSchema: unknown = null;

  // 1. Explicit schema path hint
  if (schemaPath) {
    const inlined = inlineRefs(doc, doc);
    rawSchema = resolvePointer(inlined, schemaPath.replace(/^#/, ""));
    if (rawSchema === undefined || rawSchema === null) {
      return {
        ok: false,
        error: {
          error: `Schema path "${schemaPath}" could not be resolved in the document.`,
          code: "MISSING_SCHEMA",
        },
      };
    }
  }

  // 2. First response schema under paths
  if (rawSchema === null && isRecord(doc["paths"])) {
    rawSchema = findFirstResponseSchema(doc["paths"], doc);
  }

  // 3. First entry in components.schemas
  if (rawSchema === null && isRecord(doc["components"]) && isRecord((doc["components"] as Record<string, unknown>)["schemas"])) {
    const schemas = (doc["components"] as Record<string, unknown>)["schemas"] as Record<string, unknown>;
    const first = Object.values(schemas)[0];
    if (first !== undefined) {
      rawSchema = inlineRefs(first, doc);
    }
  }

  if (rawSchema === null) {
    return { ok: false, error: { error: "No schema found in the OpenAPI document.", code: "MISSING_SCHEMA" } };
  }

  const normalized = normalizeJsonSchema(rawSchema, "$", doc);
  return { ok: true, schema: normalized };
}

function resolvePointer(doc: unknown, pointer: string): unknown {
  const parts = pointer.split("/").filter(Boolean);
  let current: unknown = doc;
  for (const part of parts) {
    const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (!isRecord(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function findFirstResponseSchema(paths: Record<string, unknown>, doc: unknown): unknown | null {
  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const operation of Object.values(pathItem)) {
      if (!isRecord(operation)) continue;
      const responses = operation["responses"];
      if (!isRecord(responses)) continue;
      for (const response of Object.values(responses)) {
        const resolved = isRecord(response) && "$ref" in response
          ? inlineRefs(response, doc)
          : response;
        if (!isRecord(resolved)) continue;
        const content = (resolved as Record<string, unknown>)["content"];
        if (!isRecord(content)) continue;
        const json = (content as Record<string, unknown>)["application/json"];
        if (!isRecord(json)) continue;
        const schema = (json as Record<string, unknown>)["schema"];
        if (schema !== undefined && schema !== null) {
          return inlineRefs(schema, doc);
        }
      }
    }
  }
  return null;
}

export { emptySchema };
