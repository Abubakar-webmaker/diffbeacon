#!/usr/bin/env node
/**
 * DiffBeacon CLI
 *
 * Usage:
 *   npm run diffbeacon -- <baseline> <candidate> [options]
 *   npx tsx cli/diffbeacon.mjs <baseline> <candidate> [options]
 *
 * Options:
 *   --format json|markdown   Output format (default: json)
 *   --fail-on breaking       Exit 1 if breaking changes detected
 *   --contract               Treat inputs as OpenAPI/JSON Schema contracts
 *   --direction REQUEST|RESPONSE  Contract direction (default: RESPONSE)
 *
 * Exit codes:
 *   0  Success / no breaking changes
 *   1  Breaking changes detected (when --fail-on breaking)
 *   2  Invalid input or execution error
 */

// @ts-check
import { readFileSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// Register tsconfig path aliases so @/ imports resolve
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// tsx registers TypeScript transforms — these imports work when run via tsx
const { diffJson, calculateRisk } = await import("../src/lib/diff/engine.ts");
const { parseContract }           = await import("../src/lib/contract/parser.ts");
const { diffContracts }           = await import("../src/lib/contract/diff.ts");
const { exportJson, exportMarkdown } = await import("../src/lib/export/report.ts");

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.length < 2 || args.includes("--help") || args.includes("-h")) {
  process.stdout.write(`
DiffBeacon CLI — Detect breaking API changes

Usage:
  npm run diffbeacon -- <baseline> <candidate> [options]

Arguments:
  baseline    Path to baseline JSON file
  candidate   Path to candidate JSON file

Options:
  --format json|markdown   Output format (default: json)
  --fail-on breaking       Exit 1 if breaking changes detected
  --contract               Treat inputs as OpenAPI/JSON Schema contracts
  --direction REQUEST|RESPONSE  Contract direction (default: RESPONSE)

Exit codes:
  0  Success / no breaking changes
  1  Breaking changes detected (when --fail-on breaking)
  2  Invalid input or execution error

Examples:
  npm run diffbeacon -- baseline.json candidate.json
  npm run diffbeacon -- baseline.json candidate.json --fail-on breaking
  npm run diffbeacon -- baseline.json candidate.json --format markdown
  npm run diffbeacon -- contract-v1.json contract-v2.json --contract --direction REQUEST
`);
  process.exit(args.length < 2 ? 2 : 0);
}

const [baselinePath, candidatePath] = args;
const fmtIdx    = args.indexOf("--format");
const format    = fmtIdx !== -1 ? args[fmtIdx + 1] : "json";
const foIdx     = args.indexOf("--fail-on");
const failOn    = foIdx !== -1 ? args[foIdx + 1] : null;
const isContract = args.includes("--contract");
const dirIdx    = args.indexOf("--direction");
const direction = dirIdx !== -1 ? args[dirIdx + 1] : "RESPONSE";

if (!["json", "markdown"].includes(format)) {
  process.stderr.write(`Invalid --format "${format}". Use "json" or "markdown".\n`);
  process.exit(2);
}

if (failOn && failOn !== "breaking") {
  process.stderr.write(`Invalid --fail-on "${failOn}". Only "breaking" is supported.\n`);
  process.exit(2);
}

if (isContract && !["REQUEST", "RESPONSE"].includes(direction)) {
  process.stderr.write(`Invalid --direction "${direction}". Use "REQUEST" or "RESPONSE".\n`);
  process.exit(2);
}

// ── Read inputs ───────────────────────────────────────────────────────────────

function readFile(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (/** @type {any} */ e) {
    process.stderr.write(`Cannot read file "${filePath}": ${e.message}\n`);
    process.exit(2);
  }
}

const baselineText  = readFile(baselinePath);
const candidateText = readFile(candidatePath);

// ── Run analysis ──────────────────────────────────────────────────────────────

let changes, risk;

if (isContract) {
  const baselineResult  = parseContract(baselineText);
  const candidateResult = parseContract(candidateText);

  if (!baselineResult.ok) {
    process.stderr.write(`Baseline contract error: ${baselineResult.error}\n`);
    process.exit(2);
  }
  if (!candidateResult.ok) {
    process.stderr.write(`Candidate contract error: ${candidateResult.error}\n`);
    process.exit(2);
  }

  changes = diffContracts(baselineResult.schema, candidateResult.schema, direction);
  risk    = calculateRisk(changes);
} else {
  let baseline, candidate;
  try {
    baseline = JSON.parse(baselineText);
  } catch {
    process.stderr.write("Baseline file contains invalid JSON.\n");
    process.exit(2);
  }
  try {
    candidate = JSON.parse(candidateText);
  } catch {
    process.stderr.write("Candidate file contains invalid JSON.\n");
    process.exit(2);
  }

  changes = diffJson(baseline, candidate);
  risk    = calculateRisk(changes);
}

// ── Output ────────────────────────────────────────────────────────────────────

const exportData = {
  mode:      isContract ? "contract" : "json",
  changes,
  risk,
  ai:        null,
  direction: isContract ? direction : undefined,
};

if (format === "markdown") {
  process.stdout.write(exportMarkdown(exportData) + "\n");
} else {
  process.stdout.write(exportJson(exportData) + "\n");
}

// ── Exit code ─────────────────────────────────────────────────────────────────

if (failOn === "breaking") {
  const hasBreaking = changes.some(
    (c) => c.compatibility === "BREAKING" || ["CRITICAL", "HIGH"].includes(c.severity),
  );
  process.exit(hasBreaking ? 1 : 0);
}

process.exit(0);
