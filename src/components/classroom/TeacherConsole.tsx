"use client";

import ProgramConsole, { type ClassroomConsoleScope } from "@/components/ProgramConsole";
import BrowserDosbox from "@/components/asm/BrowserDosbox";
import type { DosboxAssets } from "@/lib/dosboxAssets";

export default function TeacherConsole({
  scope,
  language,
  runRequest,
  onRunningChange,
  files,
  assets,
  getFiles,
  getAssets,
  onArtifactsChange,
  canRun = true,
}: {
  scope: ClassroomConsoleScope;
  language: "cpp" | "python" | "asm8086";
  runRequest: number;
  onRunningChange: (running: boolean) => void;
  files: Record<string, string>;
  assets?: DosboxAssets;
  getFiles?: () => Record<string, string>;
  getAssets?: () => DosboxAssets;
  onArtifactsChange?: (artifacts: Record<string, Uint8Array>) => void;
  canRun?: boolean;
}) {
  if (language === "asm8086") {
    return <BrowserDosbox files={files} assets={assets} getFiles={getFiles} getAssets={getAssets}
      runRequest={runRequest} onRunningChange={onRunningChange} onArtifactsChange={onArtifactsChange} canRun={canRun} />;
  }
  return <ProgramConsole language={language} files={{}} classroom={scope} runRequest={runRequest}
    onRunningChange={onRunningChange} canRun={canRun} privateRun />;
}
