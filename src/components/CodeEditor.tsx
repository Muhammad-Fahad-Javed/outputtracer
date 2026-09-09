"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onRunShortcut: () => void;
}

export default function CodeEditor({ value, onChange, onRunShortcut }: CodeEditorProps) {
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const safeValue = value || "";
  const lineCount = safeValue.length === 0 ? 1 : safeValue.split("\n").length;

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRunShortcut();
    });

    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, column: e.position.column });
    });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1E1E1E]">
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
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

      {/* Subtle editor status bar */}
      <div className="flex h-6 shrink-0 items-center justify-end bg-[#1E1E1E] px-4 font-mono text-[10px] text-[#858585]">
        <div className="flex items-center gap-3">
          <span>{lineCount} {lineCount === 1 ? "line" : "lines"}</span>
          <span className="text-[#333333]">|</span>
          <span>
            Ln {cursor.line}, Col {cursor.column}
          </span>
        </div>
      </div>
    </div>
  );
}
