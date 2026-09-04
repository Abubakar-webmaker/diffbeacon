"use client";

import { useRef } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";

interface JsonEditorProps {
  title: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  path: string;
}

export default function JsonEditor({ title, label, value, onChange, path }: JsonEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = (ed) => {
    editorRef.current = ed;
  };

  function format() {
    editorRef.current?.getAction("editor.action.formatDocument")?.run();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0d0f14]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-zinc-300">{title}</span>
          <span className="text-[11px] text-zinc-600">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-medium tracking-widest text-zinc-700 uppercase">JSON</span>
          <button
            onClick={format}
            className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-300 focus-visible:outline focus-visible:outline-1 focus-visible:outline-indigo-500"
          >
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
