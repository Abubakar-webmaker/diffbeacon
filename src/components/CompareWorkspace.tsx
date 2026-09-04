"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import JsonEditor from "@/components/editor/JsonEditor";

type Change = { path: string; kind: string; severity: string; reason: string; before?: unknown; after?: unknown };
type Analysis = { summary: string; recommendations: string[] } | null;

const sampleA = `{
  "user": {
    "id": 123,
    "name": "Abubakar",
    "email": "dev@example.com"
  },
  "active": true
}`;

const sampleB = `{
  "user": {
    "id": "123",
    "fullName": "Abubakar",
    "email": "dev@example.com"
  },
  "active": true
}`;

// ─── Design tokens ────────────────────────────────────────────────────────────

const SEV_TEXT: Record<string, string> = {
  CRITICAL: "text-red-400",
  HIGH:     "text-orange-400",
  MEDIUM:   "text-amber-400",
  LOW:      "text-emerald-400",
  SAFE:     "text-zinc-500",
};

const SEV_DOT: Record<string, string> = {
  CRITICAL: "bg-red-500",
  HIGH:     "bg-orange-500",
  MEDIUM:   "bg-amber-500",
  LOW:      "bg-emerald-500",
  SAFE:     "bg-zinc-600",
};

const SEV_ROW_BORDER: Record<string, string> = {
  CRITICAL: "border-l-red-700",
  HIGH:     "border-l-orange-700",
  MEDIUM:   "border-l-amber-700",
  LOW:      "border-l-emerald-800",
  SAFE:     "border-l-zinc-700",
};

const RISK_TEXT: Record<string, string> = {
  CRITICAL:     "text-red-400",
  HIGH:         "text-orange-400",
  MEDIUM:       "text-amber-400",
  LOW:          "text-emerald-400",
  "NO CHANGES": "text-zinc-500",
  READY:        "text-zinc-600",
};

// ─── Small components ─────────────────────────────────────────────────────────

