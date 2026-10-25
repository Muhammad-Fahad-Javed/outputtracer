#!/usr/bin/env node
// Sequential checks against disposable QA coursework only; credentials stay private.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.env.QA_PROJECT_ROOT||process.cwd(),'package.json'));
const {createClient}=require('@supabase/supabase-js'),{createServerClient}=require('@supabase/ssr'),{WebSocket}=require('ws');
const base=process.env.QA_BASE_URL||'http://127.0.0.1:3101';
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.SUPABASE_ANON_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const accounts=JSON.parse(await readFile(process.env.QA_ACCOUNT_PATH||'/home/ec2-user/.outputtracer-test-accounts.json','utf8')).accounts;
const actors=[],sockets=[],passed=[],fixtures=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function check(ok,label){if(!ok)throw Error(label);passed.push(label);console.log('PASS '+label);}
async function login(name){const jar=new Map();const client=createServerClient(url,anon,{auth:{autoRefreshToken:false},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:rows=>rows.forEach(r=>jar.set(r.name,r.value))}});const issued=await service.auth.admin.generateLink({type:'magiclink',email:accounts[name].email});if(issued.error)throw Error('QA sign-in failed');const verified=await client.auth.verifyOtp({type:'magiclink',token_hash:issued.data.properties.hashed_token});if(verified.error)throw Error('QA sign-in failed');const actor={id:accounts[name].id,client,jar,token:verified.data.session.access_token};actors.push(actor);return actor;}
async function api(actor,path,body,method=body?'POST':'GET'){const r=await fetch(base+path,{method,signal:AbortSignal.timeout(30000),headers:{Origin:'https://outputtracer.com',Cookie:[...actor.jar].map(([n,v])=>n+'='+v).join('; '),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok||data.success===false)throw Error('QA fixture request failed: '+r.status+' '+path);return data;}
let lastStart=0;
async function connect(payload,endpoint='/ws/terminal'){const wait=8000-(Date.now()-lastStart);if(wait>0)await pause(wait);lastStart=Date.now();const address=new URL(endpoint,base);address.protocol=address.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(address,{origin:'https://outputtracer.com',handshakeTimeout:10000});sockets.push(ws);const events=[];let closed=false,failure;ws.on('open',()=>ws.send(JSON.stringify(payload)));ws.on('message',raw=>{events.push(JSON.parse(String(raw)));});ws.on('close',()=>{closed=true;});ws.on('error',()=>{failure='WebSocket failed';});return {ws,events,get closed(){return closed;},get failure(){return failure;},output:()=>events.filter(e=>e.type==='stdout').map(e=>e.data||'').join('')};}
async function until(connection,predicate,timeout=25000){const deadline=Date.now()+timeout;while(Date.now()<deadline){if(predicate())return;if(connection.failure)throw Error(connection.failure);await pause(40);}throw Error('Terminal condition timed out');}
let collabClientId=10000;
async function verifyCollaboration(actor,path,language,code,{studentId,role,label}){
 const session=await api(actor,path+'/session',studentId?{studentId}:{});
 const file=language==='cpp'?'main.cpp':'main.py';
 check(session.success===true&&typeof session.token==='string'&&session.token.length>0&&session.role===role&&session.files?.[file]===code,language+' '+label+' session returns canonical source and role');
 const c=await connect({type:'join',kind:'classroom',token:session.token,clientId:++collabClientId},'/ws/collab');
 try{
  await until(c,()=>c.events.some(e=>e.type==='init')||c.closed);
  const init=c.events.find(e=>e.type==='init');
  check(init?.role===role&&typeof init.state==='string'&&init.state.length>0,language+' '+label+' collaboration joins as '+role);
 }finally{c.ws.close();}
 await until(c,()=>c.closed,5000);
}
async function run(actor,scope,language,{waitMs=0}={}){const c=await connect({language,classroom:scope,accessToken:actor.token,files:{[language==='cpp'?'main.cpp':'main.py']:'FORGED CLIENT SOURCE'}});await until(c,()=>c.output().includes('Name: '));if(waitMs)await pause(waitMs);check(!c.closed,language+' console stays alive while human input is idle');c.ws.send(JSON.stringify({type:'stdin',data:'  Ada  \n'}));await until(c,()=>c.closed);check(c.output()==='Name: [  Ada  ]\n'&&c.events.some(e=>e.type==='exit'&&e.code===0),language+' runs canonical source and preserves spaces');}
async function denied(payload,label){const c=await connect(payload);await until(c,()=>c.closed);check(c.events.some(e=>e.type==='error')&&!c.events.some(e=>e.type==='ready'),label);}
try{
 const teacher=await login('teacher'),student=await login('student'),other=await login('student2');
 for(const language of ['cpp','python']){
  const classroom=(await api(teacher,'/api/classroom',{name:'QA console '+language+' '+new Date().toISOString(),subject:language==='cpp'?'C++':'Python',language})).classroom;
  await api(student,'/api/classroom/join',{joinCode:classroom.joinCode});await api(other,'/api/classroom/join',{joinCode:classroom.joinCode});
  const code=language==='cpp'?'#include <iostream>\n#include <string>\nint main(){std::string name;std::cout<<"Name: "<<std::flush;std::getline(std::cin,name);std::cout<<"["<<name<<"]\\n";}':'name=input("Name: ")\nprint("["+name+"]")\n';
  const assignment=(await api(teacher,`/api/classroom/${classroom.id}/assignments`,{title:'QA private '+language+' console',language,groupMode:false,isPublished:true,starterCode:{[language==='cpp'?'main.cpp':'main.py']:code},publicTestCases:[],hiddenTestCases:[],timeLimitMs:10000})).assignment;
  const scope={classId:classroom.id,assignmentId:assignment.id};const path=`/api/classroom/${classroom.id}/assignments/${assignment.id}`;fixtures.push({language,...scope});
  await verifyCollaboration(student,path,language,code,{role:'editor',label:'student'});
  await verifyCollaboration(teacher,path,language,code,{studentId:student.id,role:'viewer',label:'teacher watch'});
  // Runs have private stdin even though the document is canonical server state.
  await run(student,scope,language,{waitMs:11000});
  await run(teacher,{...scope,studentId:student.id},language);
  await denied({language,classroom:{...scope,studentId:student.id},accessToken:other.token},language+' denies another student document');
  await denied({language,classroom:scope,accessToken:'forged'},language+' rejects forged authentication');
  await denied({language:language==='cpp'?'python':'cpp',classroom:scope,accessToken:student.token},language+' denies a mismatched runtime');
  const active=await connect({language,classroom:scope,accessToken:student.token});await until(active,()=>active.output().includes('Name: '));
  try{await api(teacher,path,{allowRun:false},'PATCH');await until(active,()=>active.closed,20000);check(active.events.some(e=>e.type==='error')&&!active.events.some(e=>e.type==='exit'&&e.code===0),language+' run closes after teacher revokes execution');await denied({language,classroom:scope,accessToken:student.token},language+' denies new runs while teacher disables execution');}
  finally{await api(teacher,path,{allowRun:true},'PATCH');}
 }
 await denied({language:'python',files:{'main.py':'print(1)'}},'Standalone Python retains its sign-in requirement');
 console.log('COMPLETE '+passed.length+' classroom console checks');
 await writeFile(process.env.QA_REPORT_PATH||'/tmp/outputtracer-classroom-console-results.json',JSON.stringify({verifiedAt:new Date().toISOString(),base,fixtures,passed},null,2),{mode:0o600});
}catch(error){console.error('FAIL '+String(error.message).replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]'));process.exitCode=1;}
finally{for(const ws of sockets)ws.terminate();for(const actor of actors){actor.client.realtime.disconnect();actor.client.auth.stopAutoRefresh();}service.auth.stopAutoRefresh();}
