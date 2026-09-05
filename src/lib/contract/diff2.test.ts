import { describe, it, expect } from "vitest";
import { parseContract } from "@/lib/contract/parser";
import { diffContracts } from "@/lib/contract/diff";
import { diffJson, calculateRisk } from "@/lib/diff/engine";
import { normalizeJsonSchema } from "@/lib/contract/json-schema";
import type { NormalizedSchema } from "@/lib/contract/types";

function schema(raw: unknown): NormalizedSchema {
  return normalizeJsonSchema(raw, "$", raw);
}

function contractDiff(a: unknown, b: unknown, dir: "REQUEST" | "RESPONSE" = "RESPONSE") {
  return diffContracts(schema(a), schema(b), dir);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 11. REQUIRED / OPTIONAL — RESPONSE direction
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: identical schemas produce no changes", () => {
  const s = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  it("no changes", () => expect(contractDiff(s, s)).toHaveLength(0));
});

describe("contract: required field removed (RESPONSE)", () => {
  const a = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");

  it("detects REMOVED for name", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$.name")).toBe(true);
  });
  it("REMOVED is BREAKING", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path === "$.name");
    expect(c!.compatibility).toBe("BREAKING");
  });
  it("fieldRequirement is REQUIRED", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path === "$.name");
    expect(c!.fieldRequirement).toBe("REQUIRED");
  });
});

describe("contract: optional field removed (RESPONSE)", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");

  it("detects REMOVED for name", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$.name")).toBe(true);
  });
  it("fieldRequirement is OPTIONAL", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path === "$.name");
    expect(c!.fieldRequirement).toBe("OPTIONAL");
  });
  it("REMOVED is BREAKING regardless of requirement", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path === "$.name");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

describe("contract: optional property added (RESPONSE) = NON_BREAKING", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");

  it("detects ADDED for name", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$.name")).toBe(true);
  });
  it("NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "ADDED" && c.path === "$.name");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
  it("fieldRequirement is OPTIONAL", () => {
    const c = changes.find((c) => c.kind === "ADDED" && c.path === "$.name");
    expect(c!.fieldRequirement).toBe("OPTIONAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. OPTIONAL → REQUIRED and REQUIRED → OPTIONAL
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: optional → required (REQUEST) = BREAKING", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "REQUEST");

  it("emits CONTRACT_REQUIREMENT_CHANGED", () => {
    expect(changes.some((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name")).toBe(true);
  });
  it("compatibility is BREAKING", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.compatibility).toBe("BREAKING");
  });
  it("requirementBefore is OPTIONAL", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.requirementBefore).toBe("OPTIONAL");
  });
  it("requirementAfter is REQUIRED", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.requirementAfter).toBe("REQUIRED");
  });
});

