# DiffBeacon

> **Detect breaking API changes before production.**

DiffBeacon is a production-oriented API compatibility and change analysis tool that compares JSON API responses and API contracts, detects potentially breaking changes, calculates a deterministic risk score, and optionally explains the impact using AI.

The core design principle is simple:

> **Deterministic diff first. AI explains impact second.**

The deterministic engine is the source of truth. AI never decides which fields changed or invents compatibility results.

---

## Table of Contents

- [Overview](#overview)
- [Why DiffBeacon](#why-diffbeacon)
- [Core Principles](#core-principles)
- [How It Works](#how-it-works)
- [Key Features](#key-features)
- [Comparison Modes](#comparison-modes)
- [Deterministic Diff Engine](#deterministic-diff-engine)
- [Change Classification](#change-classification)
- [Compatibility Analysis](#compatibility-analysis)
- [Risk Scoring](#risk-scoring)
- [Array Intelligence](#array-intelligence)
- [Nullability Detection](#nullability-detection)
- [Enum Detection](#enum-detection)
- [Contract Diff](#contract-diff)
- [Live API Mode](#live-api-mode)
- [AI Impact Analysis](#ai-impact-analysis)
- [History](#history)
- [Shareable Results](#shareable-results)
- [Export](#export)
- [CLI](#cli)
- [CI/CD](#cicd)
- [Security](#security)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [API Routes](#api-routes)
- [Technology Stack](#technology-stack)
- [Requirements](#requirements)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Development Commands](#development-commands)
- [Testing](#testing)
- [Build Verification](#build-verification)
- [Example](#example)
- [CLI Examples](#cli-examples)
- [Exit Codes](#exit-codes)
- [Severity Reference](#severity-reference)
- [Compatibility Reference](#compatibility-reference)
- [Design Decisions](#design-decisions)
- [Production Considerations](#production-considerations)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security Disclosure](#security-disclosure)
- [License](#license)

---

## Overview

API changes that look harmless during development can break production consumers.

Examples include:

- changing a response field from `number` to `string`
- removing a property
- making a nullable value non-nullable
- removing an enum value
- changing an HTTP status
- changing the structure of an object
- changing an array in a way that affects consumers

DiffBeacon analyzes these changes before they reach production.

It supports:

- JSON response comparison
- Live API comparison
- OpenAPI / JSON Schema contract comparison
- deterministic compatibility analysis
- risk scoring
- optional AI impact explanation
- analysis history
- shareable results
- JSON and Markdown export
- command-line execution
- CI/CD compatibility gates

---

## Why DiffBeacon?

Traditional JSON diff tools answer:

> **What changed?**

DiffBeacon goes one step further:

> **Could this change break consumers, how severe is it, and why?**

For example:

```json
{
  "id": 123
}

becoming:

{
  "id": "123"
}

is not simply a textual difference.

For a typed API consumer, this can be a compatibility problem.

DiffBeacon therefore separates:

- Detection
- Classification
- Compatibility
- Risk
- Human-readable impact explanation

This separation keeps the core analysis predictable and testable.

## Core Principles

### 1. Deterministic first

The diff engine is deterministic.

The same input produces the same result.

### 2. AI is optional

AI is an enhancement layer.

The product remains functional without an AI provider.

### 3. AI never becomes the source of truth

AI receives deterministic diff facts and explains their potential impact.

It does not decide whether a field was added, removed, or type-changed.

### 4. Security by default

Server-side processing, SSRF protection, payload limits, sensitive-header filtering, rate limiting, and secret handling are built into the architecture.

### 5. CI-friendly

The CLI can fail a pipeline when breaking changes are detected.

## How It Works
                 RESPONSE / CONTRACT A
                           +
                 RESPONSE / CONTRACT B
                           |
                           v
              +-------------------------+
              | Deterministic Diff      |
              | Engine                  |
              +-------------------------+
                           |
                           v
              +-------------------------+
              | Change Classification   |
              |                         |
              | ADDED                   |
              | REMOVED                 |
              | CHANGED                 |
              | TYPE_CHANGED            |
              | NULLABILITY_CHANGED     |
              | ENUM_*                  |
              | ARRAY_*                 |
              | STATUS_CHANGED          |
              | CONTRACT_*              |
              +-------------------------+
                           |
                           v
              +-------------------------+
              | Compatibility Analysis |
              +-------------------------+
                           |
                           v
              +-------------------------+
              | Risk Scoring            |
              | 0 - 100                 |
              +-------------------------+
                           |
                           v
              +-------------------------+
              | Optional AI Explanation |
              +-------------------------+
                           |
                           v
         +----------------+----------------+
         |                |                |
         v                v                v
      History          Share            Export

## Key Features

### JSON Response Diff

Compare two JSON responses recursively.

Supported scenarios include:

- nested objects
- primitive values
- arrays
- nullability
- type changes
- field additions
- field removals
- enum changes
- array reordering
- array item changes
- HTTP status changes

### Recursive Comparison

DiffBeacon recursively traverses nested JSON structures.

Example:

```
$.user
$.user.id
$.user.profile
$.user.profile.email
$.user.profile.settings.notifications
```

This allows deeply nested API changes to be analyzed without flattening the response.

### Breaking Change Detection

Potentially incompatible changes receive compatibility classification and severity.

Examples:

- REMOVED
- TYPE_CHANGED
- ENUM_VALUE_REMOVED
- value -> null

### Risk Score

Every analysis receives a score from:

0 - 100

The score is converted into:

- LOW
- MEDIUM
- HIGH
- CRITICAL

The calculation considers the detected changes and their compatibility impact rather than simply counting differences.

### Live API Comparison

DiffBeacon can compare two real API endpoints.

The browser does not directly call arbitrary external APIs.

Requests are handled through the server-side API proxy where security validation is applied.

Supported HTTP methods include:

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

### OpenAPI / JSON Schema Contract Diff

DiffBeacon can compare API contracts rather than only concrete API responses.

Supported concepts include:

- object properties
- required fields
- optional fields
- nullable fields
- enums
- item schemas
- additional properties
- request contracts
- response contracts
- local $ref resolution

Contract comparison can be performed in:

- REQUEST
- RESPONSE

directions.

### AI Impact Analysis

AI can explain:

- what the breaking changes mean
- which consumers may be affected
- why the change may be dangerous
- what teams should review
- what should be changed before release

AI is optional.

Without an AI provider:

- Deterministic analysis continues to work.

### History

The web application stores the latest analyses locally in the browser.

Current local history capacity:

50 analyses

Users can reopen or remove previous analyses.

### Shareable Analysis

DiffBeacon can create shareable analysis results.

Characteristics:

- cryptographically random share IDs
- 24-hour default TTL
- bounded payload size
- sensitive authentication data excluded
- server-side storage

### Export

Analysis results can be exported as:

- JSON
- Markdown

Exports are intended for:

- pull requests
- engineering documentation
- release reviews
- CI artifacts
- team discussions

## Comparison Modes

DiffBeacon provides three primary analysis workflows.

### 1. Response Diff

Paste Response A + Response B and run the deterministic diff engine.

### 2. Live API Diff

Provide:

Endpoint A
+
Endpoint B

and let the server fetch the responses securely.

### 3. Contract Diff

Compare:

OpenAPI
JSON Schema

contracts.

Specify whether the comparison represents:

REQUEST

or:

RESPONSE

compatibility.

## Deterministic Diff Engine

The core engine is implemented as a recursive comparison system.

It produces structured changes rather than plain text differences.

Every change includes information such as:

- path
- kind
- severity
- compatibility

Additional metadata may be attached for specific change types.

The engine supports deterministic ordering so that results remain stable and testable.

## Change Classification

DiffBeacon recognizes multiple change categories.

### Structural Changes

- ADDED
- REMOVED
- CHANGED
- TYPE_CHANGED

### Nullability Changes

- NULLABILITY_CHANGED

The direction of the change matters.

Example:

string -> null

can be more dangerous than:

null -> string
### Array Changes

- ARRAY_LENGTH_CHANGED
- ARRAY_REORDERED

Item-level changes can also be reported using normal structural change types.

### Enum Changes

- ENUM_VALUE_ADDED
- ENUM_VALUE_REMOVED

Enum comparison is schema-aware and does not incorrectly treat ordinary response values as enums.

### HTTP Status Changes

- STATUS_CHANGED

Status changes are treated as first-class API compatibility signals.

### Contract-Specific Changes

Contract comparisons can additionally detect:

- CONTRACT_REQUIREMENT_CHANGED
- NULLABILITY_SCHEMA_CHANGED
- ADDITIONAL_PROPERTIES_CHANGED

## Compatibility Analysis

Each detected change is classified as one of:

- BREAKING
- NON_BREAKING
- REVIEW

Examples of breaking scenarios include:

- Property removed
- Type changed
- Nullable value becomes null
- Enum value removed

Examples of non-breaking scenarios include:

- New optional property
- Enum value added
- Null becomes a concrete value

Some changes are intentionally classified as REVIEW when compatibility depends on consumer behavior.

## Risk Scoring

Risk is represented as:

0 - 100

The scoring system prioritizes breaking changes first and incorporates review and non-breaking changes according to the detected result set.

Risk levels:

Score	Level
0–29	LOW
30–59	MEDIUM
60–79	HIGH
80–100	CRITICAL

The final score is capped at 100.

## Array Intelligence

Arrays require special handling because naive index-based comparison can produce misleading results.

DiffBeacon supports identity-based comparison using candidate identity fields such as:

- id
- key
- uuid

Priority is:

id -> key -> uuid

When a stable identity is available, array elements can be compared by identity rather than only by position.

This reduces false positives caused by reordering.

Example:

[
  { "id": 1, "name": "Alice" },
  { "id": 2, "name": "Bob" }
]

becoming:

[
  { "id": 2, "name": "Bob" },
  { "id": 1, "name": "Alice" }
]

can be recognized as an array reorder instead of incorrectly reporting the entries as entirely different objects.

## Nullability Detection

DiffBeacon distinguishes nullability changes from ordinary type changes.

Example:

string -> null

is represented as a nullability change rather than simply:

TYPE_CHANGED

Direction matters because:

value -> null

can be a breaking change while:

null -> value

may be non-breaking depending on the contract and consumer behavior.

## Enum Detection

Enum comparison is schema-aware.

For example:

{
  "enum": ["draft", "published"]
}

becoming:

{
  "enum": ["draft"]
}

produces an enum removal.

Enum comparison:

- is order-independent
- is duplicate-safe
- preserves value types
- does not treat 1 and "1" as the same value

Raw JSON response values are not incorrectly classified as enum changes.

## Contract Diff

DiffBeacon contains a dedicated contract analysis layer.

The contract system supports normalized representations for:

- JSON Schema
- OpenAPI 3.x

The pipeline is:

Contract Input
      |
      v
Parser
      |
      v
Reference Resolution
      |
      v
Normalized Contract
      |
      v
Contract Diff
      |
      v
Compatibility
      |
      v
Risk

### Contract Parsing

The parser identifies supported contract formats and converts them into a normalized internal representation.

Unsupported or unsafe contract inputs are rejected instead of being silently interpreted.

### $ref Resolution

Local references can be resolved.

External references are rejected by design.

Circular reference protection and depth limits prevent runaway resolution.

### Request vs Response Direction

Contract compatibility depends on direction.

DiffBeacon therefore supports:

- REQUEST
- RESPONSE

rather than assuming the same compatibility rules apply to both.

## Live API Mode

Live API requests pass through:

/api/request

The server validates and executes requests before returning normalized results to the application.

### Supported Methods

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

### Request Security

The live API proxy includes protections against:

- private IP access
- loopback access
- link-local addresses
- cloud metadata endpoints
- CGNAT ranges
- IPv4 private networks
- IPv6 private/link-local destinations
- DNS rebinding
- invalid protocols
- header injection
- sensitive header forwarding

Only `http` and `https` are allowed.

### Request Limits

Configured limits protect the server from excessive payloads.

Current limits include:

Request body: 512 KB
Live response body: 2 MB
### Timeout

Live requests use a bounded server-side timeout.

Current request timeout:

10 seconds
## AI Impact Analysis

AI processing is intentionally isolated from the deterministic engine.

The flow is:

Deterministic Result
        |
        v
AI Provider Adapter
        |
        v
Impact Explanation

Supported provider strategy:

Groq -> Claude -> fallback

When a Groq key is present, Groq has priority.

When Groq is unavailable and Anthropic is configured, Claude can be used.

When neither provider is available, DiffBeacon still returns the deterministic analysis.

AI failures do not destroy the underlying diff result.

### Server-Side AI Security

AI API keys are never exposed to the browser.

Keys are read only from server-side environment variables.

They must never be committed to Git.

## History

The client keeps the latest:

50 analyses

in browser local storage.

History is intended for quick comparison, reopening previous work, and reviewing recent API changes.

Persistent database-backed history is planned for a future version.

## Shareable Results

Share endpoints are available through:

/api/share
/api/share/[id]

Shared results use:

- random identifiers
- bounded storage
- payload size limits
- expiration
- sensitive field stripping

Default expiration:

24 hours

Shared results are not intended to be permanent document storage.

## Export

Supported formats:

- JSON
- Markdown

Markdown output is designed to be safely embedded into engineering workflows such as pull requests and release reviews.

## CLI

DiffBeacon includes a command-line interface for local development and CI/CD workflows.

The CLI can run without starting the web application.

### Basic JSON Diff

```bash
npm run diffbeacon -- baseline.json candidate.json
```

### Markdown Output

```bash
npm run diffbeacon -- baseline.json candidate.json --format markdown
```

### Fail CI on Breaking Changes

```bash
npm run diffbeacon -- baseline.json candidate.json --fail-on breaking
```

### Contract Diff

```bash
npm run diffbeacon -- contract-v1.json contract-v2.json --contract
```

### Request Contract

```bash
npm run diffbeacon -- contract-v1.json contract-v2.json --contract --direction REQUEST
```

### Response Contract

```bash
npm run diffbeacon -- contract-v1.json contract-v2.json --contract --direction RESPONSE
```

### Direct CLI Execution

The CLI can also be executed with:

```bash
npx tsx cli/diffbeacon.mjs ...
```
## Exit Codes

| Code | Meaning |
|------|-------------------------------------------|
| 0 | Successful execution / no breaking changes |
| 1 | Breaking changes detected when `--fail-on breaking` is enabled |
| 2 | Invalid input or execution error |

This makes DiffBeacon suitable for CI compatibility gates.

## CI/CD

DiffBeacon includes:

```
.github/workflows/ci.yml
```

The workflow runs on:

- pushes to main
- pull requests targeting main

The CI pipeline executes:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

And CLI smoke tests.

This ensures that application changes and CLI behavior are validated automatically.

## Security

Security is a core part of the architecture.

### Secrets

API keys are server-side only.

Never commit `.env.local` or any file containing real credentials.

The committed `.env.example` contains placeholders only.

### SSRF Protection

The live API proxy blocks access to protected network destinations, including:

- localhost
- loopback
- private networks
- link-local addresses
- cloud metadata services
- CGNAT ranges
- restricted IPv6 destinations

DNS rebinding protection validates resolved addresses rather than trusting the original hostname alone.

### Sensitive Headers

Authentication and credential-bearing headers are filtered and are not included in shared analysis payloads.

Examples include:

- Authorization
- Bearer tokens
- API keys

### Rate Limiting

API routes are protected with a per-IP sliding-window rate limiter.

Default configuration: 30 requests per 60 seconds.

The limits are configurable through environment variables.

### Payload Limits

| Resource | Limit |
|---|---|
| API request body | 512 KB |
| Contract payload | 512 KB |
| Share payload | 256 KB |
| Live API response | 2 MB |

### Logging

Structured server-side logging intentionally avoids storing:

- secrets
- authentication headers
- request bodies
- sensitive credentials

Logs should contain only safe operational information.

### Share IDs

Share identifiers are generated using cryptographically secure randomness.

The current identifier format is 32 hexadecimal characters representing 16 bytes / 128 bits.
## Architecture

DiffBeacon uses a layered architecture separating UI, transport, business logic, contract processing, security, and AI.

High-level architecture:

```                    Next.js App Router
                           |
             +-------------+-------------+
             |                           |
             v                           v
         UI / UX                    API Routes
                                         |
                      +------------------+------------------+
                      |                  |                  |
                      v                  v                  v
                  Diff Engine       Contract Layer     Live API Layer
                      |                  |                  |
                      +------------------+------------------+
                                         |
                                         v
                                 Compatibility Engine
                                         |
                                         v
                                    Risk Engine
                                         |
                                         v
                                  Optional AI Layer
```

The architecture intentionally keeps deterministic logic independent from provider-specific AI functionality.

## Project Structure

A simplified project structure:

```diffbeacon/
|
├── .github/
│   └── workflows/
│       └── ci.yml
|
├── cli/
│   └── diffbeacon.mjs
|
├── public/
|
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/
│   │   │   ├── contract/
│   │   │   │   └── diff/
│   │   │   ├── request/
│   │   │   └── share/
│   │   │       └── [id]/
│   │   └── ...
│   │
│   └── lib/
│       ├── api/
│       ├── contract/
│       │   ├── diff.ts
│       │   ├── json-schema.ts
│       │   ├── openapi.ts
│       │   ├── parser.ts
│       │   ├── resolver.ts
│       │   └── types.ts
│       │
│       ├── diff/
│       │   ├── arrays.ts
│       │   ├── compatibility.ts
│       │   ├── engine.ts
│       │   ├── enums.ts
│       │   └── risk.ts
│       │
│       └── ...
|
├── .env.example
├── .gitignore
├── eslint.config.*
├── next.config.ts
├── package.json
├── package-lock.json
├── README.md
├── tsconfig.json
└── LICENSE
```

## API Routes

### Analyze

`/api/analyze` — Used for analysis and optional AI impact processing.

### Live API Request

`/api/request` — Executes validated external API requests through the server.

### Contract Diff

`/api/contract/diff` — Compares OpenAPI / JSON Schema contracts.

### Share

`/api/share` — Creates a shareable analysis.

### Share Retrieval

`/api/share/[id]` — Retrieves a valid, non-expired shared result.

## Technology Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 |
| Routing | Next.js App Router |
| Language | TypeScript |
| Type Safety | TypeScript strict mode |
| Styling | Tailwind CSS v4 |
| UI Editor | Monaco Editor |
| Icons | Lucide |
| Validation | Zod |
| Testing | Vitest |
| Runtime | Node.js |
| CLI | tsx |
| AI Development | Groq |
| AI Production Provider | Anthropic Claude |
| CI | GitHub Actions |
## Requirements

Recommended runtime: Node.js >= 20.9

Git is also required for cloning and contributing.

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Abubakar-webmaker/diffbeacon.git
```

### 2. Enter the project

```bash
cd diffbeacon
```

### 3. Install dependencies

```bash
npm install
```

### 4. Create local environment configuration

Copy `.env.example` to `.env.local`.

On macOS / Linux:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

### 5. Start the development server

```bash
npm run dev
```

Open: http://localhost:3000

### AI Configuration

AI is optional. Without AI configuration, deterministic comparison works normally.

Add an AI provider key to `.env.local` to enable impact explanations.

## Environment Variables

Example configuration:

```env
# Groq
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# Anthropic Claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Rate limiting
RATE_LIMIT_MAX=30
RATE_LIMIT_WINDOW_MS=60000

# Optional local-development override
# RATE_LIMIT_DISABLED=true

# Share storage
SHARE_TTL_MS=86400000
SHARE_MAX_ENTRIES=1000
```

### Provider Selection

AI provider selection is automatic.

Priority:

1. Groq
2. Anthropic Claude
3. Deterministic fallback

When `GROQ_API_KEY` is available, Groq is used. Otherwise, if `ANTHROPIC_API_KEY` is available, Claude is used. Otherwise, deterministic result only.

AI failures do not invalidate the deterministic analysis.

## Development Commands

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm run start

# Tests
npm run test

# Type checking
npm run typecheck

# Linting
npm run lint

# CLI
npm run diffbeacon -- ...
```
## Testing

DiffBeacon uses Vitest for automated testing.

The suite covers:

- recursive diff engine
- compatibility classification
- risk scoring
- array intelligence
- nullability
- enum comparison
- contract diff
- OpenAPI normalization
- JSON Schema normalization
- reference resolution
- API request validation
- SSRF protection
- sensitive headers
- request limits
- share storage
- share expiration
- export formatting
- rate limiting
- structured logging
- error handling
- CLI behavior

Current verified automated test suite: 489 tests passed, 8 test files passed.
## Build Verification

The project should pass all of the following before merging production changes:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
npm audit
```

Current verified state:

```
Tests:        489 / 489 PASS
Typecheck:    PASS
Lint:         PASS
Production:   BUILD PASS
Audit:        0 vulnerabilities
```
## Example

### Response A

```json
{
  "user": {
    "id": 123,
    "name": "Abubakar"
  }
}
```

### Response B

```json
{
  "user": {
    "id": "123"
  }
}
```

DiffBeacon can report:

| Path | Change | Severity | Compatibility |
|---|---|---|---|
| $.user.id | TYPE_CHANGED (number → string) | HIGH | BREAKING |
| $.user.name | REMOVED | CRITICAL | BREAKING |

Example result:

```
Risk: 100 / 100
Level: CRITICAL
Breaking changes: 2
```

AI can then explain the likely downstream impact and recommended review actions.

## CLI Examples

```bash
# Compare two JSON responses
npm run diffbeacon -- baseline.json candidate.json

# Produce Markdown
npm run diffbeacon -- baseline.json candidate.json --format markdown

# Fail CI when breaking changes exist
npm run diffbeacon -- baseline.json candidate.json --fail-on breaking

# Compare API contracts
npm run diffbeacon -- contract-v1.json contract-v2.json --contract

# Request contract
npm run diffbeacon -- contract-v1.json contract-v2.json --contract --direction REQUEST

# Response contract
npm run diffbeacon -- contract-v1.json contract-v2.json --contract --direction RESPONSE
```
## Severity Reference

| Severity | Meaning |
|---|---|
| CRITICAL | Highly likely to break existing consumers |
| HIGH | Significant compatibility risk |
| MEDIUM | Consumer behavior may require review |
| LOW | Usually low compatibility risk |

Typical examples:

| Change | Typical Severity |
|---|---|
| Property removed | CRITICAL |
| Type changed | HIGH |
| Value changed | MEDIUM |
| Property added | LOW |
| Array reorder | LOW / REVIEW |
| Enum value removed | HIGH |
| Nullability value → null | HIGH |

Severity is part of the deterministic classification system and contributes to the final risk analysis.

## Compatibility Reference

### BREAKING

Potentially incompatible with existing consumers.

Examples:

- REMOVED
- TYPE_CHANGED
- ENUM_VALUE_REMOVED
- value -> null

### NON_BREAKING

Usually compatible when consumers are implemented defensively.

Examples:

- ADDED
- ENUM_VALUE_ADDED
- null -> value

### REVIEW

The compatibility depends on consumer expectations or runtime behavior.

Examples can include:

- STATUS_CHANGED
- ARRAY_REORDERED
## Design Decisions

### Why deterministic diff before AI?

A production compatibility system must be predictable.

AI can produce different interpretations for the same input.

The deterministic engine therefore establishes the facts first.

AI operates only as an explanation layer.

### Why server-side API requests?

Calling arbitrary URLs directly from the browser introduces security and browser-policy complications.

The server-side proxy allows centralized:

- validation
- SSRF protection
- DNS resolution checks
- timeout management
- response limits
- header filtering
- rate limiting
- logging

### Why local browser history?

Local storage provides a zero-infrastructure history feature for the current application version.

A database-backed history system can be introduced later without changing the core diff engine.

### Why AI provider abstraction?

AI providers can change.

Keeping provider-specific code behind an abstraction makes it possible to switch or add models without coupling the deterministic engine to a specific vendor.

## Production Considerations

DiffBeacon is designed with production-oriented safeguards, but deployment infrastructure is still responsible for additional concerns such as:

- HTTPS termination
- reverse proxy configuration
- infrastructure-level rate limiting
- monitoring
- centralized logs
- secret management
- backups
- deployment isolation
- operational alerting

The application-level protections described in this README are not a replacement for infrastructure security.

## Limitations

DiffBeacon intentionally does not claim that every API compatibility decision can be determined automatically.

Consumer compatibility can depend on:

- undocumented consumer behavior
- custom client validation
- generated SDK behavior
- business logic
- API gateway rules
- caching behavior
- authentication requirements
- undocumented semantics

The deterministic engine identifies structural and contract-level signals.

Some changes are therefore classified as REVIEW rather than automatically marking them as breaking.

## Roadmap

### V1 — Completed

- JSON response comparison
- recursive deterministic diff
- compatibility classification
- severity classification
- risk scoring
- AI impact analysis

### V1.1 — Completed

- live API proxy
- SSRF protection
- request validation
- OpenAPI contract diff
- JSON Schema diff
- request/response contract directions
- local $ref resolution

### V1.2 — Completed

- analysis history
- shareable results
- JSON export
- Markdown export
- CLI
- CI workflow
- rate limiting
- structured logging
- security hardening
- production payload limits

### V2 — Planned

- provider switching UI
- persistent database-backed history
- user accounts
- team collaboration
- richer API collections
- improved organization and project management

### V3 — Planned

- deeper GitHub integration
- pull-request compatibility checks
- broader CI/CD integrations
- advanced OpenAPI coverage
- multi-model AI consensus
- organization-level policy enforcement
## Contributing

Contributions are welcome.

Before implementing a large change, open an issue to discuss the proposed approach.

Recommended workflow:

1. Fork repository
2. Create feature branch
3. Implement change
4. Add / update tests
5. Run validation
6. Open pull request

Before opening a pull request, run:

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

All checks should pass.

## Security Disclosure

Please do not publicly disclose sensitive security vulnerabilities before they have been responsibly communicated to the maintainer.

Security-related issues involving areas such as:

- SSRF
- credential exposure
- authentication
- authorization
- sensitive data leakage
- remote code execution
- request smuggling
- denial-of-service

should be reported privately whenever possible.

## Repository

https://github.com/Abubakar-webmaker/diffbeacon

## License

DiffBeacon is released under the MIT License. See [LICENSE](LICENSE) for the complete license text.

## Final Status

DiffBeacon currently provides a complete deterministic API diff workflow with optional AI explanation, live API comparison, contract compatibility analysis, security protections, sharing, history, exports, CLI execution, and CI integration.

The fundamental product rule remains:

> Detect with deterministic logic. Explain with AI. Ship with confidence.