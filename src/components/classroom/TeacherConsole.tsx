"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import ProgramConsole, {type ClassroomConsoleScope} from "@/components/ProgramConsole";
import DosTerminal from "@/components/asm/DosTerminal";
import type {AsmExecutionStatus} from "@/lib/asm/types";

export default function TeacherConsole({scope,language,runRequest,onRunningChange}:{scope:ClassroomConsoleScope;language:"cpp"|"python"|"asm8086";runRequest:number;onRunningChange:(running:boolean)=>void}) {
  const [status,setStatus]=useState<AsmExecutionStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const session=useRef<{sessionId:string;sessionToken:string;sourceRevision:string}|null>(null);
  const base=`/api/classroom/${scope.classId}/assignments/${scope.assignmentId}/interactive`;
  useEffect(()=>()=>{if(session.current)void fetch(base,{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"stop",...session.current})});},[base]);
  const execute=useCallback(async(action:string,input?:string)=>{
    setBusy(true);setError(null);onRunningChange(true);
    try {
      const response=await fetch(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,input,...session.current,groupId:scope.groupId,studentId:scope.studentId})});
      const data=await response.json();
      if(!response.ok||!data.success)throw Error([data.error,...(data.diagnostics||[]).map((d:{message:string})=>d.message)].filter(Boolean).join("\n")||"Execution failed.");
      if(action==="stop"){session.current=null;setStatus(null);}
      else{session.current={sessionId:data.sessionId,sessionToken:data.sessionToken,sourceRevision:data.sourceRevision};setStatus(data.status);}
    }catch(failure){setError(failure instanceof Error?failure.message:"Execution failed.");}
    finally{setBusy(false);onRunningChange(false);}
  },[base,scope.groupId,scope.studentId,onRunningChange]);
  const run=useRef(execute);
  useEffect(()=>{run.current=execute;},[execute]);
  useEffect(()=>{if(runRequest&&language==="asm8086")void run.current("start");},[runRequest,language]);
  if(language!=="asm8086")return <ProgramConsole language={language} files={{}} classroom={scope} runRequest={runRequest} onRunningChange={onRunningChange} privateRun/>;
  return <DosTerminal status={status} busy={busy} error={error} privateRun onInput={text=>execute("input",text)} onStart={()=>void execute("start")} onReset={()=>void execute("start")} onStop={()=>void execute("stop")}/>;
}
