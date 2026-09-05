"use client";

import { useState } from "react";
import { Plus, Trash2, Lock } from "lucide-react";
import type { ApiRequestConfig, AuthConfig, HttpMethod } from "@/types/api";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
const BODY_METHODS = new Set<HttpMethod>(["POST", "PUT", "PATCH"]);

const METHOD_COLOR: Record<HttpMethod, string> = {
  GET:     "text-emerald-400",
  POST:    "text-indigo-400",
  PUT:     "text-amber-400",
  PATCH:   "text-amber-400",
  DELETE:  "text-red-400",
  HEAD:    "text-zinc-400",
  OPTIONS: "text-zinc-400",
};

interface Props {
  label: string;
  value: ApiRequestConfig;
  onChange: (v: ApiRequestConfig) => void;
}

export default function RequestConfig({ label, value, onChange }: Props) {
  const [showAuth, setShowAuth] = useState(value.auth.type !== "none");

  function set<K extends keyof ApiRequestConfig>(key: K, val: ApiRequestConfig[K]) {
    onChange({ ...value, [key]: val });
  }

  function setHeader(index: number, field: "name" | "value", text: string) {
    const entries = Object.entries(value.headers);
    if (field === "name") {
      const newEntries = entries.map(([k, v], i) => (i === index ? [text, v] : [k, v]));
      onChange({ ...value, headers: Object.fromEntries(newEntries) });
    } else {
      const newEntries = entries.map(([k, v], i) => (i === index ? [k, text] : [k, v]));
      onChange({ ...value, headers: Object.fromEntries(newEntries) });
    }
  }

  function addHeader() {
    onChange({ ...value, headers: { ...value.headers, "": "" } });
  }

  function removeHeader(index: number) {
    const entries = Object.entries(value.headers).filter((_, i) => i !== index);
    onChange({ ...value, headers: Object.fromEntries(entries) });
  }

  function setAuth(auth: AuthConfig) {
    onChange({ ...value, auth });
  }

  const headerEntries = Object.entries(value.headers);
  const showBody = BODY_METHODS.has(value.method);

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0f14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-zinc-300">{label}</span>
        </div>
        <span className="text-[10px] font-medium tracking-widest text-zinc-700 uppercase">Live API</span>
      </div>

      <div className="space-y-4 p-4">
        {/* URL + Method */}
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={value.method}
              onChange={(e) => set("method", e.target.value as HttpMethod)}
              className={`h-9 appearance-none rounded-lg border border-zinc-800 bg-zinc-900 pl-3 pr-7 text-[12px] font-semibold focus:border-zinc-600 focus:outline-none ${METHOD_COLOR[value.method]}`}
            >
              {METHODS.map((m) => (
                <option key={m} value={m} className="text-zinc-200">{m}</option>
              ))}
            </select>
          </div>
          <input
            type="url"
            value={value.url}
            onChange={(e) => set("url", e.target.value)}
            placeholder="https://api.example.com/v1/users"
            spellCheck={false}
            className="h-9 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 font-mono text-[12px] text-zinc-200 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
          />
        </div>

        {/* Headers */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">Headers</span>
            <button
              onClick={addHeader}
              className="inline-flex items-center gap-1 text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
            >
              <Plus size={11} strokeWidth={1.75} aria-hidden="true" />
              Add
            </button>
          </div>
          {headerEntries.length === 0 ? (
            <p className="text-[11px] text-zinc-700">No headers. Click Add to include one.</p>
          ) : (
            <div className="space-y-1.5">
              {headerEntries.map(([name, val], i) => (
                <div key={i} className="flex gap-1.5">
                  <input
                    value={name}
                    onChange={(e) => setHeader(i, "name", e.target.value)}
                    placeholder="Header-Name"
                    spellCheck={false}
                    className="h-8 w-2/5 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-300 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                  />
                  <input
                    value={val}
                    onChange={(e) => setHeader(i, "value", e.target.value)}
                    placeholder="value"
                    spellCheck={false}
                    className="h-8 flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-300 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                  />
                  <button
                    onClick={() => removeHeader(i)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-zinc-800 text-zinc-700 transition-colors hover:border-zinc-600 hover:text-red-400"
                    aria-label="Remove header"
                  >
                    <Trash2 size={11} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Auth */}
        <div>
          <button
            onClick={() => setShowAuth((s) => !s)}
            className="inline-flex items-center gap-1.5 text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase transition-colors hover:text-zinc-400"
          >
            <Lock size={10} strokeWidth={1.75} aria-hidden="true" />
            Authentication
            <span className="ml-1 text-zinc-700">{showAuth ? "▲" : "▼"}</span>
          </button>

          {showAuth && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setAuth({ type: "none" })}
                  className={`rounded border px-3 py-1 text-[11px] transition-colors ${
                    value.auth.type === "none"
                      ? "border-zinc-600 text-zinc-300"
                      : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                  }`}
                >
                  None
                </button>
                <button
                  onClick={() => setAuth({ type: "bearer", token: value.auth.type === "bearer" ? value.auth.token : "" })}
                  className={`rounded border px-3 py-1 text-[11px] transition-colors ${
                    value.auth.type === "bearer"
                      ? "border-zinc-600 text-zinc-300"
                      : "border-zinc-800 text-zinc-600 hover:border-zinc-700"
                  }`}
                >
                  Bearer Token
                </button>
              </div>

              {value.auth.type === "bearer" && (
                <div>
                  <p className="mb-1 text-[10px] text-zinc-700">
                    Token is sent server-side only and never stored or logged.
                  </p>
                  <input
                    type="password"
                    value={value.auth.token}
                    onChange={(e) => setAuth({ type: "bearer", token: e.target.value })}
                    placeholder="eyJhbGciOiJIUzI1NiIs…"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-8 w-full rounded border border-zinc-800 bg-zinc-900 px-2 font-mono text-[11px] text-zinc-300 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        {showBody && (
          <div>
            <span className="mb-2 block text-[10px] font-medium tracking-[0.2em] text-zinc-600 uppercase">
              Request Body
            </span>
            <textarea
              value={value.body ?? ""}
              onChange={(e) => set("body", e.target.value || null)}
              placeholder='{"key": "value"}'
              spellCheck={false}
              rows={4}
              className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-[12px] leading-relaxed text-zinc-300 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
