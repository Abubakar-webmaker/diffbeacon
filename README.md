# DiffBeacon

**Detect breaking API changes before production.**

DiffBeacon compares two JSON API responses using a deterministic diff engine, identifies potentially breaking changes, calculates a risk score, and optionally uses AI to explain the production impact in plain language.

---

## Why DiffBeacon?

Traditional diff tools show **what** changed.  
DiffBeacon aims to explain **whether** the change can break consumers and **why**.

A field being renamed, a type silently changing from `number` to `string`, or a property disappearing entirely — these are the changes that cause production incidents. DiffBeacon classifies each change by severity and surfaces the ones that matter.

---

## How it works

```
JSON Response A  +  JSON Response B
              ↓
   Deterministic Diff Engine
              ↓
     Change Classification
     (ADDED / REMOVED / CHANGED / TYPE_CHANGED / ARRAY_LENGTH_CHANGED)
              ↓
        Risk Analysis
        (score 0–100, label LOW / MEDIUM / HIGH / CRITICAL)
              ↓
     AI Impact Explanation
     (optional — Groq or Claude)
```

The deterministic engine is the source of truth. AI explains the detected facts; it does not invent the diff.

---

## Features

- JSON response comparison (paste two responses, click Analyze)
- Detects added, removed, and changed fields
- Type-change detection (`number` → `string`, `object` → `array`, etc.)
- Fully recursive — handles arbitrarily nested JSON
- Array length and item-level change detection
- Breaking-change classification with severity levels
- Risk scoring (0–100) with a human-readable label
- AI impact analysis via Groq (development) or Claude (production)
- Server-side AI calls — no API keys exposed to the browser
- Works without any AI key — deterministic diff always runs

---

## Example

**Response A**
```json
{
  "user": {
    "id": 123,
    "name": "Abubakar"
  }
}
```

**Response B**
```json
{
  "user": {
    "id": "123"
  }
}
```

DiffBeacon detects:

| Path | Change | Severity |
|---|---|---|
| `$.user.id` | TYPE_CHANGED (`number` → `string`) | HIGH |
| `$.user.name` | REMOVED | CRITICAL |

Risk score: **90 / 100 — CRITICAL**

The AI layer then explains what these changes mean for downstream consumers and what to do before shipping.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Validation | Zod |
| Testing | Vitest |
| AI — development | Groq (`llama-3.3-70b-versatile`) |
| AI — production | Anthropic Claude (`claude-sonnet-4`) |
| Runtime | Node.js ≥ 20.9 |

---

## Local setup

```bash
git clone https://github.com/Abubakar-webmaker/diffbeacon.git
cd diffbeacon
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The deterministic diff works immediately with no configuration. Add an AI key to `.env.local` to enable impact explanations.

---

## Environment variables

```bash
# Groq — development / free tier
# If set, Groq takes priority over Claude
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile

# Anthropic Claude — production provider
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Copy `.env.example` to `.env.local` and fill in your keys locally.

> **Never commit real API keys.**  
> `.env.local` is listed in `.gitignore`.  
> `.env.example` contains placeholders only and is safe to commit.

AI provider selection is automatic: if `GROQ_API_KEY` is set it is used first; otherwise `ANTHROPIC_API_KEY` is tried. If neither is set, the deterministic diff result is returned with a fallback message.

---

## Testing

```bash
npm run test       # 40 automated diff-engine unit tests
npm run typecheck  # TypeScript strict check
npm run lint       # ESLint (flat config, ESLint 9)
```

The test suite covers the full deterministic diff engine: identical inputs, added/removed/changed/type-changed fields, nested objects, arrays, null handling, mixed changes, risk score boundaries, edge cases, and deterministic output verification.

---

## Severity reference

| Severity | Meaning |
|---|---|
| CRITICAL | A property was removed — existing consumers will likely break |
| HIGH | A type changed — downstream parsing or validation may break |
| MEDIUM | A value changed — business logic may need review |
| LOW | A property was added or an array length changed |

Risk score is the maximum severity weight across all detected changes, capped at 100.

---

## Roadmap

| Version | Scope |
|---|---|
| **V1** ✅ | JSON response comparison, deterministic diff, risk scoring, AI impact analysis |
| V1.1 | Secure live API request proxy — compare real endpoints directly, with SSRF protection |
| V1.2 | Shareable reports and comparison history |
| V2 | Provider switching UI, account features, persistent history |
| V3 | OpenAPI contract validation, GitHub / CI integration, multi-model consensus |

---

## Security

- API keys are read server-side only and never sent to the browser.
- `.env.local` must never be committed to version control.
- V1.1 live API proxying will require SSRF protection before it ships — arbitrary URLs will not be forwarded without validation.
- If you discover a security issue, please open a private GitHub issue or contact the maintainer directly before disclosing publicly.

---

## Contributing

Contributions are welcome. Please open an issue before submitting a pull request for non-trivial changes, so the approach can be agreed on first.

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests where applicable
4. Run `npm run test`, `npm run typecheck`, and `npm run lint` — all must pass
5. Open a pull request

---

## License

[MIT](./LICENSE)
