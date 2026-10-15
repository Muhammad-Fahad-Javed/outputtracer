"use client";

import { useMemo } from "react";
import { Info, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";

interface LessonContentProps {
  content: string;
}

export default function LessonContent({ content }: LessonContentProps) {
  // Render clean markdown-like structure
  const elements = useMemo(() => {
    const lines = content.split("\n");
    const parsed: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = "";

    lines.forEach((line, index) => {
      // Code blocks
      if (line.trim().startsWith("```")) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeLang = line.trim().slice(3);
          codeBuffer = [];
        } else {
          inCodeBlock = false;
          parsed.push(
            <div
              key={`code-${index}`}
              className="my-5 overflow-hidden rounded-lg border border-[#333333] bg-[#1E1E1E] text-xs font-mono text-[#D4D4D4] shadow-xs"
            >
              {codeLang && (
                <div className="border-b border-[#333333] bg-[#252526] px-3.5 py-1 text-[11px] font-mono text-[#888888] uppercase">
                  {codeLang}
                </div>
              )}
              <pre className="p-4 overflow-x-auto leading-relaxed">
                <code>{codeBuffer.join("\n")}</code>
              </pre>
            </div>
          );
        }
        return;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        return;
      }

      const trimmed = line.trim();

      // Empty line
      if (!trimmed) {
        return;
      }

      // Headings
      if (trimmed.startsWith("### ")) {
        parsed.push(
          <h3
            key={`h3-${index}`}
            className="mt-6 mb-2 text-base font-semibold tracking-tight text-black"
          >
            {trimmed.slice(4)}
          </h3>
        );
        return;
      }

      if (trimmed.startsWith("## ")) {
        parsed.push(
          <h2
            key={`h2-${index}`}
            className="mt-8 mb-3 text-lg font-bold tracking-tight text-black border-b border-[#F0F0F0] pb-1.5"
          >
            {trimmed.slice(3)}
          </h2>
        );
        return;
      }

      if (trimmed.startsWith("# ")) {
        parsed.push(
          <h1
            key={`h1-${index}`}
            className="mt-6 mb-3 text-xl font-bold tracking-tight text-black"
          >
            {trimmed.slice(2)}
          </h1>
        );
        return;
      }

      // Blockquote / Tip / Note
      if (trimmed.startsWith("> ")) {
        const quoteText = trimmed.slice(2);
        parsed.push(
          <div
            key={`quote-${index}`}
            className="my-4 rounded-lg border-l-4 border-[#007ACC] bg-[#F4F9FD] p-3.5 text-xs text-[#222222] leading-relaxed flex items-start gap-2.5"
          >
            <Info size={16} className="text-[#007ACC] shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{quoteText}</span>
            </div>
          </div>
        );
        return;
      }

      // Bullet points
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const itemText = trimmed.slice(2);
        parsed.push(
          <li
            key={`li-${index}`}
            className="ml-4 list-disc text-xs sm:text-sm text-[#444444] leading-relaxed mb-1"
          >
            {formatInlineText(itemText)}
          </li>
        );
        return;
      }

      // Standard paragraph
      parsed.push(
        <p
          key={`p-${index}`}
          className="my-3 text-xs sm:text-sm text-[#333333] leading-relaxed"
        >
          {formatInlineText(trimmed)}
        </p>
      );
    });

    return parsed;
  }, [content]);

  return <div className="prose-clean max-w-none">{elements}</div>;
}

/**
 * Basic inline text formatter for bold, inline code, and emphasis
 */
function formatInlineText(text: string): React.ReactNode {
  // Regex to split by bold (**text**) and inline code (`code`)
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-black">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={i}
          className="rounded-[3px] bg-[#F2F2F2] px-1.5 py-0.5 font-mono text-[12px] text-black border border-[#E0E0E0]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
