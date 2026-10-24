"use client";
import {useEffect,useState} from 'react';
import {removeBrowserPush} from '@/lib/pushClient';
export default function PushPreferences(){const [enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState('');useEffect(()=>{if(!('serviceWorker' in navigator))return;void navigator.serviceWorker.getRegistration('/').then(r=>r?.pushManager?.getSubscription()).then(s=>setEnabled(Boolean(s))).catch(()=>{});},[]);
 async function toggle(){setBusy(true);setNote('');try{if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw Error('This browser does not support push. Website notifications remain available.');
 if(enabled){await removeBrowserPush();setEnabled(false);setNote('Notifications disabled for this browser.');return;}
 const r=await fetch('/api/notifications/push');const d=await r.json();if(!r.ok||!d.configured)throw Error(d.error||'Browser push is not configured yet. Website notifications remain available.');
 if(await Notification.requestPermission()!=='granted')throw Error('Browser notifications were not enabled. Website notifications remain available.');
 const sw=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
 const raw=atob(d.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));
 const subscription=await sw.pushManager.getSubscription()||await sw.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 const saved=await fetch('/api/notifications/push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(subscription.toJSON())});const result=await saved.json();if(!saved.ok)throw Error(result.error||'Subscription was not saved.');setEnabled(true);setNote('Browser notifications enabled.');
 }catch(e){setNote(e instanceof Error?e.message:'Could not configure browser notifications.');}finally{setBusy(false);}}
 return <div className="border-t p-3 text-xs text-black"><button disabled={busy} onClick={()=>void toggle()} className="underline disabled:opacity-50">{busy?'Updating…':enabled?'Disable this browser’s notifications':'Enable browser notifications'}</button>{note&&<p role="status" className="mt-2 text-gray-600">{note}</p>}</div>;}
