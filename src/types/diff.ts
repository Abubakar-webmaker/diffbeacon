export type ChangeKind =
  | "ADDED"
  | "REMOVED"
  | "CHANGED"
  | "TYPE_CHANGED"
  | "NULLABILITY_CHANGED"
  | "ARRAY_LENGTH_CHANGED"
  | "ARRAY_REORDERED"
  | "ENUM_VALUE_ADDED"
  | "ENUM_VALUE_REMOVED"
  | "STATUS_CHANGED"
  | "CONTRACT_REQUIREMENT_CHANGED"
  | "NULLABILITY_SCHEMA_CHANGED"
  | "ADDITIONAL_PROPERTIES_CHANGED";

export type Severity = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Deterministic compatibility classification for a change.
 *
 * BREAKING     — existing consumers are likely to break (field removed, type changed, etc.)
 * NON_BREAKING — safe to ship without consumer coordination (field added, value changed, etc.)
 * REVIEW       — context-dependent; warrants human review before shipping
 */
export type Compatibility = "BREAKING" | "NON_BREAKING" | "REVIEW";

/**
 * Indicates whether a field is formally required or optional according to an
 * API contract (e.g. OpenAPI / JSON Schema).
 *
 * IMPORTANT: Raw JSON response comparison alone cannot determine whether a
 * field is formally required or optional. That information belongs to an API
 * contract/schema. Raw JSON diff always produces UNKNOWN.
 *
 * A future schema-aware layer (OpenAPI / JSON Schema integration) can upgrade
 * this to REQUIRED or OPTIONAL once contract information is available.
 *
 * REQUIRED — the contract declares the field must always be present.
 * OPTIONAL — the contract declares the field may be absent.
 * UNKNOWN  — no contract information available; raw JSON comparison only.
 */
export type FieldRequirement = "REQUIRED" | "OPTIONAL" | "UNKNOWN";

/**
 * Indicates whether a field's enum definition is known from an API contract.
 *
 * IMPORTANT: Raw JSON response comparison alone cannot determine whether a
 * field is formally an enum. Enum definitions belong to an API contract
 * (OpenAPI / JSON Schema). Raw JSON diff always produces UNKNOWN.
 *
 * A future schema-aware layer can provide explicit enum arrays to
 * diffEnumValues() in src/lib/diff/enums.ts.
 *
 * KNOWN   — explicit enum values were supplied from a contract/schema.
 * UNKNOWN — no contract information available; raw JSON comparison only.
 */
export type EnumStatus = "KNOWN" | "UNKNOWN";

export interface DiffChange {
  path: string;
  kind: ChangeKind;
  severity: Severity;
  before?: unknown;
  after?: unknown;
  reason: string;
  /** Deterministic compatibility classification. Present on all engine-produced changes. */
  compatibility?: Compatibility;
  /**
   * Present on ADDED and REMOVED changes.
   * Indicates the formal requirement status of the field from an API contract.
   * Always UNKNOWN for raw JSON comparison — requires OpenAPI/JSON Schema
   * integration to be set to REQUIRED or OPTIONAL.
   */
  fieldRequirement?: FieldRequirement;
  /**
   * Present on NULLABILITY_CHANGED only.
   * Preserves the concrete JSON type on each side so consumers and AI can
   * reason about the transition (e.g. "string → null").
   */
  baselineType?: string;
  candidateType?: string;
  /**
   * Present on ENUM_VALUE_ADDED and ENUM_VALUE_REMOVED only.
   * The specific enum value that was added or removed from the contract.
   * Only emitted when explicit schema/contract enum arrays are provided.
   * Raw JSON comparison never produces these change kinds.
   */
  enumValue?: unknown;
  /**
   * Present on CONTRACT_REQUIREMENT_CHANGED only.
   * The requirement status before and after the contract change.
   */
  requirementBefore?: FieldRequirement;
  requirementAfter?: FieldRequirement;
  /**
   * Present on contract diff changes.
   * Indicates whether this change was analyzed in REQUEST or RESPONSE direction.
   */
  direction?: ContractDirection;
}

/**
 * Indicates the direction of a contract schema analysis.
 *
 * REQUEST  — the schema describes what a client sends to the server.
 *            A newly required field is BREAKING (clients may not send it).
 *            A field becoming optional is NON_BREAKING.
 *
 * RESPONSE — the schema describes what the server sends to the client.
 *            A newly required field in a response is generally NON_BREAKING
 *            (server guarantees it will be present).
 *            A field becoming optional is BREAKING (clients may no longer
 *            rely on it being present).
 */
export type ContractDirection = "REQUEST" | "RESPONSE";

export interface RiskResult {
  score: number;
  label: "NO CHANGES" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}
