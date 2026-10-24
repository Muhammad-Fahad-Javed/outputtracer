// Before applying the classroom migrations, export the affected durable data.
// Run with server credentials in the environment; output never contains credentials.
// This is a paged data export, not a point-in-time PostgreSQL/system backup.
import {writeFile,mkdir,chmod} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {resolve} from 'node:path';
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Server database credentials are required.');
const output=resolve(process.argv[2]||'classroom-backup.json.gz');
const tables=['profiles','app_roles','teacher_profiles','teacher_applications','classroom_audit_logs','classrooms','classroom_members','classroom_groups','classroom_group_members','classroom_assignments','classroom_submissions','assignment_code_versions','assignment_rubrics','submission_grades','submission_feedback','group_contribution_reports','execution_logs','submission_snapshots','assignment_activity_events','classroom_documents','classroom_messages','classroom_notifications'];
const backup={createdAt:new Date().toISOString(),formatVersion:1,consistency:'paged export; live writes are not transactionally frozen',tables:{}};
for(const table of tables){const rows=[];for(let offset=0;;offset+=500){const response=await fetch(`${url}/rest/v1/${table}?select=*`,{headers:{apikey:key,Authorization:`Bearer ${key}`,Range:`${offset}-${offset+499}`}});if(!response.ok)throw Error(`Backup failed for ${table}: HTTP ${response.status}`);const page=await response.json();rows.push(...page);if(page.length<500)break;}backup.tables[table]=rows;}
await mkdir(resolve(output,'..'),{recursive:true,mode:0o700});
await writeFile(output,gzipSync(JSON.stringify(backup)),{mode:0o600});await chmod(output,0o600);
console.log(`Saved ${tables.length} tables (${Object.values(backup.tables).reduce((n,rows)=>n+rows.length,0)} rows) to ${output}`);
