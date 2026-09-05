import type { NormalizedSchema, SchemaType } from "./types";
import { emptySchema, MAX_REF_DEPTH } from "./types";
import { inlineRefs } from "./resolver";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function toSchemaTypes(raw: unknown): SchemaType[] {
  if (typeof raw === "string") {
    return [raw as SchemaType];
  }
  if (Array.isArray(raw)) {
    return raw.filter((t): t is SchemaType => typeof t === "string");
  }
  return ["unknown"];
}

/**
 * Normalizes a raw JSON Schema object (already $ref-inlined) into a
 * NormalizedSchema at the given path.
 *
 * Supports:
 *   type, properties, required, nullable, enum, items, additionalProperties
 *
 * Does NOT support: allOf/anyOf/oneOf merging (treated as unknown).
 * Does NOT execute schema content.
 */
export function normalizeJsonSchema(
  raw: unknown,
  path: string,
  doc: unknown,
  depth = 0,
): NormalizedSchema {
  const schema = emptySchema(path);
  if (!isRecord(raw) || depth > MAX_REF_DEPTH) return schema;

  // Inline any remaining $refs at this level
  const node = inlineRefs(raw, doc) as Record<string, unknown>;

  // type
  if ("type" in node) {
    schema.type = toSchemaTypes(node["type"]);
  }

  // nullable (OpenAPI 3.0 style: nullable: true alongside type)
  if (node["nullable"] === true) {
    schema.nullable = true;
    if (!schema.type.includes("null")) {
      schema.type = [...schema.type, "null"];
    }
  }

  // JSON Schema draft-07 style: type: ["string", "null"]
  if (schema.type.includes("null") && schema.type.length > 1) {
    schema.nullable = true;
  }

  // enum
  if (Array.isArray(node["enum"])) {
    schema.enumValues = node["enum"] as unknown[];
  }

  // required
  if (Array.isArray(node["required"])) {
    schema.required = new Set(
      (node["required"] as unknown[]).filter((r): r is string => typeof r === "string"),
    );
  }

  // properties
  if (isRecord(node["properties"])) {
    for (const [key, propRaw] of Object.entries(node["properties"])) {
      const propPath = `${path}.${key}`;
      schema.properties.set(key, normalizeJsonSchema(propRaw, propPath, doc, depth + 1));
    }
  }

  // items
  if (isRecord(node["items"])) {
    schema.items = normalizeJsonSchema(node["items"], `${path}[]`, doc, depth + 1);
  }

  // additionalProperties
  if ("additionalProperties" in node) {
    const ap = node["additionalProperties"];
    if (typeof ap === "boolean") {
      schema.additionalProperties = ap;
    } else if (isRecord(ap)) {
      // additionalProperties is a schema — treat as unrestricted (true)
      schema.additionalProperties = true;
    }
  }

  return schema;
}
