"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, BookOpen, Braces, Cpu, Folder, Search, Terminal, Users } from "lucide-react";
import type { SavedWorkspace } from "@/lib/workspaces";
import type { ProjectLanguage } from "@/lib/cloud/projectLanguage";

const categories = ["All work", "Personal projects", "Shared projects", "Assignments"] as const;
const iconFor = { cpp: Braces, python: Terminal, asm8086: Cpu };

export default function ProjectsLibrary({ workspaces, loadError }: { workspaces: SavedWorkspace[]; loadError: string }) {
  const [category, setCategory] = useState<(typeof categories)[number]>("All work");
  const [language, setLanguage] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const filtered = useMemo(() => workspaces.filter(item =>
    (category === "All work" || item.category === category) &&
    (language === "all" || item.languageId === language) &&
    `${item.title} ${item.language} ${item.context || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  ).sort((a, b) => sort === "name" ? a.title.localeCompare(b.title) : (b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : 0) - (a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : 0)), [workspaces, category, language, query, sort]);
  const hasFilters = category !== "All work" || language !== "all" || query.trim() !== "";

  return <section aria-label="Saved work" className="mt-10">
    <div className="mb-4 flex items-baseline justify-between gap-3"><h2 className="text-xl font-semibold tracking-tight text-slate-900">Your work</h2><span className="text-sm text-slate-500">{workspaces.length} {workspaces.length === 1 ? "workspace" : "workspaces"}</span></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-3 pt-2" role="group" aria-label="Workspace categories">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${category === item ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{item}<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item === "All work" ? workspaces.length : workspaces.filter(w => w.category === item).length}</span></button>)}</div>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 px-3 text-slate-400"><Search size={16} aria-hidden/><input aria-label="Search saved work" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects, classes or teams…" className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"/></label>
        <select aria-label="Filter by language" value={language} onChange={event => setLanguage(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="all">All languages</option><option value="cpp">C++</option><option value="python">Python</option><option value="asm8086">8086 Assembly</option></select>
        <select aria-label="Sort saved work" value={sort} onChange={event => setSort(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="recent">Recently opened</option><option value="name">Name A–Z</option></select>
      </div>
      {loadError && <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{loadError} <button onClick={() => window.location.reload()} className="font-semibold underline">Retry</button></p>}
      <div aria-live="polite">
        {filtered.length ? <ul className="divide-y divide-slate-100">{filtered.map(item => {
          const Icon = iconFor[item.languageId as ProjectLanguage] || Folder;
          const CategoryIcon = item.kind === "assignment" ? BookOpen : item.category === "Shared projects" ? Users : Folder;
          return <li key={`${item.kind}:${item.id}`}><Link href={item.href} className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-slate-50 sm:px-5">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.languageId === "asm8086" ? "bg-violet-50 text-violet-700" : item.languageId === "python" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}><Icon size={21} aria-hidden/></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{item.title}</span><span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500"><span>{item.language}</span><span className="inline-flex items-center gap-1"><CategoryIcon size={11} aria-hidden/>{item.category === "Assignments" ? "Assignment" : item.category === "Shared projects" ? "Shared project" : "Personal project"}</span>{item.context && <span className="truncate">{item.context}</span>}</span></span>
            <span className="hidden shrink-0 text-right text-xs text-slate-400 md:block">{item.lastOpenedAt ? <><span className="block">Last opened</span><time dateTime={item.lastOpenedAt}>{new Date(item.lastOpenedAt).toLocaleDateString(undefined, {day:"numeric",month:"short",year:"numeric"})}</time></> : "Open workspace"}</span><ArrowUpRight size={17} aria-hidden className="shrink-0 text-slate-400 group-hover:text-blue-700"/>
          </Link></li>;
        })}</ul> : !loadError && <div className="px-6 py-14 text-center"><Folder size={30} aria-hidden className="mx-auto mb-3 text-slate-300"/><h3 className="text-sm font-semibold text-slate-800">{hasFilters ? "No matching workspaces" : "Your workspace starts here"}</h3><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{hasFilters ? "Try another search or language filter." : "Create a project above. Shared projects and classroom assignments will appear here when you have access."}</p>{hasFilters && <button onClick={() => {setQuery("");setLanguage("all");setCategory("All work");}} className="mt-4 text-sm font-semibold text-blue-700">Clear filters</button>}</div>}
      </div>
    </div>
  </section>;
}
