"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Play, Square } from "lucide-react";

export function DebuggerControls({
  running,
  onStart,
  onStop,
}: {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        onClick={onStart}
        title="Start debugging (F5)"
        className="inline-flex items-center gap-1.5 rounded-[2px] px-2 py-0.5 text-[12px] text-[#F1F1F1] hover:bg-[#3E3E42]"
      >
        <Play size={13} className="fill-[#689F38] text-[#689F38]" />
        <span>Local Windows Debugger</span>
      </button>
      <button
        type="button"
        onClick={onStop}
        disabled={!running}
        title="Stop debugging (Shift+F5)"
        aria-label="Stop debugging"
        className="inline-flex items-center rounded-[2px] px-1.5 py-0.5 hover:bg-[#3E3E42] disabled:hover:bg-transparent"
      >
        <Square
          size={12}
          className={running ? "fill-[#F14C4C] text-[#F14C4C]" : "fill-[#5A5A5A] text-[#5A5A5A]"}
        />
      </button>
    </div>
  );
}

export function useDebuggerKeys(onStart: () => void, onStop: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "F5") return;
      event.preventDefault();
      if (event.shiftKey) onStop();
      else onStart();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onStart, onStop]);
}

export function IdeMenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="rounded-[2px] px-2 py-0.5 text-[12px] hover:bg-[#3E3E42]"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 min-w-44 border border-[#454545] bg-[#252526] py-1"
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function IdeMenuItem({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-[12px] text-[#F1F1F1] hover:bg-[#094771]"
    >
      {children}
    </button>
  );
}

export function OutputTabs({
  value,
  onChange,
  extra,
}: {
  value: "debug" | "trace";
  onChange: (value: "debug" | "trace") => void;
  extra?: ReactNode;
}) {
  const tabs = [
    { id: "debug" as const, label: "Debug" },
    { id: "trace" as const, label: "Trace" },
  ];
  return (
    <div className="flex h-7 shrink-0 items-center justify-between border-b border-[#333333] bg-[#2D2D30]">
      <div className="flex h-full items-end">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`h-full px-3 text-[12px] ${
              value === tab.id
                ? "border-t-2 border-[#007ACC] bg-[#1E1E1E] text-[#F1F1F1]"
                : "text-[#969696] hover:text-[#F1F1F1]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex items-center pr-2">{extra}</div>
    </div>
  );
}

export function debugStatusLabel(status: string): string {
  if (status === "compiling" || status === "connecting") return "Building…";
  if (status === "running") return "Debugging";
  if (status === "error") return "Build failed";
  return "Ready";
}
