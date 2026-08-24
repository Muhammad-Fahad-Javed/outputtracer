"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Loader2, RotateCcw, Square } from "lucide-react";

type SessionStatus =
  | "idle"
  | "connecting"
  | "compiling"
  | "running"
  | "finished"
  | "error";

interface InteractiveTerminalProps {
  files: Record<string, string>;
}

export default function InteractiveTerminal({
  files,
}: InteractiveTerminalProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");

  // Initialize xterm once
  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, Menlo, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.4,
      theme: {
        background: "#111111",
        foreground: "#e0e0e0",
        cursor: "#ffffff",
        selectionBackground: "#ffffff30",
        black: "#111111",
        red: "#D93025",
        green: "#34A853",
        yellow: "#F9AB00",
        blue: "#4285F4",
        magenta: "#A142F4",
        cyan: "#24C1E0",
        white: "#e0e0e0",
        brightBlack: "#666666",
        brightRed: "#EA4335",
        brightGreen: "#34A853",
        brightYellow: "#FBBC04",
        brightBlue: "#669DF6",
        brightMagenta: "#AF5CF7",
        brightCyan: "#4ECDC4",
        brightWhite: "#ffffff",
      },
      convertEol: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln("\x1b[90m● OutputTracer Interactive Terminal\x1b[0m");
    term.writeln("\x1b[90m  Click \"Run\" to compile and execute your code.\x1b[0m");
    term.writeln("");

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore errors during disposal
      }
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Run the program
  const handleRun = useCallback(() => {
    const term = xtermRef.current;
    if (!term) return;

    // Close any existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear terminal
    term.clear();
    term.writeln("\x1b[90m● Connecting...\x1b[0m");
    setStatus("connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/terminal`);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("compiling");
      term.writeln("\x1b[90m● Compiling...\x1b[0m");

      // Send the init payload
      ws.send(
        JSON.stringify({
          files,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "compile_start":
            setStatus("compiling");
            break;

          case "compile_success":
            term.writeln(
              `\x1b[32m✓ Compiled successfully\x1b[90m (${msg.compileTimeMs}ms)\x1b[0m`
            );
            term.writeln("");
            break;

          case "compile_error":
            setStatus("error");
            term.writeln("\x1b[31m✗ Compilation failed\x1b[0m");
            term.writeln("");
            if (msg.data) {
              // Write each line of the error
              const lines = msg.data.split("\n");
              for (const line of lines) {
                term.writeln(`\x1b[31m${line}\x1b[0m`);
              }
            }
            break;

          case "ready":
            setStatus("running");
            // Enable user input forwarding
            const dataDisposable = term.onData((data) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "stdin", data }));
              }
            });

            // Store disposable for cleanup
            ws.addEventListener("close", () => dataDisposable.dispose(), {
              once: true,
            });
            break;

          case "stdout":
            if (msg.data) term.write(msg.data);
            break;

          case "stderr":
            if (msg.data) term.write(`\x1b[31m${msg.data}\x1b[0m`);
            break;

          case "exit":
            setStatus("finished");
            term.writeln("");
            if (msg.signal) {
              term.writeln(
                `\x1b[31m● Process terminated: ${msg.data || msg.signal}\x1b[0m`
              );
            } else if (msg.code === 0) {
              term.writeln(
                "\x1b[32m● Process exited successfully (code 0)\x1b[0m"
              );
            } else {
              term.writeln(
                `\x1b[33m● Process exited with code ${msg.code}\x1b[0m`
              );
            }
            break;

          case "timeout":
            setStatus("error");
            term.writeln("");
            term.writeln(
              `\x1b[31m● ${msg.data || "Program timed out."}\x1b[0m`
            );
            break;

          case "output_limit":
            setStatus("error");
            term.writeln("");
            term.writeln(
              `\x1b[31m● ${msg.data || "Output limit exceeded."}\x1b[0m`
            );
            break;

          case "error":
            setStatus("error");
            term.writeln("");
            term.writeln(`\x1b[31m● Error: ${msg.data}\x1b[0m`);
            break;
        }
      } catch {
        // Non-JSON message — write raw
        term.write(event.data);
      }
    };

    ws.onerror = () => {
      setStatus("error");
      term.writeln("\x1b[31m● WebSocket connection failed.\x1b[0m");
    };

    ws.onclose = () => {
      wsRef.current = null;
      if (status === "connecting" || status === "compiling" || status === "running") {
        setStatus("finished");
      }
    };
  }, [files, status]);

  // Stop the program
  const handleStop = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus("finished");
    const term = xtermRef.current;
    if (term) {
      term.writeln("");
      term.writeln("\x1b[33m● Program stopped by user.\x1b[0m");
    }
  }, []);

  const isActive =
    status === "connecting" || status === "compiling" || status === "running";

  return (
    <div className="overflow-hidden rounded-[4px] border border-[#DCDCDC]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#DCDCDC] bg-[#FAFAFA] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#666666]">
            Interactive Console
          </span>
          {status === "compiling" && (
            <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#FFF3CD] px-1.5 py-0.5 text-[10px] font-semibold text-[#856404]">
              <Loader2 size={10} className="animate-spin" />
              Compiling
            </span>
          )}
          {status === "running" && (
            <span className="inline-flex items-center gap-1 rounded-[3px] bg-[#D4EDDA] px-1.5 py-0.5 text-[10px] font-semibold text-[#155724]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#155724]" />
              Running
            </span>
          )}
          {status === "finished" && (
            <span className="rounded-[3px] bg-[#E2E3E5] px-1.5 py-0.5 text-[10px] font-semibold text-[#383D41]">
              Finished
            </span>
          )}
          {status === "error" && (
            <span className="rounded-[3px] bg-[#F8D7DA] px-1.5 py-0.5 text-[10px] font-semibold text-[#721C24]">
              Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isActive ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-[#D93025] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#C12717]"
            >
              <Square size={11} fill="currentColor" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRun}
              className="inline-flex items-center gap-1.5 rounded-[3px] bg-black px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#1a1a1a]"
            >
              <RotateCcw size={11} />
              {status === "idle" ? "Run" : "Re-run"}
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={termRef}
        className="h-[350px] w-full bg-[#111111] px-2 py-2"
      />
    </div>
  );
}
