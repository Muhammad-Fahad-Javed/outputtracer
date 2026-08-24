"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { Maximize2, Minimize2 } from "lucide-react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRunShortcut: () => void;
}

export default function CodeEditor({ value, onChange, onRunShortcut }: CodeEditorProps) {
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const safeValue = value || "";
  const lineCount = safeValue.length === 0 ? 1 : safeValue.split("\n").length;

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  useEffect(() => {
    // Re-layout Monaco after toggling fullscreen since its container resizes.
    const id = requestAnimationFrame(() => editorRef.current?.layout());
    return () => cancelAnimationFrame(id);
  }, [isFullscreen]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunShortcut();
    });

    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, column: e.position.column });
    });
  };

  const editorHeight = isFullscreen ? "calc(100vh - 40px)" : "380px";

  const editor = (
    <div
      className={
        isFullscreen
          ? "flex h-screen w-screen flex-col"
          : "overflow-hidden bg-[#111111]"
      }
    >
      <div
        className={
          isFullscreen
            ? "overflow-hidden bg-[#111111]"
            : "overflow-hidden"
        }
      >
        <Editor
          height={editorHeight}
          defaultLanguage="cpp"
          theme="vs-dark"
          value={value}
          onChange={(v) => onChange(v ?? "")}
          onMount={handleMount}
          options={{
            fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace",
            fontSize: 14,
            lineNumbers: "on",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            tabSize: 4,
            automaticLayout: true,
            renderLineHighlight: "none",
            overviewRulerBorder: false,
            scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          }}
        />
      </div>

      {/* Status bar */}
      <div className="flex h-10 shrink-0 items-center justify-between border-t border-[#2a2a2a] bg-[#111111] px-3 font-mono text-[11px] text-[#9a9a9a]">
        <div className="flex items-center gap-3">
          <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          <span className="text-[#4a4a4a]">|</span>
          <span>
            Ln {cursor.line}, Col {cursor.column}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="inline-flex items-center gap-1.5 rounded-[3px] px-2 py-1 text-[#9a9a9a] transition-colors hover:bg-white/10 hover:text-white"
        >
          {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        </button>
      </div>
    </div>
  );

  if (!isFullscreen) return editor;

  return (
    <div className="fixed inset-0 z-[60] bg-[#111111]" role="dialog" aria-modal="true">
      {editor}
    </div>
  );
}
