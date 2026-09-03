# API Diff AI

Detect breaking JSON API response changes before they reach production.

## V1 scope

- JSON Response A vs Response B
- Deterministic nested diff engine
- Added / removed / changed / type-change detection
- Array length and item diffing
- Breaking-change risk scoring
- Optional Claude-powered impact explanation
- Server-side API integration with no browser-exposed AI key
- Next.js + TypeScript + Tailwind

## Architecture

```text
JSON A + JSON B
       ↓
  Deterministic Diff
       ↓
 Risk / Severity Rules
       ↓
   Claude (optional)
       ↓
 Human-readable impact review
```

The deterministic engine is the source of truth. AI explains the detected facts; it does not invent the diff.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

Add `ANTHROPIC_API_KEY` to enable Claude. Without a key, the deterministic diff still works.

## Roadmap

- V1.1: secure live API request proxy, status/headers/response-time comparison
- V1.2: shareable reports and history
- V2: Gemini provider + account/history features
- V3: multi-model consensus, OpenAPI contracts, GitHub/CI checks

## License

MIT