function SeverityPip({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${SEV_TEXT[severity] ?? "text-zinc-500"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[severity] ?? "bg-zinc-600"}`} />
      {severity}
    </span>
  );
}

function KindTag({ kind }: { kind: string }) {
  return (
    <span className="font-mono text-[11px] text-zinc-500">{kind}</span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CompareWorkspace() {
  const [before, setBefore]   = useState(sampleA);
  const [after, setAfter]     = useState(sampleB);
  const [changes, setChanges] = useState<Change[]>([]);
  const [risk, setRisk]       = useState({ score: 0, label: "READY" });
  const [ai, setAi]           = useState<Analysis>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const counts = useMemo(() => ({
    breaking: changes.filter((c) => ["CRITICAL", "HIGH"].includes(c.severity)).length,
    warnings: changes.filter((c) => c.severity === "MEDIUM").length,
    safe:     changes.filter((c) => c.severity === "LOW" || c.severity === "SAFE").length,
  }), [changes]);

  async function analyze() {
    setError("");
    setLoading(true);
    try {
      const payload = { before: JSON.parse(before), after: JSON.parse(after), ai: true };
      const res  = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setChanges(data.changes);
      setRisk(data.risk);
      setAi(data.ai ? { summary: data.ai.summary, recommendations: data.ai.recommendations } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setLoading(false);
    }
  }

  const hasResults = changes.length > 0;

  return (
    <div className="min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080a0f]/95 backdrop-blur-sm">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-5 md:px-8">

          <Link href="/" className="flex items-center gap-2">
            {/* Wordmark mark — simple geometric square, no gradients */}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect width="20" height="20" rx="5" fill="#4f46e5" />
              <path d="M5 7h6M5 10h8M5 13h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[13px] font-semibold tracking-tight text-zinc-100">DiffBeacon</span>
          </Link>

          <nav className="flex items-center gap-4">
            <a
              href="https://github.com/Abubakar-webmaker/diffbeacon"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              GitHub
            </a>
            <span className="text-[11px] font-medium tracking-[0.15em] text-zinc-600">V1</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 md:px-8">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <div className="pb-8 pt-10">
          <p className="mb-2 text-[11px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
            JSON Response Analysis
          </p>
          <h1 className="text-[1.6rem] font-semibold leading-snug tracking-tight text-zinc-100 md:text-[2rem]">
            Detect breaking API changes before production.
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Deterministic diff first. AI explains impact second.
          </p>
        </div>

        {/* ── Editors ────────────────────────────────────────────────────────── */}
        <section aria-label="JSON comparison editors">
          <div className="relative grid gap-3 lg:grid-cols-2">
            <JsonEditor
              title="Response A"
              label="Baseline"
              value={before}
              onChange={setBefore}
              path="file:///response-a.json"
            />

            {/* VS — sits on the gap between editors, desktop only */}
            <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/80 bg-[#080a0f] text-[10px] font-semibold text-zinc-600">
                VS
              </span>
            </div>

            <JsonEditor
              title="Response B"
              label="Candidate"
              value={after}
              onChange={setAfter}
              path="file:///response-b.json"
            />
          </div>
        </section>

        {/* ── Action bar ─────────────────────────────────────────────────────── */}
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/[0.05] pt-4">
          <p className="text-[13px] text-zinc-600">
            Live API requests arrive in V1.1.
          </p>
          <button
            onClick={analyze}
            disabled={loading}
            className="inline-flex min-w-[148px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                Analyzing…
              </>
            ) : (
              "Analyze changes"
            )}
          </button>
        </div>

        {/* ── Error ──────────────────────────────────────────────────────────── */}
        {error && (
          <p className="mt-3 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-2.5 text-[13px] text-red-400">
            {error}
          </p>
        )}

        {/* ── Results ────────────────────────────────────────────────────────── */}
        <section className="mt-10" aria-label="Analysis results">

          {/* Risk row — no card, just a ruled section */}
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-white/[0.06] pb-6">
            {/* Score */}
            <div>
              <p className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Risk Score</p>
              <p className="mt-1 leading-none">
                <span className={`text-[2.75rem] font-semibold tabular-nums leading-none ${RISK_TEXT[risk.label] ?? "text-zinc-300"}`}>
                  {risk.score}
                </span>
                <span className="ml-1 text-base text-zinc-700">/100</span>
              </p>
              <p className={`mt-1 text-xs font-semibold tracking-wide ${RISK_TEXT[risk.label] ?? "text-zinc-500"}`}>
                {risk.label}
              </p>
            </div>

            {/* Divider */}
            <div className="hidden h-12 w-px bg-white/[0.07] sm:block" />

            {/* Counts — inline, not cards */}
            <div className="flex gap-6">
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Breaking</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${counts.breaking > 0 ? "text-red-400" : "text-zinc-500"}`}>
                  {counts.breaking}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Warnings</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${counts.warnings > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                  {counts.warnings}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Safe</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-500">
                  {counts.safe}
                </p>
              </div>
            </div>
          </div>

          {/* Changes + AI — two columns on large screens */}
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">

            {/* ── Detected changes ── */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                  Detected Changes
                </h2>
                {hasResults && (
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                    {changes.length}
                  </span>
                )}
              </div>

              {!hasResults ? (
                <div className="rounded-lg border border-dashed border-zinc-800 py-12 text-center">
                  <p className="text-[13px] text-zinc-600">Run an analysis to see detected changes.</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {changes.map((change, index) => (
                    <li
                      key={`${change.path}-${index}`}
                      className={`border-l-2 py-4 pl-4 transition-colors hover:bg-white/[0.02] ${SEV_ROW_BORDER[change.severity] ?? "border-l-zinc-700"}`}
                    >
                      {/* Top row: path + kind + severity */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <code className="font-mono text-[13px] font-medium text-zinc-100">
                          {change.path}
                        </code>
                        <KindTag kind={change.kind} />
                        <SeverityPip severity={change.severity} />
                      </div>
                      {/* Description */}
                      <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
                        {change.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── AI Impact ── */}
            <div>
              <h2 className="mb-3 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                AI Impact Review
              </h2>

              {ai ? (
                <div>
                  <p className="text-[13px] leading-relaxed text-zinc-300">{ai.summary}</p>

                  <div className="mt-5 border-t border-white/[0.06] pt-5">
                    <p className="mb-3 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                      Recommended Actions
                    </p>
                    <ul className="space-y-3">
                      {ai.recommendations.map((item) => (
                        <li key={item} className="flex gap-2.5 text-[13px] text-zinc-400">
                          <span className="mt-px shrink-0 text-zinc-600">→</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-[13px] text-zinc-600">
                  AI analysis appears after you run the comparison.
                </p>
              )}
            </div>

          </div>
        </section>

        {/* bottom breathing room */}
        <div className="h-16" />
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.05] px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-[12px] text-zinc-700">
          <span>DiffBeacon · MIT License</span>
          <a
            href="https://github.com/Abubakar-webmaker/diffbeacon"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-500"
          >
            github.com/Abubakar-webmaker/diffbeacon
          </a>
        </div>
      </footer>

    </div>
  );
}
