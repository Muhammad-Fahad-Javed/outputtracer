"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { Awareness } from "y-protocols/awareness";
import type { CollabPeer } from "./useProjectCollab";
import { colorForUser } from "./useProjectCollab";
import { authorshipOfText } from "@/lib/classroom/authorship";

interface CollabEditorProps {
  doc: Y.Doc;
  awareness: Awareness;
  filename: string;
  readOnly: boolean;
  peers: CollabPeer[];
  onRunShortcut: () => void;
  onEditor?: (editor: Parameters<OnMount>[0]) => void;
  /** Color the characters each student typed. Used on the teacher watch view. */
  showAuthorship?: boolean;
  language?: "cpp" | "python" | "asm";
}

export default function CollabEditor({
  doc,
  awareness,
  filename,
  readOnly,
  peers,
  onRunShortcut,
  onEditor,
  showAuthorship = false,
  language = "cpp",
}: CollabEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const runRef = useRef(onRunShortcut);
  const [mounted, setMounted] = useState(false);
  const [authorCss, setAuthorCss] = useState("");
  useEffect(() => {
    runRef.current = onRunShortcut;
  });

  const handleMount: OnMount = (editor, monaco) => {
    if (language === "asm") {
      if (!monaco.languages.getLanguages().some((l: { id: string }) => l.id === "nasm")) monaco.languages.register({ id: "nasm" });
      monaco.languages.setMonarchTokensProvider("nasm", {
        ignoreCase: true,
        tokenizer: { root: [
          [/;.*$/, "comment"], [/"[^"\n]*"|'[^'\n]*'/, "string"],
          [/\b(?:mov|xchg|lea|add|adc|sub|sbb|inc|dec|neg|cmp|and|or|xor|test|not|jmp|j[a-z]+|loop[a-z]*|call|ret|push|pop|pushf|popf|nop|hlt|int|clc|stc|cli|sti|cld|std|mul|imul|div|idiv|shl|shr|rol|ror)\b/, "keyword"],
          [/\b(?:ax|ah|al|bx|bh|bl|cx|ch|cl|dx|dh|dl|sp|bp|si|di|ip|cs|ds|es|ss)\b/, "variable.predefined"],
          [/\b(?:org|bits|section|global|equ|db|dw|dd|resb|resw|cpu)\b/, "type"],
          [/\b(?:0x[0-9a-f]+|[0-9][0-9a-f]*h|[0-9]+)\b/, "number"],
        ] },
      });
      const model = editor.getModel();
      if (model) monaco.editor.setModelLanguage(model, "nasm");
    }
    editorRef.current = editor;
    monacoRef.current = monaco;
    onEditor?.(editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      runRef.current();
    });
    setMounted(true);
  };

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly, mounted]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !mounted) return;
    const shared = doc.getMap("files").get(filename);
    const model = editor.getModel();
    if (!(shared instanceof Y.Text) || !model) return;

    bindingRef.current?.destroy();
    bindingRef.current = new MonacoBinding(shared, model, new Set([editor]), awareness);
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [awareness, doc, filename, mounted]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!showAuthorship || !editor || !monaco || !mounted) return;
    const model = editor.getModel();
    const shared = doc.getMap("files").get(filename);
    if (!(shared instanceof Y.Text) || !model) return;

    const decorations = editor.createDecorationsCollection([]);
    const paint = () => {
      const current = doc.getMap("files").get(filename);
      const currentModel = editor.getModel();
      if (!(current instanceof Y.Text) || !currentModel) {
        decorations.clear();
        setAuthorCss("");
        return;
      }
      const { spans } = authorshipOfText(current);
      const colors = new Map<string, string>();
      decorations.set(
        spans.map((span) => {
          const start = currentModel.getPositionAt(Math.min(span.start, currentModel.getValueLength()));
          const end = currentModel.getPositionAt(Math.min(span.end, currentModel.getValueLength()));
          const color = colorForUser(span.authorId);
          colors.set(span.authorId, color);
          return {
            range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
            options: {
              inlineClassName: `ot-author-${safeClass(span.authorId)}`,
              overviewRuler: { color, position: monaco.editor.OverviewRulerLane.Left },
            },
          };
        })
      );
      setAuthorCss(
        [...colors.entries()]
          .map(([authorId, color]) => `.ot-author-${safeClass(authorId)}{background-color:${color}2e;box-shadow:inset 0 -2px 0 ${color}}`)
          .join("\n")
      );
    };
    paint();
    const files = doc.getMap("files");
    files.observeDeep(paint);
    return () => {
      files.unobserveDeep(paint);
      decorations.clear();
    };
  }, [doc, filename, mounted, showAuthorship]);

  const cursorCss = peers
    .map((peer) => {
      const name = peer.name.replace(/["\\<>]/g, "");
      return `.yRemoteSelection-${peer.clientId}{background-color:${peer.color}33}
.yRemoteSelectionHead-${peer.clientId}{border-color:${peer.color}}
.yRemoteSelectionHead-${peer.clientId}::after{content:"${name}";background:${peer.color}}`;
    })
    .join("\n");

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#1E1E1E]">
      <style>{`
        .yRemoteSelection { background-color: rgba(97, 175, 239, 0.2); }
        .yRemoteSelectionHead {
          position: absolute;
          border-left: 2px solid #61AFEF;
          height: 100%;
          box-sizing: border-box;
        }
        .yRemoteSelectionHead::after {
          position: absolute;
          top: -1.15em;
          left: -2px;
          padding: 0 4px;
          color: white;
          font-size: 10px;
          line-height: 1.2;
          white-space: nowrap;
          pointer-events: none;
        }
        ${cursorCss}
        ${authorCss}
        ${showAuthorship ? ".yRemoteSelectionHead::after{content:none !important;display:none !important}" : ""}
      `}</style>
      <div className={`min-h-0 flex-1 ${showAuthorship ? "ot-authorship" : ""}`}>
        <Editor
          height="100%"
          language={language === "asm" ? "nasm" : language}
          theme="vs-dark"
          onMount={handleMount}
          options={{
            readOnly,
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
    </div>
  );
}

function safeClass(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return cleaned || "student";
}
