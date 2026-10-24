"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
export default function TeacherApplicationPage() {
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[status,setStatus]=useState("none");
 useEffect(()=>{fetch('/api/classroom/teacher/apply').then(r=>r.json()).then(d=>setStatus(d.application?.status || d.capabilities?.teacherApplicationStatus || 'none')).catch(()=>setMessage('Could not load application status.'));},[]);
 async function submit(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setMessage('');
 const fields=Object.fromEntries(new FormData(event.currentTarget));
 try {const r=await fetch('/api/classroom/teacher/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fields)});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'Application not saved.');setStatus('pending_review');setMessage('Application saved. An administrator will review your teacher access.');}catch(e){setMessage(e instanceof Error?e.message:'Application not saved.');}finally{setBusy(false);}}
 return <><Header/><main className="light-surface mx-auto max-w-2xl px-6 py-10"><h1 className="text-2xl font-semibold">Apply for teacher access</h1><p className="my-4 text-sm text-gray-600">An administrator must approve your profile before you can manage classes or review student work.</p><p className="my-3 text-sm">Application status: <strong>{status.replaceAll('_',' ')}</strong></p>
 {['none','draft','info_requested','rejected'].includes(status)&&<form onSubmit={submit} className="space-y-4">
 {[['institutionName','Institution',true],['institutionEmail','Institution email',false],['department','Department',false],['coursesIntended','Subjects you teach',false]].map(([name,label,required])=><label key={String(name)} className="block text-sm">{label}<input name={String(name)} required={Boolean(required)} type={name==='institutionEmail'?'email':'text'} maxLength={name==='coursesIntended'?500:160} className="mt-1 block w-full rounded border p-2"/></label>)}
 <label className="block text-sm">Evidence / teaching role<textarea name="evidenceNotes" required minLength={5} maxLength={2000} className="mt-1 block w-full rounded border p-2"/></label><button disabled={busy} className="rounded bg-black px-5 py-2 text-white disabled:opacity-50">{busy?'Submitting…':'Submit for review'}</button></form>}
 {message&&<p role="status" className="my-4 text-sm">{message}</p>}<Link href="/classroom/student" className="mt-6 inline-block underline">Back to learning</Link></main><Footer/></>;
}
