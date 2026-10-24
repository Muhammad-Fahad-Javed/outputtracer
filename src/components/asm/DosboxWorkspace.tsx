"use client";
import type {AsmExecutionStatus,AsmDiagnostic} from '@/lib/asm/types';
import type {WorkspaceTabId} from '@/lib/workspaceConfig';
import DosTerminal from './DosTerminal';
interface Props{status:AsmExecutionStatus;diagnostics:AsmDiagnostic[];engineUsed:string;executionTimeMs:number|null;activeTab?:WorkspaceTabId;onTabChange?:(tab:WorkspaceTabId)=>void;onRun?:()=>void;onStep?:()=>void;onReset?:()=>void;onStop?:()=>void;onInput?:(text:string)=>Promise<void>;onClear:()=>void;sourceCode:string;isLoading:boolean;errorMessage:string|null;}
export default function DosboxWorkspace(p:Props){return <div className="flex h-full min-w-0 flex-1 flex-col"><div className="shrink-0 px-3 pt-2 text-[11px] text-[#aaa]">Assembler: {p.engineUsed||'Not assembled'}{p.executionTimeMs!==null?` · ${p.executionTimeMs} ms`:''}{p.diagnostics.filter(d=>d.type==='error').map((d,i)=><p key={i} className="text-red-300">{d.message}</p>)}</div><DosTerminal status={p.status} busy={p.isLoading} error={p.errorMessage} onInput={p.onInput||(async()=>{})} onStart={p.onRun} onReset={p.onReset} onStop={p.onStop}/></div>;}
