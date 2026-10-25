import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {getAssignment,getClassroom,listAssignments,listUserClassrooms,listClassroomGroups} from '@/lib/classroom/classroomService';
import {resolveClassroomDocument} from '@/lib/classroom/documents';
import {isProjectRole} from '@/lib/cloud/roles';
import {CLASSROOM_LANGUAGES,classroomLanguage} from '@/lib/classroom/languages';
import {projectLanguage,projectLanguageLabel,type ProjectLanguage} from '@/lib/cloud/projectLanguage';
export type SavedWorkspace={kind:'project'|'assignment';id:string;title:string;href:string;category:'Personal projects'|'Shared projects'|'Assignments';language:string;languageId?:ProjectLanguage;context?:string;lastOpenedAt?:string};
type ProjectWorkspaceRow={owner_id:string;group_id:string|null;project_members?:{count:number}[];groups?:{name:string}|{name:string}[]|null};
export function projectWorkspaceCategory(project:ProjectWorkspaceRow,userId:string):'Personal projects'|'Shared projects'{return project.owner_id===userId&&!project.group_id&&(project.project_members?.[0]?.count??1)<=1?'Personal projects':'Shared projects';}
function projectContext(project:ProjectWorkspaceRow):string|undefined{const group=Array.isArray(project.groups)?project.groups[0]:project.groups;return group?.name;}
export async function accessibleWorkspace(userId:string,kind:string,id:string):Promise<SavedWorkspace|null>{
 if(kind==='project'){const client=await createClient();if(!client)return null;const {data,error}=await client.from('projects').select('id,title,owner_id,group_id,standard,language,project_members(count),groups(name)').eq('id',id).maybeSingle();if(error)throw Error('Project access could not be verified.');if(!data)return null;const role=await client.rpc('project_role',{pid:id});if(role.error)throw Error('Project role unavailable.');if(!isProjectRole(role.data))return null;return {kind:'project',id,title:data.title,href:`/p/${id}`,category:projectWorkspaceCategory(data,userId),context:projectContext(data),language:projectLanguageLabel(data.language,data.standard),languageId:projectLanguage(data.language)};}
 if(kind==='assignment'){const admin=createAdminClient();if(!admin)return null;const {data,error}=await admin.from('classroom_assignments').select('classroom_id').eq('id',id).maybeSingle();if(error)throw Error('Assignment access could not be verified.');if(!data)return null;const a=await getAssignment(userId,data.classroom_id,id);if(!a.success||!a.assignment)return null;
 if(!a.isTeacher){const r=await resolveClassroomDocument({actorId:userId,classroomId:data.classroom_id,assignmentId:id,isTeacher:false});if(!r.ok)return null;}
 const cls=await getClassroom(userId,data.classroom_id);return {kind:'assignment',id,title:a.assignment.title,href:`/classroom/${data.classroom_id}/assignments/${id}`,category:'Assignments',language:CLASSROOM_LANGUAGES[classroomLanguage(a.assignment.language)].label,languageId:classroomLanguage(a.assignment.language),context:cls.classroom?.name};}
 return null;
}
export async function workspaceHistory(userId:string){const a=createAdminClient();if(!a)throw Error('Workspace history is unavailable.');const {data,error}=await a.from('workspace_history').select('kind,target_id,last_opened_at').eq('user_id',userId).order('last_opened_at',{ascending:false}).limit(100);if(error)throw Error('Saved workspace history could not be loaded.');return data||[];}

/** Keep database service fan-out bounded while retaining the caller's order. */
async function mapWorkspaceReads<T,R>(items:T[],read:(item:T)=>Promise<R>):Promise<R[]>{
 const results=new Array<R>(items.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{
  while(next<items.length){const index=next++;results[index]=await read(items[index]);}
 }));
 return results;
}

export async function allWorkspaces(userId:string):Promise<SavedWorkspace[]>{
 const client=await createClient();
 if(!client)return [];
 const [projectResult,classes,history]=await Promise.all([
  client.from('projects').select('id,title,owner_id,group_id,standard,language,project_members(count),groups(name)').order('updated_at',{ascending:false}),
  listUserClassrooms(userId),
  workspaceHistory(userId),
 ]);
 if(projectResult.error)throw Error('Projects could not be loaded.');
 if(!classes.success)throw Error('Classrooms could not be loaded.');
 const work:SavedWorkspace[]=(projectResult.data||[]).map(p=>({kind:'project',id:p.id,title:p.title,href:`/p/${p.id}`,category:projectWorkspaceCategory(p,userId),context:projectContext(p),language:projectLanguageLabel(p.language,p.standard),languageId:projectLanguage(p.language)}));
 const teachingIds=new Set(classes.teaching.map(cls=>cls.id));
 const seenClasses=new Set<string>();
 const uniqueClasses=[...classes.teaching,...classes.enrolled].filter(cls=>{
  if(seenClasses.has(cls.id))return false;
  seenClasses.add(cls.id);return true;
 });
 const assignmentLists=await mapWorkspaceReads(uniqueClasses,async cls=>{
  const list=await listAssignments(userId,cls.id);
  // Access may have been revoked since the classroom list was read. Do not
  // expose inaccessible assignments or hide unrelated personal projects.
  return list.success?(list.assignments||[]).map(assignment=>({cls,assignment})):[];
 });
 const assignments=await mapWorkspaceReads(assignmentLists.flat(),async({cls,assignment})=>{
  let context=cls.name;
  if(assignment.groupMode&&!teachingIds.has(cls.id)){
   const result=await listClassroomGroups(userId,cls.id,assignment.id);
   if(!result.success)throw Error(`Teams could not be loaded for ${assignment.title}. Please reload Projects.`);
   const names=(result.groups||[]).filter(group=>group.members?.some(member=>member.userId===userId)).map(group=>group.name);
   if(names.length)context+=` · ${names.join(', ')}`;
  }
  const language=classroomLanguage(assignment.language);
  return {kind:'assignment' as const,id:assignment.id,title:assignment.title,href:`/classroom/${cls.id}/assignments/${assignment.id}`,category:'Assignments' as const,language:CLASSROOM_LANGUAGES[language].label,languageId:language,context};
 });
 work.push(...assignments);
 const opened=new Map(history.map(entry=>[`${entry.kind}:${entry.target_id}`,entry.last_opened_at]));
 for(const workspace of work)workspace.lastOpenedAt=opened.get(`${workspace.kind}:${workspace.id}`);
 return work;
}

export async function lastAccessibleWorkspace(userId:string):Promise<SavedWorkspace|null>{
 for(const entry of await workspaceHistory(userId)){const workspace=await accessibleWorkspace(userId,entry.kind,entry.target_id);if(workspace)return {...workspace,lastOpenedAt:entry.last_opened_at};}
 return null;
}
