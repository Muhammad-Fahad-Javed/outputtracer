"use client";

import { useState } from "react";
import { saveAs } from "file-saver";
import {
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  Clock,
} from "lucide-react";
import { AsmExecutionStatus, AsmDiagnostic } from "@/lib/asm/types";
import { WorkspaceTabId } from "@/lib/workspaceConfig";

interface DosboxWorkspaceProps {
  status: AsmExecutionStatus;
  diagnostics: AsmDiagnostic[];
  engineUsed: string;
  executionTimeMs: number | null;
  activeTab?: WorkspaceTabId;
  onTabChange?: (tab: WorkspaceTabId) => void;
  onRun?: () => void;
  onStep?: () => void;
  onReset?: () => void;
  onClear: () => void;
  sourceCode: string;
  isLoading: boolean;
  errorMessage: string | null;
}

export default function DosboxWorkspace({
  status,
  diagnostics,
  engineUsed,
  executionTimeMs,
  onClear,
  sourceCode,
  isLoading,
  errorMessage,
}: DosboxWorkspaceProps) {
  const [downloadFormat, setDownloadFormat] = useState<"txt" | "json" | "asm">("txt");
  const [reportDropdownOpen, setReportDropdownOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [cleared, setCleared] = useState(false);

  // Derive execution status text & color (strict black-and-white with functional green/red)
  let statusBadge = {
    text: "Ready",
    color: "#CCCCCC",
    bgColor: "rgba(255, 255, 255, 0.05)",
    borderColor: "#2E2E2E",
  };

  if (isLoading) {
    statusBadge = {
      text: "Assembling & Running...",
      color: "#FFFFFF",
      bgColor: "rgba(255, 255, 255, 0.1)",
      borderColor: "#555555",
    };
  } else if (errorMessage || diagnostics.some((d) => d.type === "error")) {
    statusBadge = {
      text: "Assembly Failed",
      color: "#F85149",
      bgColor: "rgba(248, 81, 73, 0.15)",
      borderColor: "#F85149",
    };
  } else if (status.state === "terminated" || status.exitCode !== undefined) {
    statusBadge = {
      text: `Completed (Exit 0x${((status.exitCode ?? 0) & 0xff).toString(16).toUpperCase()})`,
      color: "#3FB950",
      bgColor: "rgba(63, 185, 80, 0.15)",
      borderColor: "#3FB950",
    };
  } else if (status.state === "running") {
    statusBadge = {
      text: "Running in DOSBox",
      color: "#3FB950",
      bgColor: "rgba(63, 185, 80, 0.2)",
      borderColor: "#3FB950",
    };
  } else if (status.currentStep > 0) {
    statusBadge = {
      text: `Paused at Step ${status.currentStep}`,
      color: "#CCCCCC",
      bgColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "#2E2E2E",
    };
  }

  // Handle Clear
  const handleClearTerminal = () => {
    setCleared(true);
    onClear();
  };

  // Generate real reports
  const handleDownloadReport = (format: "txt" | "json" | "asm") => {
    setDownloadFormat(format);
    setReportDropdownOpen(false);

    if (format === "asm") {
      const blob = new Blob([sourceCode], { type: "text/plain;charset=utf-8" });
      saveAs(blob, "main.asm");
      return;
    }

    if (format === "json") {
      const report = {
        title: "OutputTracer DOSBox 8086 Execution Report",
        timestamp: new Date().toISOString(),
        assembler: engineUsed,
        target: "16-bit DOS .COM (org 100h)",
        environment: "DOSBox 0.74-3 Emulated",
        status: status.state,
        exitCode: status.exitCode ?? 0,
        currentStep: status.currentStep,
        totalSteps: status.totalSteps,
        executionTimeMs: executionTimeMs ?? 0,
        registers: status.registers,
        flags: status.flags,
        stdout: status.stdout,
        diagnostics,
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      saveAs(blob, "dosbox_execution_report.json");
      return;
    }

    // TXT format
    let txt = "=======================================================================\n";
    txt += "OUTPUTTRACER DOSBOX 8086 EXECUTION REPORT\n";
    txt += "=======================================================================\n";
    txt += `Timestamp:       ${new Date().toLocaleString()}\n`;
    txt += `Assembler:       ${engineUsed}\n`;
    txt += `Target:          16-bit DOS .COM (org 100h)\n`;
    txt += `Environment:     DOSBox 0.74-3 (Real Mode 8086)\n`;
    txt += `Status:          ${status.state}\n`;
    txt += `Execution Time:  ${executionTimeMs ? `${executionTimeMs} ms` : "Instant"}\n`;
    txt += `Exit Code:       ${status.exitCode ?? 0}\n\n`;
    txt += "--- CPU REGISTERS ---\n";
    txt += `AX: 0x${status.registers.ax.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `BX: 0x${status.registers.bx.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `CX: 0x${status.registers.cx.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `DX: 0x${status.registers.dx.toString(16).padStart(4, "0").toUpperCase()}\n`;
    txt += `SI: 0x${status.registers.si.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `DI: 0x${status.registers.di.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `BP: 0x${status.registers.bp.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `SP: 0x${status.registers.sp.toString(16).padStart(4, "0").toUpperCase()}\n`;
    txt += `CS: 0x${status.registers.cs.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `DS: 0x${status.registers.ds.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `ES: 0x${status.registers.es.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `SS: 0x${status.registers.ss.toString(16).padStart(4, "0").toUpperCase()}  `;
    txt += `IP: 0x${status.registers.ip.toString(16).padStart(4, "0").toUpperCase()}\n\n`;
    txt += "--- CPU FLAGS ---\n";
    txt += `OF=${status.flags.of ? 1 : 0} DF=${status.flags.df ? 1 : 0} IF=${status.flags.if ? 1 : 0} `;
    txt += `TF=${status.flags.tf ? 1 : 0} SF=${status.flags.sf ? 1 : 0} ZF=${status.flags.zf ? 1 : 0} `;
    txt += `AF=${status.flags.af ? 1 : 0} PF=${status.flags.pf ? 1 : 0} CF=${status.flags.cf ? 1 : 0}\n\n`;
    txt += "--- TERMINAL OUTPUT ---\n";
    txt += status.stdout || "[No terminal output captured]";
    txt += "\n=======================================================================\n";

    const blob = new Blob([txt], { type: "text/plain;charset=utf-8" });
    saveAs(blob, "dosbox_execution_report.txt");
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#0A0A0A] text-[#CCCCCC] font-sans overflow-hidden select-none">
      {/* Main Two-Column Layout (Left ~73% Terminal, Right ~27% Status & Details) */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left Side: Large Black DOSBox Terminal */}
        <div className="flex flex-1 flex-col border-b md:border-b-0 md:border-r border-[#2E2E2E] bg-black">
          {/* Compact Terminal Header */}
          <div className="flex h-8 shrink-0 items-center justify-between border-b border-[#2E2E2E] bg-[#141414] px-3 font-mono text-[11px] text-[#888888]">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-white">DOSBox 0.74-3</span>
              <span className="text-[#333333]">|</span>
              <span>Cpu speed: 3000 cycles</span>
              <span className="text-[#333333]">|</span>
              <span>Frameskip 0</span>
              <span className="text-[#333333]">|</span>
              <span className="text-white">Program: MAIN.COM</span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
                style={{
                  color: statusBadge.color,
                  backgroundColor: statusBadge.bgColor,
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusBadge.color }}
                />
                {status.state.toUpperCase()}
              </span>
              <button
                type="button"
                onClick={handleClearTerminal}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-[#888888] hover:bg-[#222222] hover:text-white transition-colors"
                title="Clear terminal window"
              >
                <Trash2 size={11} />
                <span>Clear</span>
              </button>
            </div>
          </div>

          {/* Terminal Viewport */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[13px] leading-relaxed text-[#AAAAAA] space-y-1">
            {!cleared && (
              <>
                <div>Z:\&gt;mount c C:\OutputTracer</div>
                <div>Drive C is mounted as local directory C:\OutputTracer\</div>
                <div>Z:\&gt;c:</div>
                <div>C:\&gt;nasm -f bin main.asm -o main.com</div>
                <div>C:\&gt;main.com</div>
              </>
            )}

            {/* Real captured assembly output */}
            {status.stdout ? (
              <div className="text-[#3FB950] font-bold whitespace-pre-wrap">{status.stdout}</div>
            ) : (
              !cleared && (
                <div className="text-[#888888] italic">
                  [Program executed. INT 21h write ready.]
                </div>
              )
            )}

            {/* Error banner if assembly diagnostics failed */}
            {diagnostics.length > 0 && (
              <div className="mt-2 rounded border border-[#F85149]/40 bg-[#F85149]/10 p-2 font-mono text-[12px] text-[#F85149]">
                {diagnostics.map((d, i) => (
                  <div key={i}>
                    [Line {d.line ?? 0}] {d.message}
                  </div>
                ))}
              </div>
            )}

            {/* Active prompt with cursor */}
            <div className="flex items-center pt-2">
              <span className="text-white">C:\&gt;</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && terminalInput.trim()) {
                    setTerminalInput("");
                  }
                }}
                className="flex-1 bg-transparent font-mono text-[13px] text-white outline-none pl-1"
                placeholder="type command..."
              />
              <span className="inline-block h-3.5 w-1.5 bg-[#888888] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Right Side (~27% Desktop Width): Execution Status, Details & Download Report */}
        <div className="flex w-full md:w-[320px] lg:w-[360px] shrink-0 flex-col gap-3 p-3 bg-[#121212] overflow-y-auto border-t md:border-t-0 border-[#2E2E2E]">
          {/* 1. Execution Status Card */}
          <div
            className="rounded-lg border p-3"
            style={{
              backgroundColor: statusBadge.bgColor,
              borderColor: statusBadge.borderColor,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#888888]">
                Execution Status
              </span>
              {statusBadge.color === "#3FB950" ? (
                <CheckCircle2 size={16} className="text-[#3FB950]" />
              ) : statusBadge.color === "#F85149" ? (
                <AlertTriangle size={16} className="text-[#F85149]" />
              ) : (
                <Clock size={16} className="text-[#888888]" />
              )}
            </div>
            <div
              className="mt-1 font-mono text-[15px] font-bold"
              style={{ color: statusBadge.color }}
            >
              {statusBadge.text}
            </div>
            <div className="mt-0.5 text-[11px] text-[#888888]">
              {status.state === "ready"
                ? "Code assembled. Ready for step or run."
                : status.state === "running"
                ? "8086 processor executing instructions."
                : status.state === "terminated"
                ? "Execution halted via INT 21h (AH=4Ch)."
                : "Awaiting next user action."}
            </div>
          </div>

          {/* 2. Execution Details Table */}
          <div className="rounded-lg border border-[#2E2E2E] bg-[#181818] p-3">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#888888] mb-2.5">
              Execution Details
            </span>
            <div className="space-y-1.5 font-mono text-[11px]">
              <div className="flex items-center justify-between border-b border-[#2E2E2E]/60 pb-1">
                <span className="text-[#888888]">Assembler</span>
                <span className="font-semibold text-white">{engineUsed}</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#2E2E2E]/60 pb-1">
                <span className="text-[#888888]">Version</span>
                <span className="text-[#CCCCCC]">DOSBox 0.74-3 (Emulated)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#2E2E2E]/60 pb-1">
                <span className="text-[#888888]">Target</span>
                <span className="text-white">16-bit DOS .COM (org 100h)</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#2E2E2E]/60 pb-1">
                <span className="text-[#888888]">Environment</span>
                <span className="text-[#CCCCCC]">DOSBox Real Mode</span>
              </div>
              <div className="flex items-center justify-between border-b border-[#2E2E2E]/60 pb-1">
                <span className="text-[#888888]">Execution Time</span>
                <span className="text-[#3FB950]">
                  {executionTimeMs !== null ? `${executionTimeMs} ms` : "Instant"}
                </span>
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[#888888]">Exit Status</span>
                <span className="font-bold text-white">
                  Exit Code {status.exitCode ?? 0}
                </span>
              </div>
            </div>
          </div>

          {/* 3. Download Report Control */}
          <div className="relative rounded-lg border border-[#2E2E2E] bg-[#181818] p-3">
            <span className="block text-[11px] font-bold uppercase tracking-wider text-[#888888] mb-2">
              Export Session
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDownloadReport(downloadFormat)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded border border-[#3E3E3E] bg-[#222222] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#2A2A2A] transition-colors"
              >
                <Download size={13} />
                <span>Download Report ({downloadFormat.toUpperCase()})</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setReportDropdownOpen(!reportDropdownOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded border border-[#2E2E2E] bg-[#141414] text-[#888888] hover:text-white"
                  aria-label="Select export format"
                >
                  <ChevronDown size={14} />
                </button>

                {reportDropdownOpen && (
                  <div className="absolute right-0 top-9 z-20 w-44 rounded-md border border-[#2E2E2E] bg-[#181818] p-1 shadow-xl">
                    <button
                      type="button"
                      onClick={() => handleDownloadReport("txt")}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-[#CCCCCC] hover:bg-[#252526] hover:text-white"
                    >
                      <span>TXT Execution Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadReport("json")}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-[#CCCCCC] hover:bg-[#252526] hover:text-white"
                    >
                      <span>JSON Execution Report</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadReport("asm")}
                      className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[12px] text-[#CCCCCC] hover:bg-[#252526] hover:text-white"
                    >
                      <span>ASM Source File</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Informational Notice */}
          <div className="mt-auto rounded-lg border border-[#2E2E2E] bg-[#141414] p-3 text-[11px] text-[#888888] leading-relaxed">
            <div className="flex items-center gap-1.5 text-white font-semibold mb-1">
              <Info size={13} className="text-white" />
              <span>DOSBox Emulation Sandbox</span>
            </div>
            <span>
              Emulates an Intel 8086 CPU in 16-bit DOS real-mode. Supports standard DOS services (INT 21h AH=02h/09h/0Ah/4Ch, INT 10h, INT 20h). Hardware direct I/O and protected mode are disabled.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
