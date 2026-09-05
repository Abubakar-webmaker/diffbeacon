import type { ContractParseOutcome } from "./types";
import { MAX_CONTRACT_SIZE } from "./types";
import { validateOpenApiVersion, extractOpenApiSchema } from "./openapi";
import { normalizeJsonSchema } from "./json-schema";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function looksLikeYaml(input: string): boolean {
  // Heuristic: YAML typically starts with "---" or has "key: value" lines
  // without being valid JSON.
  const trimmed = input.trimStart();
  return trimmed.startsWith("---") || /^[a-zA-Z_][a-zA-Z0-9_]*\s*:/m.test(trimmed);
}

/**
 * Safely parses a contract document string.
 *
 * Supports:
 *   - OpenAPI 3.x (JSON)
 *   - JSON Schema (JSON)
 *
 * YAML is detected and rejected with a clear message (not silently treated as JSON).
 * Input size is bounded by MAX_CONTRACT_SIZE.
 * Malformed documents return structured errors — never throw to the caller.
 *
 * @param input      Raw contract string (JSON or YAML).
 * @param schemaPath Optional pointer to a specific schema within the document.
 */
export function parseContract(input: string, schemaPath?: string): ContractParseOutcome {
  // Size guard
  if (input.length > MAX_CONTRACT_SIZE) {
    return {
      ok: false,
      error: `Contract document exceeds the maximum allowed size of ${MAX_CONTRACT_SIZE / 1024} KB.`,
      code: "INPUT_TOO_LARGE",
    };
  }

  const trimmed = input.trim();

  // YAML detection — reject with a clear message
  if (looksLikeYaml(trimmed)) {
    return {
      ok: false,
      error:
        "YAML format is not supported. Please convert your contract to JSON before pasting it here. " +
        "You can use an online YAML-to-JSON converter or run: npx js-yaml your-contract.yaml > contract.json",
      code: "INVALID_YAML",
    };
  }

  // Parse JSON
  let doc: unknown;
  try {
    doc = JSON.parse(trimmed);
  } catch {
    return {
      ok: false,
      error: "Invalid JSON: the contract document could not be parsed. Check for syntax errors.",
      code: "INVALID_JSON",
    };
  }

  if (!isRecord(doc)) {
    return {
      ok: false,
      error: "Contract document must be a JSON object.",
      code: "INVALID_SCHEMA",
    };
  }

  // Detect OpenAPI
  if ("openapi" in doc || "swagger" in doc) {
    const versionError = validateOpenApiVersion(doc);
    if (versionError) {
      return {
        ok: false,
        error: versionError,
        code: "swagger" in doc ? "UNSUPPORTED_FORMAT" : "UNSUPPORTED_OPENAPI_VERSION",
      };
    }
    const result = extractOpenApiSchema(doc, schemaPath);
    if (!result.ok) {
      return { ok: false, error: result.error.error, code: result.error.code };
    }
    return { ok: true, schema: result.schema, format: "openapi" };
  }

  // Detect JSON Schema (has $schema, type, properties, or definitions)
  if (
    "$schema" in doc ||
    "type" in doc ||
    "properties" in doc ||
    "definitions" in doc ||
    "$defs" in doc
  ) {
    const schema = normalizeJsonSchema(doc, "$", doc);
    return { ok: true, schema, format: "json-schema" };
  }

  // Unknown format
  return {
    ok: false,
    error:
      "Unrecognized contract format. Provide an OpenAPI 3.x document (with 'openapi' field) " +
      "or a JSON Schema document (with 'type', 'properties', or '$schema' field).",
    code: "UNSUPPORTED_FORMAT",
  };
}
