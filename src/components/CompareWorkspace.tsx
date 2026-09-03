"use client";

import { useMemo, useState } from "react";

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

export default function CompareWorkspace() {
  const [before, setBefore] = useState(sampleA);
  const [after, setAfter] = useState(sampleB);
  const [changes, setChanges] = useState<Change[]>([]);
  const [risk, setRisk] = useState({ score: 0, label: "READY" });
  const [ai, setAi] = useState<Analysis>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const counts = useMemo(() => ({
    breaking: changes.filter((c) => ["CRITICAL", "HIGH"].includes(c.severity)).length,
    warnings: changes.filter((c) => c.severity === "MEDIUM").length,
    safe: changes.filter((c) => c.severity === "LOW" || c.severity === "SAFE").length,
  }), [changes]);

  async function analyze() {
    setError("");
    setLoading(true);
    try {
      const payload = { before: JSON.parse(before), after: JSON.parse(after), ai: true };
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Analysis failed");
      setChanges(data.changes);
      setRisk(data.risk);
      setAi(data.ai ? { summary: data.ai.summary, recommendations: data.ai.recommendations } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 py-8 md:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold tracking-[0.28em] text-zinc-500">API DIFF AI</div>
            <h1 className="mt-2 max-w-4xl text-3xl font-semibold tracking-tight md:text-5xl">Detect breaking API changes before production.</h1>
            <p className="mt-3 max-w-2xl text-zinc-400">Deterministic diff first. AI explains impact second.</p>
          </div>
          <div className="rounded-full border border-zinc-800 px-4 py-2 text-xs text-zinc-400">V1 · JSON RESPONSE ANALYSIS</div>
        </header>

        <section className="grid gap-4 lg:grid-cols-2">
          <Editor title="Response A · Baseline" value={before} onChange={setBefore} />
          <Editor title="Response B · Candidate" value={after} onChange={setAfter} />
        </section>

        <div className="my-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-500">Start with JSON. Live API requests arrive in V1.1.</div>
          <button onClick={analyze} disabled={loading} className="rounded-xl bg-white px-5 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? "Analyzing…" : "Analyze changes"}
          </button>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">{error}</div>}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5 md:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] text-zinc-500">RISK SCORE</div>
              <div className="mt-1 text-5xl font-semibold">{risk.score}<span className="text-base text-zinc-500">/100</span></div>
              <div className="mt-1 text-sm text-zinc-400">{risk.label}</div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge text={`${counts.breaking} breaking`} tone="red" />
              <Badge text={`${counts.warnings} warnings`} tone="yellow" />
              <Badge text={`${counts.safe} safe`} tone="green" />
            </div>
          </div>

          <div className="mt-7 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-3">
              {changes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-500">Run an analysis to see structured changes.</div>
              ) : changes.map((change, index) => (
                <div key={`${change.path}-${index}`} className="rounded-xl border border-zinc-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <code className="text-sm text-zinc-200">{change.path}</code>
                    <span className="text-[11px] font-medium tracking-wide text-zinc-500">{change.kind} · {change.severity}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{change.reason}</p>
                </div>
              ))}
            </div>

            <aside className="rounded-xl border border-zinc-800 bg-black/20 p-5">
              <div className="text-xs font-semibold tracking-[0.2em] text-zinc-500">AI IMPACT REVIEW</div>
              {ai ? (
                <>
                  <p className="mt-3 text-sm leading-6 text-zinc-300">{ai.summary}</p>
                  <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recommended actions</div>
                  <ul className="mt-2 space-y-2 text-sm text-zinc-400">
                    {ai.recommendations.map((item) => <li key={item}>→ {item}</li>)}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-sm text-zinc-500">AI analysis appears after you run the comparison.</p>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function Editor({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 text-sm text-zinc-300">
        <span>{title}</span><span className="text-xs text-zinc-600">JSON</span>
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} className="h-80 w-full resize-none bg-transparent p-4 font-mono text-sm leading-6 text-zinc-200 outline-none" />
    </div>
  );
}

function Badge({ text, tone }: { text: string; tone: "red" | "yellow" | "green" }) {
  const classes = { red: "border-red-900/60 bg-red-950/40 text-red-300", yellow: "border-yellow-900/60 bg-yellow-950/40 text-yellow-300", green: "border-emerald-900/60 bg-emerald-950/40 text-emerald-300" }[tone];
  return <span className={`rounded-full border px-3 py-1.5 ${classes}`}>{text}</span>;
}
