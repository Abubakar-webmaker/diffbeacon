"use client";

import { useRef, useState } from "react";
import MonacoEditor, { type OnMount, type OnValidate } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Braces, AlertCircle } from "lucide-react";

interface JsonEditorProps {
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  path: string;
}

export default function JsonEditor({ title, label, value, onChange, path }: JsonEditorProps) {
  const editorRef                   = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [hasError, setHasError]     = useState(false);

  const handleMount: OnMount = (ed) => {
    editorRef.current = ed;
  };

  // Monaco calls onValidate after it finishes linting the JSON model.
  // markers.length > 0 means there are syntax errors.
  const handleValidate: OnValidate = (markers) => {
    setHasError(markers.length > 0);
  };

  function format() {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-[#0d0f14] transition-colors duration-200 ${
        hasError ? "border-red-900/60" : "border-white/[0.08]"
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-zinc-300">{title}</span>
          <span className="text-[11px] text-zinc-600">{label}</span>
          {/* Per-editor invalid JSON indicator */}
          {hasError && (
            <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle size={11} strokeWidth={1.75} aria-hidden="true" />
              Invalid JSON
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium tracking-widest text-zinc-700 uppercase">JSON</span>
          <button
            onClick={format}
            className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 transition duration-150 hover:border-zinc-600 hover:text-zinc-300 active:scale-95 focus-visible:outline focus-visible:outline-1 focus-visible:outline-indigo-500"
          >
            <Braces size={11} strokeWidth={1.75} aria-hidden="true" />
            Format
          </button>
        </div>
      </div>

      {/* Monaco */}
      <MonacoEditor
        height="300px"
        language="json"
        theme="vs-dark"
        value={value}
        path={path}
        onChange={(val) => onChange(val ?? "")}
        onMount={handleMount}
        onValidate={handleValidate}
        loading={
          <div className="flex h-[300px] items-center justify-center text-[13px] text-zinc-700">
            Loading editor…
          </div>
        }
        options={{
          fontSize: 13,
          lineHeight: 21,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
          padding: { top: 12, bottom: 12 },
          formatOnPaste: true,
          formatOnType: false,
          fixedOverflowWidgets: true,
          lineNumbersMinChars: 3,
          folding: false,
          glyphMargin: false,
        }}
      />
    </div>
  );
}