describe("contract: optional → required (RESPONSE) = NON_BREAKING", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");

  it("emits CONTRACT_REQUIREMENT_CHANGED", () => {
    expect(changes.some((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name")).toBe(true);
  });
  it("compatibility is NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

describe("contract: required → optional (REQUEST) = NON_BREAKING", () => {
  const a = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "REQUEST");

  it("compatibility is NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

describe("contract: required → optional (RESPONSE) = BREAKING", () => {
  const a = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");

  it("compatibility is BREAKING", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.compatibility).toBe("BREAKING");
  });
  it("requirementBefore is REQUIRED", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.requirementBefore).toBe("REQUIRED");
  });
  it("requirementAfter is OPTIONAL", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED" && c.path === "$.name");
    expect(c!.requirementAfter).toBe("OPTIONAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 13. NULLABILITY SCHEMA CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: nullable false → true = NON_BREAKING", () => {
  const a = { type: "object", properties: { email: { type: "string" } } };
  const b = { type: "object", properties: { email: { type: "string", nullable: true } } };
  const changes = contractDiff(a, b);

  it("emits NULLABILITY_SCHEMA_CHANGED", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_SCHEMA_CHANGED" && c.path === "$.email")).toBe(true);
  });
  it("compatibility is NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "NULLABILITY_SCHEMA_CHANGED");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

describe("contract: nullable true → false = BREAKING", () => {
  const a = { type: "object", properties: { email: { type: "string", nullable: true } } };
  const b = { type: "object", properties: { email: { type: "string" } } };
  const changes = contractDiff(a, b);

  it("emits NULLABILITY_SCHEMA_CHANGED", () => {
    expect(changes.some((c) => c.kind === "NULLABILITY_SCHEMA_CHANGED" && c.path === "$.email")).toBe(true);
  });
  it("compatibility is BREAKING", () => {
    const c = changes.find((c) => c.kind === "NULLABILITY_SCHEMA_CHANGED");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 14. ENUM CONTRACT CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: enum value added", () => {
  const a = { type: "object", properties: { status: { type: "string", enum: ["active", "disabled"] } } };
  const b = { type: "object", properties: { status: { type: "string", enum: ["active", "disabled", "pending"] } } };
  const changes = contractDiff(a, b);

  it("emits ENUM_VALUE_ADDED", () => {
    expect(changes.some((c) => c.kind === "ENUM_VALUE_ADDED" && c.enumValue === "pending")).toBe(true);
  });
  it("NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "ENUM_VALUE_ADDED");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

describe("contract: enum value removed", () => {
  const a = { type: "object", properties: { status: { type: "string", enum: ["active", "disabled", "pending"] } } };
  const b = { type: "object", properties: { status: { type: "string", enum: ["active", "disabled"] } } };
  const changes = contractDiff(a, b);

  it("emits ENUM_VALUE_REMOVED", () => {
    expect(changes.some((c) => c.kind === "ENUM_VALUE_REMOVED" && c.enumValue === "pending")).toBe(true);
  });
  it("BREAKING", () => {
    const c = changes.find((c) => c.kind === "ENUM_VALUE_REMOVED");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

describe("contract: enum inside array item", () => {
  const a = { type: "array", items: { type: "object", properties: { status: { type: "string", enum: ["active"] } } } };
  const b = { type: "array", items: { type: "object", properties: { status: { type: "string", enum: ["active", "pending"] } } } };
  const changes = contractDiff(a, b);

  it("emits ENUM_VALUE_ADDED inside array item", () => {
    expect(changes.some((c) => c.kind === "ENUM_VALUE_ADDED" && c.enumValue === "pending")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 15. TYPE CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: type change string → number", () => {
  const a = { type: "object", properties: { id: { type: "string" } } };
  const b = { type: "object", properties: { id: { type: "number" } } };
  const changes = contractDiff(a, b);

  it("emits TYPE_CHANGED", () => {
    expect(changes.some((c) => c.kind === "TYPE_CHANGED" && c.path === "$.id")).toBe(true);
  });
  it("BREAKING", () => {
    const c = changes.find((c) => c.kind === "TYPE_CHANGED");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

describe("contract: type change object → array", () => {
  const a = { type: "object", properties: { data: { type: "object" } } };
  const b = { type: "object", properties: { data: { type: "array" } } };
  const changes = contractDiff(a, b);

  it("emits TYPE_CHANGED", () => {
    expect(changes.some((c) => c.kind === "TYPE_CHANGED" && c.path === "$.data")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 16. NESTED PROPERTY CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: nested property change", () => {
  const a = {
    type: "object",
    properties: {
      user: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" }, email: { type: "string" } },
      },
    },
  };
  const b = {
    type: "object",
    properties: {
      user: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
  };
  const changes = contractDiff(a, b);

  it("detects REMOVED at $.user.email", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path === "$.user.email")).toBe(true);
  });
  it("BREAKING", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path === "$.user.email");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

describe("contract: required field inside array item", () => {
  const a = {
    type: "array",
    items: {
      type: "object",
      required: ["id", "name"],
      properties: { id: { type: "string" }, name: { type: "string" } },
    },
  };
  const b = {
    type: "array",
    items: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, name: { type: "string" } },
    },
  };
  const changes = contractDiff(a, b, "RESPONSE");

  it("detects CONTRACT_REQUIREMENT_CHANGED inside array item", () => {
    expect(changes.some((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED")).toBe(true);
  });
  it("BREAKING in RESPONSE direction (required → optional)", () => {
    const c = changes.find((c) => c.kind === "CONTRACT_REQUIREMENT_CHANGED");
    expect(c!.compatibility).toBe("BREAKING");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 17. ADDITIONAL PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: additionalProperties unrestricted → false = REVIEW", () => {
  const a = { type: "object", properties: { id: { type: "string" } } };
  const b = { type: "object", properties: { id: { type: "string" } }, additionalProperties: false };
  const changes = contractDiff(a, b);

  it("emits ADDITIONAL_PROPERTIES_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ADDITIONAL_PROPERTIES_CHANGED")).toBe(true);
  });
  it("compatibility is REVIEW", () => {
    const c = changes.find((c) => c.kind === "ADDITIONAL_PROPERTIES_CHANGED");
    expect(c!.compatibility).toBe("REVIEW");
  });
});

describe("contract: additionalProperties false → true = NON_BREAKING", () => {
  const a = { type: "object", properties: { id: { type: "string" } }, additionalProperties: false };
  const b = { type: "object", properties: { id: { type: "string" } } };
  const changes = contractDiff(a, b);

  it("emits ADDITIONAL_PROPERTIES_CHANGED", () => {
    expect(changes.some((c) => c.kind === "ADDITIONAL_PROPERTIES_CHANGED")).toBe(true);
  });
  it("compatibility is NON_BREAKING", () => {
    const c = changes.find((c) => c.kind === "ADDITIONAL_PROPERTIES_CHANGED");
    expect(c!.compatibility).toBe("NON_BREAKING");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 18. RISK INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract risk: required field removed scores CRITICAL", () => {
  const a = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");
  const risk = calculateRisk(changes);

  it("label is CRITICAL", () => expect(risk.label).toBe("CRITICAL"));
  it("score >= 90", () => expect(risk.score).toBeGreaterThanOrEqual(90));
});

describe("contract risk: optional field added scores LOW", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "RESPONSE");
  const risk = calculateRisk(changes);

  it("label is LOW", () => expect(risk.label).toBe("LOW"));
});

describe("contract risk: enum value removed scores HIGH", () => {
  const a = { type: "object", properties: { s: { type: "string", enum: ["a", "b"] } } };
  const b = { type: "object", properties: { s: { type: "string", enum: ["a"] } } };
  const changes = contractDiff(a, b);
  const risk = calculateRisk(changes);

  it("label is HIGH", () => expect(risk.label).toBe("HIGH"));
  it("score is 60", () => expect(risk.score).toBe(60));
});

describe("contract risk: optional → required (REQUEST) scores HIGH", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "REQUEST");
  const risk = calculateRisk(changes);

  it("score > 0", () => expect(risk.score).toBeGreaterThan(0));
  it("label is not NO CHANGES", () => expect(risk.label).not.toBe("NO CHANGES"));
});

// ═══════════════════════════════════════════════════════════════════════════════
// 19. DIRECTION FIELD ON CHANGES
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: direction field is stamped on changes", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const b = { type: "object", required: ["id"], properties: { id: { type: "string" } } };

  it("RESPONSE direction is stamped", () => {
    const changes = contractDiff(a, b, "RESPONSE");
    for (const c of changes) expect(c.direction).toBe("RESPONSE");
  });

  it("REQUEST direction is stamped", () => {
    const changes = contractDiff(a, b, "REQUEST");
    for (const c of changes) expect(c.direction).toBe("REQUEST");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 20. NO SCHEMA = UNKNOWN (raw JSON diff regression)
// ═══════════════════════════════════════════════════════════════════════════════

describe("regression: raw JSON diff never infers required/optional", () => {
  it("REMOVED field has fieldRequirement UNKNOWN", () => {
    const [c] = diffJson({ x: 1 }, {});
    expect(c!.fieldRequirement).toBe("UNKNOWN");
  });

  it("ADDED field has fieldRequirement UNKNOWN", () => {
    const [c] = diffJson({}, { x: 1 });
    expect(c!.fieldRequirement).toBe("UNKNOWN");
  });
});

describe("regression: raw JSON diff never emits enum changes", () => {
  it("diffJson never produces ENUM_VALUE_ADDED", () => {
    const changes = diffJson({ s: "active" }, { s: "pending" });
    expect(changes.every((c) => c.kind !== "ENUM_VALUE_ADDED")).toBe(true);
  });

  it("diffJson never produces ENUM_VALUE_REMOVED", () => {
    const changes = diffJson({ s: "active" }, {});
    expect(changes.every((c) => c.kind !== "ENUM_VALUE_REMOVED")).toBe(true);
  });
});

describe("regression: raw JSON diff never emits CONTRACT_REQUIREMENT_CHANGED", () => {
  it("diffJson never produces CONTRACT_REQUIREMENT_CHANGED", () => {
    const changes = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(changes.every((c) => c.kind !== "CONTRACT_REQUIREMENT_CHANGED")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 21. DETERMINISTIC OUTPUT
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: deterministic output", () => {
  const a = {
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "string" },
      status: { type: "string", enum: ["active", "disabled"] },
      name: { type: "string", nullable: true },
    },
  };
  const b = {
    type: "object",
    required: ["id", "name"],
    properties: {
      id: { type: "number" },
      status: { type: "string", enum: ["active", "pending"] },
      name: { type: "string" },
    },
  };

  it("produces identical results across 5 runs", () => {
    const results = Array.from({ length: 5 }, () => contractDiff(a, b, "RESPONSE"));
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 22. OPENAPI $ref RESOLUTION VIA PARSER
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: OpenAPI $ref in response schema", () => {
  const doc = JSON.stringify({
    openapi: "3.0.3",
    info: { title: "T", version: "1" },
    paths: {
      "/users": {
        get: {
          responses: {
            "200": {
              description: "ok",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/User" },
                },
              },
            },
          },
        },
      },
    },
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

  it("schema has id in required", () => {
    const r = parseContract(doc);
    expect(r.ok && r.schema.required.has("id")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 23. REQUIRED FIELD INSIDE ARRAY ITEM (RESPONSE)
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: required field inside array item removed (RESPONSE)", () => {
  const a = {
    type: "array",
    items: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, email: { type: "string" } },
    },
  };
  const b = {
    type: "array",
    items: {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" } },
    },
  };
  const changes = contractDiff(a, b, "RESPONSE");

  it("detects REMOVED for $[].email", () => {
    expect(changes.some((c) => c.kind === "REMOVED" && c.path.includes("email"))).toBe(true);
  });
  it("fieldRequirement is OPTIONAL", () => {
    const c = changes.find((c) => c.kind === "REMOVED" && c.path.includes("email"));
    expect(c!.fieldRequirement).toBe("OPTIONAL");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 24. REQUIRED PROPERTY ADDED TO REQUEST = BREAKING
// ═══════════════════════════════════════════════════════════════════════════════

describe("contract: required property added to REQUEST schema = BREAKING", () => {
  const a = { type: "object", required: ["id"], properties: { id: { type: "string" } } };
  const b = { type: "object", required: ["id", "name"], properties: { id: { type: "string" }, name: { type: "string" } } };
  const changes = contractDiff(a, b, "REQUEST");

  it("detects ADDED for name", () => {
    expect(changes.some((c) => c.kind === "ADDED" && c.path === "$.name")).toBe(true);
  });
  it("BREAKING because required in REQUEST", () => {
    const c = changes.find((c) => c.kind === "ADDED" && c.path === "$.name");
    expect(c!.compatibility).toBe("BREAKING");
  });
  it("fieldRequirement is REQUIRED", () => {
    const c = changes.find((c) => c.kind === "ADDED" && c.path === "$.name");
    expect(c!.fieldRequirement).toBe("REQUIRED");
  });
});
