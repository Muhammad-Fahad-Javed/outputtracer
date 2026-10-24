"use client";
import {useEffect,useRef} from 'react';
export default function WorkspaceVisit({kind,id,ready=true}:{kind:'project'|'assignment';id:string;ready?:boolean}){const last=useRef('');useEffect(()=>{const key=kind+id;if(!ready||last.current===key)return;let active=true;void fetch('/api/workspaces/history',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id})}).then(r=>{if(r.ok&&active)last.current=key;}).catch(()=>{});return()=>{active=false;};},[kind,id,ready]);return null;}
