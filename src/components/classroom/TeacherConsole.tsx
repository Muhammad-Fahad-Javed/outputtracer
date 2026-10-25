"use client";
import ProgramConsole, {type ClassroomConsoleScope} from "@/components/ProgramConsole";
import BrowserDosbox from "@/components/asm/BrowserDosbox";
import type {DosboxAssets} from "@/lib/dosboxAssets";
export default function TeacherConsole({scope,language,runRequest,onRunningChange,files,assets,getFiles,getAssets}:{scope:ClassroomConsoleScope;language:"cpp"|"python"|"asm8086";runRequest:number;onRunningChange:(running:boolean)=>void;files:Record<string,string>;assets?:DosboxAssets;getFiles?:()=>Record<string,string>;getAssets?:()=>DosboxAssets}) {
  if(language==="asm8086")return <BrowserDosbox files={files} assets={assets} getFiles={getFiles} getAssets={getAssets} runRequest={runRequest} onRunningChange={onRunningChange}/>;
  return <ProgramConsole language={language} files={{}} classroom={scope} runRequest={runRequest} onRunningChange={onRunningChange} privateRun/>;
}
