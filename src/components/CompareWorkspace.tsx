"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  GitBranch,
  ScanSearch,
  Loader2,
  ShieldAlert,
  CircleX,
  TriangleAlert,
  CircleCheck,
  Sparkles,
  ArrowRight,
  AlertCircle,
  Globe,
  FileJson,
  Clock,
  ArrowRightLeft,
  FileCode2,
  Share2,
  Download,
  History,
  Trash2,
  Check,
  X,
} from "lucide-react";
import JsonEditor from "@/components/editor/JsonEditor";
import RequestConfig from "@/components/live/RequestConfig";
import { useAnimatedScore } from "@/hooks/useAnimatedScore";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useHistory } from "@/hooks/useHistory";
import { exportJson, exportMarkdown, downloadFile } from "@/lib/export/report";
import type { ApiRequestConfig, ApiAnalysisResult } from "@/types/api";
import type { DiffChange, RiskResult } from "@/types/diff";

type Mode = "json" | "live" | "contract";
type Change = { path: string; kind: string; severity: string; reason: string; before?: unknown; after?: unknown };
type Analysis = { summary: string; recommendations: string[] } | null;
type StatusComparison = { changed: true; baseline: number; candidate: number; baselineText: string; candidateText: string; severity: string } | { changed: false };

const sampleContractA = `{
  "openapi": "3.0.3",
  "info": { "title": "User API", "version": "1.0" },
  "paths": {},
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "required": ["id", "name"],
        "properties": {
          "id":     { "type": "integer" },
          "name":   { "type": "string" },
          "status": { "type": "string", "enum": ["active", "disabled"] }
        }
      }
    }
  }
}`;

const sampleContractB = `{
  "openapi": "3.0.3",
  "info": { "title": "User API", "version": "2.0" },
  "paths": {},
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "required": ["id"],
        "properties": {
          "id":     { "type": "string" },
          "status": { "type": "string", "enum": ["active", "disabled", "pending"] }
        }
      }
    }
  }
}`;

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

const defaultRequest = (): ApiRequestConfig => ({
  url: "",
  method: "GET",
  headers: {},
  body: null,
  auth: { type: "none" },
});

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJsonSafely(
  value: string,
  label: "Response A" | "Response B",
): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return {
      ok: false,
      message: `${label} contains invalid JSON. Check the editor for red underlines and use Format to auto-fix indentation.`,
    };
  }
}

