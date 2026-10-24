import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAssignment,getClassroom,listAssignments,listUserClassrooms,listClassroomGroups} from '@/lib/classroom/classroomService';
import {resolveClassroomDocument} from '@/lib/classroom/documents';
import {isProjectRole} from '@/lib/cloud/roles';
import {CLASSROOM_LANGUAGES,classroomLanguage} from '@/lib/classroom/languages';
export type SavedWorkspace={kind:'project'|'assignment';id:string;title:string;href:string;category:'Personal projects'|'Shared projects'|'Assignments';language:string;context?:string;lastOpenedAt?:string};
export async function accessibleWorkspace(userId:string,kind:string,id:string):Promise<SavedWorkspace|null>{
 if(kind==='project'){const client=await createClient();if(!client)return null;const {data,error}=await client.from('projects').select('id,title,owner_id,group_id,standard').eq('id',id).maybeSingle();if(error)throw Error('Project access could not be verified.');if(!data)return null;const role=await client.rpc('project_role',{pid:id});if(role.error)throw Error('Project role unavailable.');if(!isProjectRole(role.data))return null;return {kind:'project',id,title:data.title,href:`/p/${id}`,category:data.owner_id===userId&&!data.group_id?'Personal projects':'Shared projects',language:data.standard};}
 if(kind==='assignment'){const admin=createAdminClient();if(!admin)return null;const {data,error}=await admin.from('classroom_assignments').select('classroom_id').eq('id',id).maybeSingle();if(error)throw Error('Assignment access could not be verified.');if(!data)return null;const a=await getAssignment(userId,data.classroom_id,id);if(!a.success||!a.assignment)return null;
 if(!a.isTeacher){const r=await resolveClassroomDocument({actorId:userId,classroomId:data.classroom_id,assignmentId:id,isTeacher:false});if(!r.ok)return null;}
 const cls=await getClassroom(userId,data.classroom_id);return {kind:'assignment',id,title:a.assignment.title,href:`/classroom/${data.classroom_id}/assignments/${id}`,category:'Assignments',language:CLASSROOM_LANGUAGES[classroomLanguage(a.assignment.language)].label,context:cls.classroom?.name};}
 return null;
}
export async function workspaceHistory(userId:string){const a=createAdminClient();if(!a)throw Error('Workspace history is unavailable.');const {data,error}=await a.from('workspace_history').select('kind,target_id,last_opened_at').eq('user_id',userId).order('last_opened_at',{ascending:false}).limit(100);if(error)throw Error('Saved workspace history could not be loaded.');return data||[];}
export async function allWorkspaces(userId:string):Promise<SavedWorkspace[]>{
 const client=await createClient();if(!client)return [];const {data:projects,error}=await client.from('projects').select('id,title,owner_id,group_id,standard').order('updated_at',{ascending:false});if(error)throw Error('Projects could not be loaded.');
 const work:SavedWorkspace[]=(projects||[]).map(p=>({kind:'project',id:p.id,title:p.title,href:`/p/${p.id}`,category:p.owner_id===userId&&!p.group_id?'Personal projects':'Shared projects',language:p.standard}));
 const classes=await listUserClassrooms(userId);if(!classes.success)throw Error('Classrooms could not be loaded.');
 for(const cls of [...classes.teaching,...classes.enrolled]){const list=await listAssignments(userId,cls.id);if(!list.success)continue;for(const a of list.assignments||[]){work.push({kind:'assignment',id:a.id,title:a.title,href:`/classroom/${cls.id}/assignments/${a.id}`,category:'Assignments',language:CLASSROOM_LANGUAGES[classroomLanguage(a.language)].label,context:cls.name+(a.groupMode&&!classes.teaching.some(c=>c.id===cls.id)?' · '+((await listClassroomGroups(userId,cls.id,a.id)).groups||[]).filter(g=>g.members?.some(m=>m.userId===userId)).map(g=>g.name).join(', '):'')});}}
 const history=await workspaceHistory(userId);for(const w of work)w.lastOpenedAt=history.find(h=>h.kind===w.kind&&h.target_id===w.id)?.last_opened_at;return work;
}

export async function lastAccessibleWorkspace(userId:string):Promise<SavedWorkspace|null>{
 for(const entry of await workspaceHistory(userId)){const workspace=await accessibleWorkspace(userId,entry.kind,entry.target_id);if(workspace)return {...workspace,lastOpenedAt:entry.last_opened_at};}
 return null;
}
