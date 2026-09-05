import type { ContractDirection } from "@/types/diff";

/**
 * Normalized internal schema model.
 *
 * This is the single internal representation used by the contract diff engine,
 * regardless of whether the source was OpenAPI 3.x or JSON Schema.
 *
 * IMPORTANT: Raw JSON response comparison never produces or consumes this type.
 * Contract intelligence is a separate, additive layer.
 */

export type SchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array"
  | "null"
  | "unknown";

export interface NormalizedSchema {
  /** JSON path of this schema node (e.g. "$.user.id") */
  path: string;
  /** Declared type(s). Multiple types are possible in JSON Schema. */
  type: SchemaType[];
  /** Whether the field is explicitly nullable. */
  nullable: boolean;
  /** Enum values from the contract, if declared. */
  enumValues: readonly unknown[] | null;
  /** Child properties (for object schemas). */
  properties: Map<string, NormalizedSchema>;
  /** Required property names (for object schemas). */
  required: ReadonlySet<string>;
  /** Item schema (for array schemas). */
  items: NormalizedSchema | null;
  /**
   * additionalProperties:
   *   true  = unrestricted (default)
   *   false = no extra properties allowed
   *   null  = not declared (treat as unrestricted)
   */
  additionalProperties: boolean | null;
}

export interface ContractParseResult {
  ok: true;
  schema: NormalizedSchema;
  format: "openapi" | "json-schema";
}

export interface ContractParseError {
  ok: false;
  error: string;
  code:
    | "INVALID_JSON"
    | "INVALID_YAML"
    | "UNSUPPORTED_FORMAT"
    | "UNSUPPORTED_OPENAPI_VERSION"
    | "MISSING_SCHEMA"
    | "INVALID_SCHEMA"
    | "CIRCULAR_REF"
    | "INPUT_TOO_LARGE"
    | "EXTERNAL_REF_REJECTED"
    | "MALFORMED_REF";
}

export type ContractParseOutcome = ContractParseResult | ContractParseError;

export interface ContractDiffInput {
  baseline: string;
  candidate: string;
  direction: ContractDirection;
  /** Optional: path within the document to the schema to compare (e.g. "#/components/schemas/User") */
  schemaPath?: string;
  ai?: boolean;
}

/** Maximum input size: 512 KB per contract document. */
export const MAX_CONTRACT_SIZE = 512 * 1024;

/** Maximum $ref resolution depth to prevent infinite recursion. */
export const MAX_REF_DEPTH = 32;

export function emptySchema(path: string): NormalizedSchema {
  return {
    path,
    type: ["unknown"],
    nullable: false,
    enumValues: null,
    properties: new Map(),
    required: new Set(),
    items: null,
    additionalProperties: null,
  };
}
