import { describe, it, expect } from "vitest";
import { parseContract } from "@/lib/contract/parser";
import { diffContracts } from "@/lib/contract/diff";
import { diffJson } from "@/lib/diff/engine";
import { calculateRisk } from "@/lib/diff/engine";
import { normalizeJsonSchema } from "@/lib/contract/json-schema";
import { inlineRefs } from "@/lib/contract/resolver";
import type { NormalizedSchema } from "@/lib/contract/types";

// ─── helpers ─────────────────────────────────────────────────────────────────

function schema(raw: unknown): NormalizedSchema {
  return normalizeJsonSchema(raw, "$", raw);
}

function contractDiff(a: unknown, b: unknown, direction: "REQUEST" | "RESPONSE" = "RESPONSE") {
  return diffContracts(schema(a), schema(b), direction);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PARSER — valid JSON Schema
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: valid JSON Schema", () => {
  const doc = JSON.stringify({ type: "object", properties: { id: { type: "string" } }, required: ["id"] });

  it("parses successfully", () => {
    const r = parseContract(doc);
    expect(r.ok).toBe(true);
  });

  it("format is json-schema", () => {
    const r = parseContract(doc);
    expect(r.ok && r.format).toBe("json-schema");
  });

  it("schema has correct type", () => {
    const r = parseContract(doc);
    expect(r.ok && r.schema.type).toContain("object");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PARSER — valid OpenAPI 3.x
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: valid OpenAPI 3.x", () => {
  const doc = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "Test", version: "1.0" },
    paths: {},
    components: {
      schemas: {
        User: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" }, name: { type: "string" } },
        },
      },
    },
  });

  it("parses successfully", () => {
    const r = parseContract(doc);
    expect(r.ok).toBe(true);
  });

  it("format is openapi", () => {
    const r = parseContract(doc);
    expect(r.ok && r.format).toBe("openapi");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PARSER — malformed JSON
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: malformed JSON", () => {
  it("returns INVALID_JSON error", () => {
    const r = parseContract("{not valid json");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("INVALID_JSON");
  });

  it("error message is safe (no stack trace)", () => {
    const r = parseContract("{bad}");
    expect(!r.ok && r.error).not.toContain("at ");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PARSER — malformed OpenAPI (missing schema)
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: OpenAPI with no schema", () => {
  it("returns MISSING_SCHEMA error", () => {
    const doc = JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, paths: {} });
    const r = parseContract(doc);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("MISSING_SCHEMA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. PARSER — Swagger 2.x rejected
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: Swagger 2.x rejected", () => {
  it("returns UNSUPPORTED_FORMAT error", () => {
    const doc = JSON.stringify({ swagger: "2.0", info: { title: "T", version: "1" }, paths: {} });
    const r = parseContract(doc);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("UNSUPPORTED_FORMAT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. PARSER — YAML detected and rejected
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: YAML rejected", () => {
  it("returns INVALID_YAML for YAML starting with ---", () => {
    const r = parseContract("---\nopenapi: 3.0.3\n");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("INVALID_YAML");
  });

  it("returns INVALID_YAML for key: value YAML", () => {
    const r = parseContract("openapi: 3.0.3\ninfo:\n  title: Test\n");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("INVALID_YAML");
  });

  it("error message mentions JSON conversion", () => {
    const r = parseContract("---\ntype: object\n");
    expect(!r.ok && r.error).toContain("JSON");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. PARSER — input size limit
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: input size limit", () => {
  it("rejects input exceeding 512 KB", () => {
    const huge = JSON.stringify({ type: "object", x: "a".repeat(600 * 1024) });
    const r = parseContract(huge);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("INPUT_TOO_LARGE");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PARSER — unrecognized format
// ═══════════════════════════════════════════════════════════════════════════════

describe("parser: unrecognized format", () => {
  it("returns UNSUPPORTED_FORMAT for plain object without schema markers", () => {
    const r = parseContract(JSON.stringify({ foo: "bar" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("UNSUPPORTED_FORMAT");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. LOCAL $REF RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════════

describe("$ref: local reference resolved", () => {
  const doc = {
    type: "object",
    properties: {
      user: { $ref: "#/definitions/User" },
    },
    definitions: {
      User: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
  };

  it("inlines the $ref", () => {
    const inlined = inlineRefs(doc, doc) as Record<string, unknown>;
    const props = inlined["properties"] as Record<string, unknown>;
    const user = props["user"] as Record<string, unknown>;
    expect(user["type"]).toBe("object");
  });
});

describe("$ref: nested $ref resolved", () => {
  const doc = {
    type: "object",
    properties: { a: { $ref: "#/defs/A" } },
    defs: {
      A: { $ref: "#/defs/B" },
      B: { type: "string" },
    },
  };

  it("resolves nested refs", () => {
    const inlined = inlineRefs(doc, doc) as Record<string, unknown>;
    const props = inlined["properties"] as Record<string, unknown>;
    const a = props["a"] as Record<string, unknown>;
    expect(a["type"]).toBe("string");
  });
});

describe("$ref: circular ref does not crash", () => {
  const doc = {
    type: "object",
    properties: { self: { $ref: "#" } },
  };

  it("returns empty object for circular ref instead of infinite loop", () => {
    expect(() => inlineRefs(doc, doc)).not.toThrow();
  });
});

describe("$ref: external ref rejected", () => {
  it("inlineRefs returns empty object for external ref", () => {
    const doc = { $ref: "https://example.com/schema.json" };
    const result = inlineRefs(doc, doc);
    expect(result).toEqual({});
  });
});

describe("$ref: malformed ref returns empty object", () => {
  it("non-string $ref returns empty object", () => {
    const doc = { $ref: 42 };
    const result = inlineRefs(doc, doc);
    expect(result).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. JSON SCHEMA NORMALIZER
// ═══════════════════════════════════════════════════════════════════════════════

describe("json-schema normalizer: required field", () => {
  const raw = {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" }, name: { type: "string" } },
  };
  const s = schema(raw);

  it("id is in required set", () => expect(s.required.has("id")).toBe(true));
  it("name is not in required set", () => expect(s.required.has("name")).toBe(false));
  it("has two properties", () => expect(s.properties.size).toBe(2));
});

describe("json-schema normalizer: nullable via nullable:true", () => {
  const raw = { type: "string", nullable: true };
  const s = schema(raw);
  it("nullable is true", () => expect(s.nullable).toBe(true));
  it("type includes null", () => expect(s.type).toContain("null"));
});

describe("json-schema normalizer: nullable via type array", () => {
  const raw = { type: ["string", "null"] };
  const s = schema(raw);
  it("nullable is true", () => expect(s.nullable).toBe(true));
});

describe("json-schema normalizer: enum values", () => {
  const raw = { type: "string", enum: ["active", "disabled"] };
  const s = schema(raw);
  it("enumValues contains active", () => expect(s.enumValues).toContain("active"));
  it("enumValues contains disabled", () => expect(s.enumValues).toContain("disabled"));
});

describe("json-schema normalizer: array items", () => {
  const raw = { type: "array", items: { type: "object", required: ["id"], properties: { id: { type: "string" } } } };
  const s = schema(raw);
  it("items is not null", () => expect(s.items).not.toBeNull());
  it("items has id in required", () => expect(s.items!.required.has("id")).toBe(true));
});

describe("json-schema normalizer: additionalProperties false", () => {
  const raw = { type: "object", additionalProperties: false };
  const s = schema(raw);
  it("additionalProperties is false", () => expect(s.additionalProperties).toBe(false));
});

describe("json-schema normalizer: no schema = UNKNOWN type", () => {
  const s = schema({});
  it("type is unknown", () => expect(s.type).toContain("unknown"));
  it("required is empty", () => expect(s.required.size).toBe(0));
});