function statusClass(status: number): string {
  if (status >= 500) return "text-red-400";
  if (status >= 400) return "text-orange-400";
  if (status >= 300) return "text-amber-400";
  return "text-emerald-400";
}

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
  return <span className="font-mono text-[11px] text-zinc-500">{kind}</span>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CompareWorkspace() {
  // ── Mode ──
  const [mode, setMode] = useState<Mode>("json");

  // ── JSON mode state ──
  const [before, setBefore] = useState(sampleA);
  const [after, setAfter]   = useState(sampleB);

  // ── Contract mode state ──
  const [contractA, setContractA] = useState(sampleContractA);
  const [contractB, setContractB] = useState(sampleContractB);
  const [contractDirection, setContractDirection] = useState<"REQUEST" | "RESPONSE">("RESPONSE");

  // ── Live mode state ──
  const [reqA, setReqA] = useState<ApiRequestConfig>(() => defaultRequest());
  const [reqB, setReqB] = useState<ApiRequestConfig>(() => defaultRequest());
  const [liveResult, setLiveResult] = useState<ApiAnalysisResult | null>(null);
  const [statusComparison, setStatusComparison] = useState<StatusComparison | null>(null);

  // ── Shared result state ──
  const [changes, setChanges] = useState<Change[]>([]);
  const [risk, setRisk]       = useState<{ score: number; label: string } | null>(null);
  const [ai, setAi]           = useState<Analysis>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  // ── Animation state ──
  const reduced                     = useReducedMotion();
  const [entered, setEntered]       = useState(false);
  const [resultsKey, setResultsKey] = useState(0);
  const animatedScore               = useAnimatedScore(risk?.score ?? 0);
  const resultsRef                  = useRef<HTMLElement>(null);

  // ── History / Share / Export state ──
  const { entries: historyEntries, add: addHistory, remove: removeHistory, clear: clearHistory } = useHistory();
  const [showHistory, setShowHistory]   = useState(false);
  const [shareUrl, setShareUrl]         = useState<string | null>(null);
  const [shareCopied, setShareCopied]   = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError]     = useState("");

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const counts = useMemo(() => ({
    breaking: changes.filter((c) => ["CRITICAL", "HIGH"].includes(c.severity)).length,
    warnings: changes.filter((c) => c.severity === "MEDIUM").length,
    safe:     changes.filter((c) => c.severity === "LOW" || c.severity === "SAFE").length,
  }), [changes]);

  // ── JSON analyze ──
  async function analyzeJson() {
    const parsedA = parseJsonSafely(before, "Response A");
    const parsedB = parseJsonSafely(after,  "Response B");
    if (!parsedA.ok) { setError(parsedA.message); return; }
    if (!parsedB.ok) { setError(parsedB.message); return; }

    const res  = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ before: parsedA.value, after: parsedB.value, ai: true }),
    });
    const data = await res.json() as {
      changes: Change[];
      risk: { score: number; label: string };
      ai?: { summary: string; recommendations: string[] } | null;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Analysis failed");
    setChanges(data.changes);
    setRisk(data.risk);
    setAi(data.ai ? { summary: data.ai.summary, recommendations: data.ai.recommendations } : null);
  }

  // ── Live analyze ──
  async function analyzeLive() {
    if (!reqA.url.trim()) { setError("Request A URL is required."); return; }
    if (!reqB.url.trim()) { setError("Request B URL is required."); return; }

    const res  = await fetch("/api/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestA: reqA, requestB: reqB, ai: true }),
    });
    const data = await res.json() as {
      result: ApiAnalysisResult;
      changes: Change[];
      risk: { score: number; label: string };
      ai?: { summary: string; recommendations: string[] } | null;
      error?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    setLiveResult(data.result);
    setChanges(data.changes);
    setRisk(data.risk);
    setAi(data.ai ? { summary: data.ai.summary, recommendations: data.ai.recommendations } : null);

    // Derive status comparison from the result metadata
    const metaA = data.result.responseA.meta;
    const metaB = data.result.responseB.meta;
    if (metaA.status !== metaB.status) {
      setStatusComparison({
        changed: true,
        baseline: metaA.status,
        candidate: metaB.status,
        baselineText: metaA.statusText,
        candidateText: metaB.statusText,
        severity: data.changes.find((c) => c.kind === "STATUS_CHANGED")?.severity ?? "MEDIUM",
      });
    } else {
      setStatusComparison({ changed: false });
    }
  }

  // ── Contract analyze ──
  async function analyzeContract() {
    if (!contractA.trim()) { setError("Baseline contract is required."); return; }
    if (!contractB.trim()) { setError("Candidate contract is required."); return; }

    const res = await fetch("/api/contract/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseline: contractA, candidate: contractB, direction: contractDirection, ai: true }),
    });
    const data = await res.json() as {
      changes: Change[];
      risk: { score: number; label: string };
      ai?: { summary: string; recommendations: string[] } | null;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      const codeMap: Record<string, string> = {
        INVALID_JSON:                "Invalid JSON — check your contract for syntax errors.",
        INVALID_YAML:                "YAML is not supported. Convert your contract to JSON before pasting.",
        INVALID_SCHEMA:              "Invalid contract document. Provide an OpenAPI 3.x or JSON Schema object.",
        UNSUPPORTED_FORMAT:          "Unsupported contract format. Paste an OpenAPI 3.x or JSON Schema document.",
        UNSUPPORTED_OPENAPI_VERSION: "Unsupported OpenAPI version. Only OpenAPI 3.x is supported.",
        MISSING_SCHEMA:              "No schema found in the contract document.",
        EXTERNAL_REF:                "External $ref is not supported. Inline all external references before analyzing.",
        CIRCULAR_REF:                "Circular $ref detected. Remove circular references and try again.",
        INPUT_TOO_LARGE:             "Contract document is too large. Reduce the document size and try again.",
      };
      throw new Error(data.code ? (codeMap[data.code] ?? data.error ?? "Unable to analyze contract.") : (data.error ?? "Unable to analyze contract."));
    }
    setChanges(data.changes);
    setRisk(data.risk);
    setAi(data.ai ? { summary: data.ai.summary, recommendations: data.ai.recommendations } : null);
  }

  // ── Unified analyze ──
  async function analyze() {
    setError("");
    setLoading(true);
    setShareUrl(null);
    setShareError("");
    try {
      if (mode === "json") await analyzeJson();
      else if (mode === "live") await analyzeLive();
      else await analyzeContract();
      setResultsKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Record history after results arrive
  useEffect(() => {
    if (resultsKey > 0 && risk) {
      const breaking = changes.filter((c) => ["CRITICAL", "HIGH"].includes(c.severity)).length;
      addHistory({
        mode,
        riskScore:    risk.score,
        riskLabel:    risk.label,
        changeCount:  changes.length,
        breakingCount: breaking,
        label: mode === "live"
          ? `${reqA.url || "Request A"} vs ${reqB.url || "Request B"}`
          : mode === "contract"
          ? `Contract diff (${contractDirection})`
          : "JSON diff",
      });
    }
  }, [resultsKey]); // intentionally omit deps — runs only when resultsKey increments

  useEffect(() => {
    if (resultsKey > 0) resultsRef.current?.focus({ preventScroll: false });
  }, [resultsKey]);

  // ── Share ──
  async function handleShare() {
    if (!risk) return;
    setShareLoading(true);
    setShareError("");
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, changes: changes as DiffChange[], risk: risk as RiskResult, ai }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Share failed");
      const url = `${window.location.origin}/?share=${data.id}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url).catch(() => undefined);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Share failed");
    } finally {
      setShareLoading(false);
    }
  }

  // ── Export ──
  function handleExportJson() {
    if (!risk) return;
    downloadFile(exportJson({ mode, changes: changes as DiffChange[], risk: risk as RiskResult, ai }), "diffbeacon-report.json", "application/json");
  }
  function handleExportMarkdown() {
    if (!risk) return;
    downloadFile(exportMarkdown({ mode, changes: changes as DiffChange[], risk: risk as RiskResult, ai }), "diffbeacon-report.md", "text/markdown");
  }

  // Reset live result when switching modes
  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setChanges([]);
    setRisk(null);
    setAi(null);
    setLiveResult(null);
    setStatusComparison(null);
    setResultsKey(0);
    setShareUrl(null);
    setShareError("");
  }

  const bodyChanges = changes.filter((c) => c.kind !== "STATUS_CHANGED");
  const hasBodyChanges = bodyChanges.length > 0;
  const hasRisk    = risk !== null;

  // ── Separate status change from body changes for display ──
  const statusChange = changes.find((c) => c.kind === "STATUS_CHANGED") ?? null;

  // ── Contract-specific change metadata helpers ──
  type ContractChange = Change & { compatibility?: string; fieldRequirement?: string; requirementBefore?: string; requirementAfter?: string; enumValue?: unknown; direction?: string; };
  function compatBadge(c: ContractChange): string | null {
    if (!c.compatibility) return null;
    if (c.compatibility === "BREAKING") return "BREAKING";
    if (c.compatibility === "NON_BREAKING") return "SAFE";
    return "REVIEW";
  }
  const COMPAT_TEXT: Record<string, string> = {
    BREAKING: "text-red-400",
    SAFE: "text-emerald-400",
    REVIEW: "text-amber-400",
  };
  const COMPAT_BG: Record<string, string> = {
    BREAKING: "bg-red-950/40 border-red-900/40",
    SAFE: "bg-emerald-950/30 border-emerald-900/30",
    REVIEW: "bg-amber-950/30 border-amber-900/30",
  };

  function rowDelay(i: number): string {
    return `${Math.min(i * 60, 300)}ms`;
  }

  return (
    <>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-white focus:outline-none">
        Skip to main content
      </a>

      <div
        className="min-h-screen"
        style={reduced ? undefined : {
          opacity:   entered ? 1 : 0,
          transform: entered ? "translateY(0)" : "translateY(8px)",
          transition: "opacity 350ms cubic-bezier(0.16,1,0.3,1), transform 350ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* ── Header ── */}
        <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080a0f]/95 backdrop-blur-sm">
          <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-5 md:px-8">
            <Link href="/" className="flex items-center gap-2 transition-opacity duration-150 hover:opacity-80">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect width="20" height="20" rx="5" fill="#4f46e5" />
                <path d="M5 7h6M5 10h8M5 13h5" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span className="text-[13px] font-semibold tracking-tight text-zinc-100">DiffBeacon</span>
            </Link>
            <nav aria-label="Site navigation" className="flex items-center gap-4">
              <a href="https://github.com/Abubakar-webmaker/diffbeacon" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 transition-colors duration-150 hover:text-zinc-300">
                <GitBranch size={14} strokeWidth={1.75} aria-hidden="true" />
                GitHub
              </a>
              <span className="text-[11px] font-medium tracking-[0.15em] text-zinc-600" aria-label="Version 1.2">V1.2</span>
            </nav>
          </div>
        </header>

        <main id="main-content" className="mx-auto max-w-7xl px-5 md:px-8">

          {/* ── Hero ── */}
          <div className="pb-6 pt-10">
            <p className="mb-2 text-[11px] font-medium tracking-[0.2em] text-zinc-600 uppercase" aria-hidden="true">
              API Response Analysis
            </p>
            <h1 className="text-[1.6rem] font-semibold leading-snug tracking-tight text-zinc-100 md:text-[2rem]">
              Detect breaking API changes before production.
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Deterministic diff first. AI explains impact second.
            </p>
          </div>

          {/* ── Mode selector ── */}
          <div className="mb-6 flex items-center gap-1 rounded-lg border border-white/[0.06] bg-zinc-900/60 p-1 w-fit" role="tablist" aria-label="Comparison mode">
            <button
              role="tab"
              aria-selected={mode === "json"}
              onClick={() => switchMode("json")}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
                mode === "json"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileJson size={13} strokeWidth={1.75} aria-hidden="true" />
              JSON
            </button>
            <button
              role="tab"
              aria-selected={mode === "live"}
              onClick={() => switchMode("live")}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
                mode === "live"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Globe size={13} strokeWidth={1.75} aria-hidden="true" />
              Live API
            </button>
            <button
              role="tab"
              aria-selected={mode === "contract"}
              onClick={() => switchMode("contract")}
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-[12px] font-medium transition-colors duration-150 ${
                mode === "contract"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <FileCode2 size={13} strokeWidth={1.75} aria-hidden="true" />
              Contract
            </button>
          </div>

          {/* ── Input area ── */}
          {mode === "json" ? (
            <section aria-label="JSON comparison editors">
              <div className="relative grid gap-3 lg:grid-cols-2">
                <JsonEditor title="Response A" label="Baseline" value={before} onChange={setBefore} path="file:///response-a.json" />
                <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden="true">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/80 bg-[#080a0f] text-[10px] font-semibold text-zinc-600">VS</span>
                </div>
                <JsonEditor title="Response B" label="Candidate" value={after} onChange={setAfter} path="file:///response-b.json" />
              </div>
            </section>
          ) : mode === "live" ? (
            <section aria-label="Live API request configuration">
              <div className="relative grid gap-3 lg:grid-cols-2">
                <RequestConfig label="Request A · Baseline" value={reqA} onChange={setReqA} />
                <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden="true">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/80 bg-[#080a0f] text-[10px] font-semibold text-zinc-600">VS</span>
                </div>
                <RequestConfig label="Request B · Candidate" value={reqB} onChange={setReqB} />
              </div>
              <p className="mt-3 text-[11px] text-zinc-700">
                Requests are executed server-side. Credentials are never logged, stored, or sent to AI providers.
                Only use this with APIs you are authorized to access.
              </p>
            </section>
          ) : (
            <section aria-label="Contract comparison editors">
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[11px] text-zinc-600">Direction:</span>
                <div className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-zinc-900/60 p-0.5" role="group" aria-label="Contract direction">
                  {(["RESPONSE", "REQUEST"] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setContractDirection(d)}
                      className={`rounded px-3 py-1 text-[11px] font-medium transition-colors duration-150 ${
                        contractDirection === d ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-zinc-700">
                  {contractDirection === "RESPONSE"
                    ? "Analyzing server response schemas — optional→required is NON_BREAKING, required→optional is BREAKING."
                    : "Analyzing client request schemas — optional→required is BREAKING, required→optional is NON_BREAKING."}
                </span>
              </div>
              <div className="relative grid gap-3 lg:grid-cols-2">
                <JsonEditor title="Contract A" label="Baseline" value={contractA} onChange={setContractA} path="file:///contract-a.json" />
                <div className="absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 lg:block" aria-hidden="true">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-700/80 bg-[#080a0f] text-[10px] font-semibold text-zinc-600">VS</span>
                </div>
                <JsonEditor title="Contract B" label="Candidate" value={contractB} onChange={setContractB} path="file:///contract-b.json" />
              </div>
              <p className="mt-3 text-[11px] text-zinc-700">
                Paste OpenAPI 3.x or JSON Schema documents. JSON only — convert YAML before pasting.
                Local $ref references are resolved. External URL references are blocked.
              </p>
            </section>
          )}

          {/* ── Action bar ── */}
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/[0.05] pt-4">
            <p className="text-[13px] text-zinc-600">
              {mode === "json" ? "Paste two JSON responses and click Analyze." : mode === "live" ? "Configure both endpoints and click Fetch & Analyze." : "Paste two OpenAPI 3.x or JSON Schema contracts and click Analyze."}
            </p>
            <button
              onClick={analyze}
              disabled={loading}
              aria-busy={loading}
              className="inline-flex min-w-[168px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-[13px] font-semibold text-white transition duration-150 hover:bg-indigo-500 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <><Loader2 size={14} strokeWidth={2} className="animate-spin" aria-hidden="true" />Analyzing…</>
              ) : mode === "json" ? (
                <><ScanSearch size={14} strokeWidth={1.75} aria-hidden="true" />Analyze changes</>
              ) : mode === "live" ? (
                <><ArrowRightLeft size={14} strokeWidth={1.75} aria-hidden="true" />Fetch &amp; Analyze</>
              ) : (
                <><FileCode2 size={14} strokeWidth={1.75} aria-hidden="true" />Analyze contract</>
              )}
            </button>
          </div>

          {/* ── Error ── */}
          {error && (
            <div role="alert" aria-live="assertive" className="mt-4 flex items-start gap-3 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 text-[13px] text-red-400">
              <AlertCircle size={15} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Live metadata ── */}
          {mode === "live" && liveResult && (
            <div className="mt-6 grid gap-3 rounded-xl border border-white/[0.06] p-4 sm:grid-cols-2">
              {(["A", "B"] as const).map((side) => {
                const meta = side === "A" ? liveResult.responseA.meta : liveResult.responseB.meta;
                const req  = side === "A" ? liveResult.requestA    : liveResult.requestB;
                return (
                  <div key={side} className="space-y-1.5">
                    <p className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Response {side}</p>
                    <p className="font-mono text-[11px] text-zinc-500 truncate">{req.method} {req.url}</p>
                    <div className="flex flex-wrap gap-4">
                      <span className={`text-[13px] font-semibold tabular-nums ${statusClass(meta.status)}`}>
                        {meta.status} {meta.statusText}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[12px] text-zinc-500">
                        <Clock size={11} strokeWidth={1.75} aria-hidden="true" />
                        {meta.durationMs} ms
                      </span>
                      {meta.contentType && (
                        <span className="text-[11px] text-zinc-600">{meta.contentType.split(";")[0]}</span>
                      )}
                    </div>
                    {meta.bodyType !== "json" && (
                      <p className="text-[11px] text-amber-600 uppercase tracking-wide">
                        {meta.bodyType === "empty" ? "Empty response" : `${meta.bodyType} response — diff not available`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Results ── */}
          <section
            key={resultsKey}
            ref={resultsRef}
            tabIndex={-1}
            aria-label="Analysis results"
            aria-live="polite"
            className={`mt-10 outline-none ${resultsKey > 0 && !reduced ? "db-enter" : ""}`}
          >
            {/* Risk row */}
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-white/[0.06] pb-6">
              <div>
                <p className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                  <ShieldAlert size={11} strokeWidth={1.75} aria-hidden="true" />
                  Risk Score
                </p>
                <p className="mt-1 leading-none" aria-label={`Risk score: ${risk?.score ?? 0} out of 100`}>
                  <span className={`text-[2.75rem] font-semibold tabular-nums leading-none ${hasRisk ? (RISK_TEXT[risk.label] ?? "text-zinc-300") : "text-zinc-700"}`} aria-hidden="true">
                    {animatedScore}
                  </span>
                  <span className="ml-1 text-base text-zinc-700" aria-hidden="true">/100</span>
                </p>
                {hasRisk ? (
                  <p className={`mt-1 text-xs font-semibold tracking-wide ${RISK_TEXT[risk.label] ?? "text-zinc-500"}`}>{risk.label}</p>
                ) : (
                  <p className="mt-1 text-xs text-zinc-700">—</p>
                )}
              </div>

              <div className="hidden h-12 w-px bg-white/[0.07] sm:block" aria-hidden="true" />

              <div className="flex gap-6">
                {[
                  { icon: <CircleX size={10} strokeWidth={1.75} aria-hidden="true" />, label: "Breaking", val: counts.breaking, color: hasRisk && counts.breaking > 0 ? "text-red-400" : "text-zinc-700" },
                  { icon: <TriangleAlert size={10} strokeWidth={1.75} aria-hidden="true" />, label: "Warnings", val: counts.warnings, color: hasRisk && counts.warnings > 0 ? "text-amber-400" : "text-zinc-700" },
                  { icon: <CircleCheck size={10} strokeWidth={1.75} aria-hidden="true" />, label: "Safe", val: counts.safe, color: hasRisk ? "text-zinc-400" : "text-zinc-700" },
                ].map(({ icon, label, val, color }) => (
                  <div key={label}>
                    <p className="inline-flex items-center gap-1 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">{icon}{label}</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{hasRisk ? val : "—"}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Changes + AI */}
            <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
              <div>
                {/* ── Response Metadata (live mode only) ── */}
                {mode === "live" && liveResult && (statusComparison || hasBodyChanges) && (
                  <div className="mb-6">
                    <p className="mb-3 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Response Metadata</p>
                    <div className="divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
                      {/* Status row */}
                      <div className={`flex items-center gap-3 px-4 py-3 border-l-2 ${
                        statusComparison?.changed
                          ? (SEV_ROW_BORDER[statusComparison.severity] ?? "border-l-zinc-700")
                          : "border-l-zinc-800"
                      }`}>
                        <span className="text-[10px] font-medium tracking-[0.15em] text-zinc-600 uppercase w-20 shrink-0">STATUS</span>
                        {statusComparison?.changed ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`font-mono text-[13px] font-semibold tabular-nums ${statusClass(statusComparison.baseline)}`}>
                              {statusComparison.baseline} {statusComparison.baselineText}
                            </span>
                            <ArrowRight size={12} strokeWidth={1.75} className="text-zinc-600 shrink-0" aria-hidden="true" />
                            <span className={`font-mono text-[13px] font-semibold tabular-nums ${statusClass(statusComparison.candidate)}`}>
                              {statusComparison.candidate} {statusComparison.candidateText}
                            </span>
                            <SeverityPip severity={statusComparison.severity} />
                          </div>
                        ) : (
                          <span className={`font-mono text-[13px] font-semibold tabular-nums ${statusClass(liveResult.responseA.meta.status)}`}>
                            {liveResult.responseA.meta.status} {liveResult.responseA.meta.statusText}
                          </span>
                        )}
                      </div>
                      {/* Response time row */}
                      <div className="flex items-center gap-3 px-4 py-3 border-l-2 border-l-zinc-800">
                        <span className="text-[10px] font-medium tracking-[0.15em] text-zinc-600 uppercase w-20 shrink-0">TIME</span>
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400">
                          <Clock size={11} strokeWidth={1.75} aria-hidden="true" />
                          <span className="tabular-nums">{liveResult.responseA.meta.durationMs}ms</span>
                          <ArrowRight size={12} strokeWidth={1.75} className="text-zinc-600" aria-hidden="true" />
                          <span className="tabular-nums">{liveResult.responseB.meta.durationMs}ms</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                    {mode === "live" ? "Body Changes" : mode === "contract" ? "Contract Changes" : "Detected Changes"}
                  </h2>
                  {hasBodyChanges && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500" aria-label={`${changes.length} changes`}>
                      {changes.length}
                    </span>
                  )}
                </div>

                {loading ? (
                  <div className="space-y-3" aria-hidden="true">
                    {[1, 2, 3].map((n) => <div key={n} className="h-16 animate-pulse rounded-lg bg-zinc-900" />)}
                  </div>
                ) : !hasBodyChanges && !statusChange ? (
                  <div className="rounded-lg border border-dashed border-zinc-800 py-12 text-center">
                    <p className="text-[13px] text-zinc-600">
                      {hasRisk
                        ? mode === "contract"
                          ? "No contract changes detected between the two schemas."
                          : "No body changes detected between the two responses."
                        : "Run an analysis to see detected changes."}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.05]" aria-label="List of detected changes">
                    {bodyChanges.map((change, index) => {
                      const cc = change as ContractChange;
                      const badge = mode === "contract" ? compatBadge(cc) : null;
                      return (
                        <li
                          key={`${change.path}-${index}`}
                          className={`border-l-2 py-4 pl-4 transition-colors duration-150 hover:bg-white/[0.02] ${SEV_ROW_BORDER[change.severity] ?? "border-l-zinc-700"} ${!reduced ? "db-fade-up" : ""}`}
                          style={reduced ? undefined : { animationDelay: rowDelay(index) }}
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <code className="font-mono text-[13px] font-medium text-zinc-100">{change.path}</code>
                            <KindTag kind={change.kind} />
                            <SeverityPip severity={change.severity} />
                            {badge && (
                              <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${COMPAT_TEXT[badge]} ${COMPAT_BG[badge]}`}>
                                {badge}
                              </span>
                            )}
                            {mode === "contract" && cc.fieldRequirement && cc.fieldRequirement !== "UNKNOWN" && (
                              <span className="rounded border border-zinc-700/60 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                                {cc.fieldRequirement}
                              </span>
                            )}
                            {mode === "contract" && cc.requirementBefore && cc.requirementAfter && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600">
                                <span className="text-zinc-500">{cc.requirementBefore}</span>
                                <ArrowRight size={10} strokeWidth={1.75} aria-hidden="true" />
                                <span className="text-zinc-500">{cc.requirementAfter}</span>
                              </span>
                            )}
                            {mode === "contract" && change.kind === "ENUM_VALUE_REMOVED" && cc.enumValue !== undefined && (
                              <code className="rounded bg-red-950/40 px-1.5 py-0.5 font-mono text-[11px] text-red-400">
                                -{String(cc.enumValue)}
                              </code>
                            )}
                            {mode === "contract" && change.kind === "ENUM_VALUE_ADDED" && cc.enumValue !== undefined && (
                              <code className="rounded bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
                                +{String(cc.enumValue)}
                              </code>
                            )}
                          </div>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{change.reason}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h2 className="mb-3 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
                  <Sparkles size={11} strokeWidth={1.75} aria-hidden="true" />
                  AI Impact Review
                </h2>
                {loading ? (
                  <div className="flex items-center gap-2 text-[13px] text-zinc-600" aria-live="polite">
                    <Loader2 size={13} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
                    <span>Analyzing impact…</span>
                  </div>
                ) : ai ? (
                  <div className={!reduced ? "db-fade-up" : ""}>
                    <p className="text-[13px] leading-relaxed text-zinc-300">{ai.summary}</p>
                    <div className="mt-5 border-t border-white/[0.06] pt-5">
                      <p className="mb-3 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Recommended Actions</p>
                      <ul className="space-y-3">
                        {ai.recommendations.map((item) => (
                          <li key={item} className="flex gap-2.5 text-[13px] text-zinc-400">
                            <ArrowRight size={13} strokeWidth={1.75} className="mt-px shrink-0 text-zinc-600" aria-hidden="true" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-zinc-600">
                    {hasRisk
                      ? "No AI key configured. Add GROQ_API_KEY or ANTHROPIC_API_KEY to .env.local to enable impact analysis."
                      : "AI analysis appears after you run the comparison."}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* ── Share / Export toolbar ── */}
          {hasRisk && (
            <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-white/[0.05] pt-5">
              <button
                onClick={handleShare}
                disabled={shareLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200 disabled:opacity-40"
              >
                {shareLoading
                  ? <Loader2 size={12} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
                  : shareCopied
                  ? <Check size={12} strokeWidth={2} className="text-emerald-400" aria-hidden="true" />
                  : <Share2 size={12} strokeWidth={1.75} aria-hidden="true" />}
                {shareCopied ? "Link copied!" : "Share"}
              </button>
              <button
                onClick={handleExportJson}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200"
              >
                <Download size={12} strokeWidth={1.75} aria-hidden="true" />
                Export JSON
              </button>
              <button
                onClick={handleExportMarkdown}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-zinc-900 px-3 py-1.5 text-[12px] font-medium text-zinc-400 transition-colors duration-150 hover:text-zinc-200"
              >
                <Download size={12} strokeWidth={1.75} aria-hidden="true" />
                Export Markdown
              </button>
              {shareError && (
                <span className="text-[12px] text-red-400">{shareError}</span>
              )}
              {shareUrl && !shareCopied && (
                <span className="font-mono text-[11px] text-zinc-500 truncate max-w-xs">{shareUrl}</span>
              )}
            </div>
          )}

          {/* ── History panel ── */}
          <div className="mt-8 border-t border-white/[0.05] pt-5">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-zinc-600 transition-colors duration-150 hover:text-zinc-400"
                aria-expanded={showHistory}
              >
                <History size={13} strokeWidth={1.75} aria-hidden="true" />
                History ({historyEntries.length})
              </button>
              {showHistory && historyEntries.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="inline-flex items-center gap-1 text-[11px] text-zinc-700 transition-colors duration-150 hover:text-red-400"
                >
                  <Trash2 size={11} strokeWidth={1.75} aria-hidden="true" />
                  Clear all
                </button>
              )}
            </div>
            {showHistory && (
              <div className="mt-3">
                {historyEntries.length === 0 ? (
                  <p className="text-[12px] text-zinc-700">No history yet. Run an analysis to record it here.</p>
                ) : (
                  <ul className="divide-y divide-white/[0.04]">
                    {historyEntries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-4 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-zinc-400">{entry.label}</p>
                          <p className="mt-0.5 text-[11px] text-zinc-700">
                            {new Date(entry.timestamp).toLocaleString()} &middot; {entry.mode.toUpperCase()} &middot;
                            <span className={`ml-1 font-medium ${
                              entry.riskLabel === "CRITICAL" ? "text-red-400" :
                              entry.riskLabel === "HIGH" ? "text-orange-400" :
                              entry.riskLabel === "MEDIUM" ? "text-amber-400" :
                              entry.riskLabel === "LOW" ? "text-emerald-400" : "text-zinc-500"
                            }`}>{entry.riskLabel}</span>
                            &nbsp;{entry.riskScore}/100 &middot; {entry.changeCount} changes ({entry.breakingCount} breaking)
                          </p>
                        </div>
                        <button
                          onClick={() => removeHistory(entry.id)}
                          aria-label="Remove history entry"
                          className="shrink-0 text-zinc-700 transition-colors duration-150 hover:text-red-400"
                        >
                          <X size={13} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="h-16" />
        </main>

        <footer aria-label="Site footer" className="border-t border-white/[0.05] px-5 py-5 md:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 text-[12px] text-zinc-700">
            <span>DiffBeacon · MIT License</span>
            <a href="https://github.com/Abubakar-webmaker/diffbeacon" target="_blank" rel="noopener noreferrer"
              className="transition-colors duration-150 hover:text-zinc-500">
              github.com/Abubakar-webmaker/diffbeacon
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}
