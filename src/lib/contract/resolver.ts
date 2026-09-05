import type { ContractParseError } from "./types";
import { MAX_REF_DEPTH } from "./types";

/**
 * Local $ref resolver.
 *
 * Security rules:
 *   - Only local references (#/...) are supported.
 *   - External URL references (http://, https://, file://, relative paths)
 *     are rejected to prevent SSRF.
 *   - Circular references are detected and reported as errors.
 *   - Recursion depth is bounded by MAX_REF_DEPTH.
 *
 * The resolver operates on the raw parsed document (unknown) and returns
 * the resolved sub-document. Schema normalization is handled separately.
 */

export type RefError = Pick<ContractParseError, "error" | "code">;

function isExternalRef(ref: string): boolean {
  return (
    ref.startsWith("http://") ||
    ref.startsWith("https://") ||
    ref.startsWith("//") ||
    ref.startsWith("file://") ||
    (!ref.startsWith("#") && ref.includes("/"))
  );
}

function resolveLocalPath(doc: unknown, pointer: string): unknown {
  // pointer is like "/components/schemas/User"
  const parts = pointer.split("/").filter(Boolean);
  let current: unknown = doc;
  for (const part of parts) {
    const decoded = part.replace(/~1/g, "/").replace(/~0/g, "~");
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[decoded];
  }
  return current;
}

/**
 * Resolves a $ref string within the given document.
 * Returns the resolved sub-document or a RefError.
 */
export function resolveRef(
  ref: unknown,
  doc: unknown,
  visited: Set<string>,
  depth: number,
): { ok: true; value: unknown } | { ok: false; error: RefError } {
  if (typeof ref !== "string") {
    return { ok: false, error: { error: `$ref must be a string, got ${typeof ref}`, code: "MALFORMED_REF" } };
  }

  if (isExternalRef(ref)) {
    return {
      ok: false,
      error: {
        error: `External $ref "${ref}" is not supported. Only local references (#/...) are allowed.`,
        code: "EXTERNAL_REF_REJECTED",
      },
    };
  }

  if (!ref.startsWith("#")) {
    return { ok: false, error: { error: `Malformed $ref "${ref}": must start with #`, code: "MALFORMED_REF" } };
  }

  if (depth > MAX_REF_DEPTH) {
    return { ok: false, error: { error: `$ref resolution exceeded maximum depth (${MAX_REF_DEPTH})`, code: "CIRCULAR_REF" } };
  }

  if (visited.has(ref)) {
    return { ok: false, error: { error: `Circular $ref detected: "${ref}"`, code: "CIRCULAR_REF" } };
  }

  const pointer = ref.slice(1); // remove leading #
  const resolved = resolveLocalPath(doc, pointer);

  if (resolved === undefined) {
    return { ok: false, error: { error: `$ref "${ref}" could not be resolved in the document`, code: "MALFORMED_REF" } };
  }

  // If the resolved value itself has a $ref, resolve recursively.
  if (
    resolved !== null &&
    typeof resolved === "object" &&
    !Array.isArray(resolved) &&
    "$ref" in (resolved as Record<string, unknown>)
  ) {
    const nextRef = (resolved as Record<string, unknown>)["$ref"];
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    return resolveRef(nextRef, doc, nextVisited, depth + 1);
  }

  return { ok: true, value: resolved };
}

/**
 * Inlines all local $refs in a schema node, returning a new object with
 * $ref replaced by the resolved content. Circular refs are replaced with
 * an empty object to prevent infinite recursion.
 */
export function inlineRefs(
  node: unknown,
  doc: unknown,
  visited: Set<string> = new Set(),
  depth = 0,
): unknown {
  if (depth > MAX_REF_DEPTH) return {};
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    return node.map((item) => inlineRefs(item, doc, visited, depth));
  }

  const obj = node as Record<string, unknown>;

  if ("$ref" in obj) {
    const ref = obj["$ref"];
    if (typeof ref === "string" && visited.has(ref)) return {};
    const result = resolveRef(ref, doc, visited, depth);
    if (!result.ok) return {};
    const nextVisited = new Set(visited);
    if (typeof ref === "string") nextVisited.add(ref);
    return inlineRefs(result.value, doc, nextVisited, depth + 1);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = inlineRefs(v, doc, visited, depth);
  }
  return out;
}
