// Isolated PostgreSQL/WASM acceptance checks; never connects to production.
// Historical bootstrap accommodations: pgcrypto bytes are a deterministic stub,
// 0005's invalid escaped starter default is neutralized, and draft seed 0012 is
// skipped (it changes no schema). Migrations 0020+ are executed unmodified.
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; alter default privileges in schema public grant select,insert,update,delete on tables to authenticated; create function public.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$; create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role')$$; create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;`);
for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
 if(file.startsWith('0012_'))continue;
 if(file.startsWith('0020_')){
  await db.exec(`insert into auth.users(id,email) values('90000000-0000-4000-8000-000000000001','legacy@example.test'); insert into teacher_profiles(user_id,status) values('90000000-0000-4000-8000-000000000001','approved'); insert into classrooms(id,teacher_id,name,join_code) values('90000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000001','Legacy class','LEGACY1'); insert into classroom_assignments(id,classroom_id,title,group_mode) values('90000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000002','Legacy assignment',true);`);
 }
 if(file.startsWith('0027_')){
  await db.exec(`insert into projects(id,title,owner_id,standard) values('90000000-0000-4000-8000-000000000004','Existing C++ project','90000000-0000-4000-8000-000000000001','c++20'); insert into project_members(project_id,user_id,role) values('90000000-0000-4000-8000-000000000004','90000000-0000-4000-8000-000000000001','owner'); insert into project_files(project_id,path,content) values('90000000-0000-4000-8000-000000000004','main.cpp','// Existing student work'); insert into project_documents(project_id,state_b64) values('90000000-0000-4000-8000-000000000004','existing-yjs-document');`);
 }
 try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8').replace(/create extension if not exists pgcrypto;/gi,'').replace(/starter_code jsonb not null default '[^\n]*'::jsonb/,"starter_code jsonb not null default '{}'::jsonb"));console.log('PASS',file);}
 catch(e){console.error('FAIL',file,e.message,e.detail,e.where);process.exitCode=1;break;}
}
if(!process.exitCode){
 const assert=(condition,message)=>{if(!condition)throw Error(message);};
 const q=async(sql,params=[]) => (await db.query(sql,params)).rows;
 const legacy=(await q(`select p.status,a.group_scope,a.input_policy from teacher_profiles p join classrooms c on c.teacher_id=p.user_id join classroom_assignments a on a.classroom_id=c.id where p.user_id='90000000-0000-4000-8000-000000000001'`))[0];
 assert(legacy.status==='pending_review'&&legacy.group_scope==='legacy_class'&&legacy.input_policy==='paste_allowed','Legacy behavior or teacher review migration failed');
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005'];
 const [admin,teacher,student,student2,outsider]=ids;
 for(let i=0;i<ids.length;i++)await q(`insert into auth.users(id,email) values($1,$2)`,[ids[i],`test${i}@example.test`]);
 await q(`insert into app_roles(user_id,role) values($1,'admin')`,[admin]);
 await q(`insert into teacher_profiles(user_id,status,approved_by) values($1,'approved',$2)`,[teacher,admin]);
 const cid=(await q(`insert into classrooms(teacher_id,name,join_code) values($1,'Test','TEST001') returning id`,[teacher]))[0].id;
 await q(`insert into classroom_members(classroom_id,user_id,role) values($1,$2,'teacher'),($1,$3,'student'),($1,$4,'student')`,[cid,teacher,student,student2]);
 const assignment=async()=> (await q(`insert into classroom_assignments(classroom_id,title,group_mode,is_published) values($1,'Team assignment',true,true) returning id`,[cid]))[0].id;
 const aid=await assignment(),aid2=await assignment();
 const create=async(aid,name,members,existing=null)=>(await q(`select create_assignment_team($1,$2,$3,$4,$5) id`,[teacher,aid,name,members,existing]))[0].id;
 const gid=await create(aid,'Team one',[student,student2]);
 assert((await q(`select count(*)::int n from classroom_group_members where group_id=$1`,[gid]))[0].n===2,'Atomic team missing members');
 let rejected=false;try{await create(aid,'Duplicate team',[student,student2]);}catch{rejected=true;}assert(rejected,'Duplicate team allowed');
 assert((await q(`select count(*)::int n from classroom_groups where assignment_id=$1`,[aid]))[0].n===1,'Failed creation left an empty team');
 await create(aid2,'Different assignment',[student,student2]);
 rejected=false;try{await create(aid,'Unknown',[student,outsider],gid);}catch{rejected=true;}assert(rejected,'Unenrolled student accepted');
 await create(aid,'Renamed',[student2,student],gid);
 await q(`insert into classroom_submissions(assignment_id,group_id,status) values($1,$2,'submitted')`,[aid,gid]);
 await q(`update classroom_submissions set status='draft' where group_id=$1`,[gid]);
 rejected=false;try{await create(aid,'Frozen',[student,student2],gid);}catch{rejected=true;}assert(rejected,'Submitted team was editable');
 await db.exec(`set request.jwt.claim.role='authenticated';`);
 rejected=false;try{await q(`delete from classroom_group_members where group_id=$1`,[gid]);}catch{rejected=true;}assert(rejected,'Direct membership mutation allowed');
 await db.exec(`set request.jwt.claim.role='service_role';`);
 await q(`insert into notification_preferences(user_id,push_enabled) values($1,true),($2,true)`,[student,student2]);
 for(const id of [student,student2])await q(`insert into push_subscriptions(user_id,endpoint,p256dh,auth) values($1,$2,'test','test')`,[id,'https://fcm.googleapis.com/'+id]);
 const req='20000000-0000-4000-8000-000000000001';
 await q(`select send_classroom_message($1,$2,'Hello',null,$3)`,[teacher,cid,req]);
 await q(`select send_classroom_message($1,$2,'Hello',null,$3)`,[teacher,cid,req]);
 assert((await q(`select count(*)::int n from classroom_messages`))[0].n===1,'Message retry duplicated');
 assert((await q(`select count(*)::int n from classroom_notifications`))[0].n===2,'Recipient notifications duplicated or missing');
 assert((await q(`select count(*)::int n from push_outbox`))[0].n===2,'Push outbox duplicated or missing');
 await q(`select * from claim_push_jobs()`);
 await q(`update push_outbox set attempts=5,locked_at=now()-interval '5 minutes'`);
 await q(`select * from claim_push_jobs()`);
 assert((await q(`select count(*)::int n from push_outbox where state='failed'`))[0].n===2,'Exhausted push retries were not retired');
 await q(`insert into similarity_jobs(teacher_id,assignment_id) values($1,$2),($1,$3)`,[teacher,aid,aid2]);
 assert((await q(`select * from claim_similarity_job()`)).length===1,'Report job not claimed');
 assert((await q(`select * from claim_similarity_job()`)).length===0,'Multiple comparison jobs active');
 await db.exec(`grant usage on schema auth to authenticated; set request.jwt.claim.sub='${student}'; set role authenticated;`);
 assert((await q(`select count(*)::int n from classroom_notifications`))[0].n===1,'Notification RLS leaks another recipient');
 const visibleClasses=await q(`select id from classrooms where id=$1`,[cid]);
 assert(visibleClasses.length===1,'Enrolled student classroom read failed or recursed');
 assert((await q(`select user_id from classroom_members where classroom_id=$1`,[cid])).length===3,'Enrolled student roster read failed or recursed');
 assert((await q(`select id from classroom_assignments where id=$1`,[aid])).length===1,'Published assignment read failed or recursed');
 let hiddenDenied=false;try{await q(`select hidden_test_cases from classroom_assignments where id=$1`,[aid]);}catch(e){hiddenDenied=e.code==='42501';}assert(hiddenDenied,'Direct hidden-test read was not denied at the column boundary');
 await db.exec(`reset role;`);
 await q(`update classroom_notifications set is_read=true where recipient_id=$1`,[student]);
 assert((await q(`select count(*)::int n from classroom_notifications where recipient_id=$1 and not is_read`,[student2]))[0].n===1,'Read state leaked to another recipient');
 const individual=(await q(`insert into classroom_assignments(classroom_id,title,group_mode,is_published) values($1,'Individual',false,true) returning id`,[cid]))[0].id;
 rejected=false;try{await q(`insert into classroom_submissions(assignment_id,group_id) values($1,$2)`,[individual,gid]);}catch{rejected=true;}assert(rejected,'A foreign assignment team was accepted for individual work');
 await q(`delete from classroom_members where classroom_id=$1 and user_id=$2`,[cid,student2]);
 await q(`update classroom_submissions set grade=70,status='graded' where group_id=$1`,[gid]);
 assert((await q(`select grade from classroom_submissions where group_id=$1`,[gid]))[0].grade==='70','Frozen team history cannot be graded after a student leaves');
 await q(`update teacher_profiles set status='suspended' where user_id=$1`,[teacher]);
 rejected=false;try{await create(await assignment(),'Denied',[student,student2]);}catch{rejected=true;}assert(rejected,'Suspended teacher could create teams');
 await db.exec(`set request.jwt.claim.sub='${teacher}'; set role authenticated;`);
 assert((await q(`select id from classrooms where id=$1`,[cid])).length===0,'Suspended teacher can read own class through membership');
 assert((await q(`update classrooms set name='Unauthorized' where id=$1 returning id`,[cid])).length===0,'Suspended teacher can update class directly');
 assert((await q(`select id from classroom_assignments where id=$1`,[aid])).length===0,'Suspended teacher can read published assignment through roster');
 await db.exec(`reset role;`);
 const policy=(await q(`select qual from pg_policies where policyname='Teachers can manage classroom assignments'`))[0].qual;
 assert(policy.includes('is_verified_teacher'),'Owner RLS did not gain approval check');
 const granted=(await q(`select has_function_privilege('authenticated','public.activate_teacher_profile()','execute') allowed`))[0].allowed;
 assert(!granted,'Self activation remains callable');
 const oldProject=(await q(`select p.language,p.standard,f.path,f.content,d.state_b64 from projects p join project_files f on f.project_id=p.id join project_documents d on d.project_id=p.id where p.id='90000000-0000-4000-8000-000000000004'`))[0];
 assert(oldProject.language==='cpp'&&oldProject.standard==='c++20'&&oldProject.path==='main.cpp'&&oldProject.content==='// Existing student work'&&oldProject.state_b64==='existing-yjs-document','Saved-project language migration rewrote legacy work');
 await db.exec(`set request.jwt.claim.sub='${student}'; set role authenticated;`);
 const legacyPid=(await q(`select create_project('Legacy RPC','c++17',null,'// Four-argument client') id`))[0].id;
 assert((await q(`select language from projects where id=$1`,[legacyPid]))[0].language==='cpp','Four-argument create_project compatibility failed');
 const ownGroup=(await q(`select create_group('Shared language projects') id`))[0].id;
 assert((await q(`select name from groups where id=$1`,[ownGroup]))[0].name==='Shared language projects','Group members cannot read their shared-project group');
 assert((await q(`select user_id from group_members where group_id=$1`,[ownGroup])).length===1,'Group membership read failed or recursed');
 for(const [language,path,fragment] of [['cpp','main.cpp','int main'],['python','main.py','def main'],['asm8086','main.asm','org 100h']]){
  const pid=(await q(`select create_project($1,$2,$3,null,$4) id`,[language+' project',language==='cpp'?'c++23':null,ownGroup,language]))[0].id;
  const saved=(await q(`select p.language,p.standard,p.group_id,f.path,f.content from projects p join project_files f on f.project_id=p.id where p.id=$1`,[pid]))[0];
  assert(saved.language===language&&saved.path===path&&saved.content.includes(fragment)&&saved.group_id===ownGroup,'Project language, starter or shared group was not saved atomically');
  assert(saved.standard===(language==='cpp'?'c++23':null),'Non-C++ project leaked a C++ standard');
  assert((await q(`select role from project_members where project_id=$1 and user_id=$2`,[pid,student]))[0].role==='owner','New project owner membership missing');
  if(language!=='cpp'){
   rejected=false;try{await q(`select set_project_standard($1,'c++20')`,[pid]);}catch{rejected=true;}assert(rejected,'C++ standard could be set on another project language');
  }
 }
 const visibleBefore=(await q(`select count(*)::int n from projects`))[0].n;
 rejected=false;try{await q(`select create_project('Bad language',null,null,null,'javascript')`);}catch{rejected=true;}assert(rejected,'Unknown project language silently became C++');
 assert((await q(`select count(*)::int n from projects`))[0].n===visibleBefore,'Invalid creation left an orphan project');
 await db.exec(`set request.jwt.claim.sub='${student2}';`);
 assert((await q(`select name from groups where id=$1`,[ownGroup])).length===0,'Unrelated student can read a shared-project group');
 assert((await q(`select user_id from group_members where group_id=$1`,[ownGroup])).length===0,'Unrelated student can read group members');
 assert(!(await q(`select group_has_current_member($1) allowed`,[ownGroup]))[0].allowed,'Caller-bound membership lookup leaks another user access');
 rejected=false;try{await q(`select create_project('Foreign group',null,$1,null,'python')`,[ownGroup]);}catch{rejected=true;}assert(rejected,'Project creation accepted a foreign group');
 assert((await q(`select id from projects where id=$1`,[legacyPid])).length===0,'Unrelated user can read a personal project');
 await db.exec(`reset role;`);
 rejected=false;try{await q(`update projects set language='python',standard=null where id=$1`,[legacyPid]);}catch{rejected=true;}assert(rejected,'Existing project language could be changed');
 assert(!(await q(`select has_function_privilege('anon','public.create_project(text,text,uuid,text,text)','execute') allowed`))[0].allowed,'Anonymous users can create language projects');
 console.log('PASS saved project language defaults, legacy preservation, four/five-argument RPCs, shared ownership, settings immutability and access boundaries');
 console.log('PASS database team atomicity, independent assignments, freeze, enrollment, direct mutation, message idempotency, recipient read state, teacher revocation and RLS contracts');
}
await db.close();
