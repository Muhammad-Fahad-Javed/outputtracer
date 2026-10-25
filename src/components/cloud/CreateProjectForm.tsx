"use client";

import { useActionState, useId, useState } from "react";
import { ArrowRight, Braces, Cpu, FileCode2, Terminal } from "lucide-react";
import { createProject } from "@/lib/cloud/actions";
import { PROJECT_CPP_STANDARDS, PROJECT_LANGUAGES, type ProjectLanguage } from "@/lib/cloud/projectLanguage";

const choices = [
  { id: "cpp", title: "C++", description: "Compile, run and trace", icon: Braces, placeholder: "e.g. Data structures lab" },
  { id: "python", title: "Python", description: "Python 3 console", icon: Terminal, placeholder: "e.g. Data analysis toolkit" },
  { id: "asm8086", title: "8086 Assembly", description: "NASM + browser DOSBox", icon: Cpu, placeholder: "e.g. Checksum scanner" },
] as const;

export default function CreateProjectForm({ groupId }: { groupId?: string }) {
  const [state, action, pending] = useActionState(createProject, null);
  const [language, setLanguage] = useState<ProjectLanguage>("cpp");
  const id = useId();
  const choice = choices.find(item => item.id === language)!;
  const control = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-60";

  return <form action={action} className="space-y-5">
    {groupId && <input type="hidden" name="groupId" value={groupId} />}
    <fieldset disabled={pending}>
      <legend className="mb-2.5 text-sm font-medium text-slate-800">Choose a language</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map(item => <label key={item.id} className={`relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${language === item.id ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-white hover:border-slate-400"}`}>
          <input type="radio" name="language" value={item.id} checked={language === item.id} onChange={() => setLanguage(item.id)} className="peer sr-only" />
          <item.icon size={21} aria-hidden className={language === item.id ? "text-blue-700" : "text-slate-500"}/>
          <span className="min-w-0"><span className="block text-sm font-semibold text-slate-900">{item.title}</span><span className="mt-0.5 block text-[11px] text-slate-600">{item.description}</span></span>
          <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600"/>
        </label>)}
      </div>
    </fieldset>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label htmlFor={`${id}-title`} className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-slate-800">Project name
        <input id={`${id}-title`} name="title" required maxLength={120} placeholder={choice.placeholder} disabled={pending} className={control}/>
      </label>
      {language === "cpp" && <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">C++ standard
        <select name="standard" defaultValue="c++17" disabled={pending} className={control}>{PROJECT_CPP_STANDARDS.map(item => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select>
      </label>}
      <button type="submit" disabled={pending} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">{pending ? "Creating…" : "Create project"}<ArrowRight size={15} aria-hidden/></button>
    </div>
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500"><FileCode2 size={14} aria-hidden/> Starts with <code className="font-medium text-slate-700">{PROJECT_LANGUAGES[language].file}</code><span>· {groupId ? "Shared with this project group" : "Private until you share it"}</span>{language === "asm8086" && <span>· Runs in your browser</span>}</p>
    {state?.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
  </form>;
}
