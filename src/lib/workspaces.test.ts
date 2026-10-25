import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({history:[] as {kind:string;target_id:string;last_opened_at:string}[],projects:new Map<string,{id:string;title:string;owner_id:string;group_id:null;standard:string|null;language?:string}>(),roles:new Map<string,string>(),deniedAssignment:false,queryError:false,projectListGate:null as Promise<void>|null,historyReads:0}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:()=>{let id='';const q={select:()=>q,eq:(_key:string,value:string)=>{id=value;return q;},order:async()=>{await state.projectListGate;return {data:[...state.projects.values()],error:state.queryError?{message:'offline'}:null};},maybeSingle:async()=>({data:state.projects.get(id)||null,error:state.queryError?{message:'offline'}:null})};return q;},rpc:async(_name:string,{pid}:{pid:string})=>({data:state.roles.get(pid)||null,error:null})})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{const q={select:()=>q,eq:()=>q,order:()=>q,limit:async()=>{state.historyReads++;return {data:state.history,error:null};},maybeSingle:async()=>({data:table==='classroom_assignments'?{classroom_id:'class'}:null,error:null})};return q;}})}));
vi.mock('@/lib/classroom/classroomService',()=>({getAssignment:async()=>state.deniedAssignment?{success:false}:{success:true,isTeacher:false,assignment:{title:'Assignment',language:'python'}},getClassroom:async()=>({classroom:{name:'Python class'}}),listAssignments:vi.fn(),listUserClassrooms:vi.fn(),listClassroomGroups:vi.fn()}));
vi.mock('@/lib/classroom/documents',()=>({resolveClassroomDocument:async()=>({ok:!state.deniedAssignment})}));
import {lastAccessibleWorkspace,accessibleWorkspace,projectWorkspaceCategory,allWorkspaces} from './workspaces';
import {listAssignments,listUserClassrooms,listClassroomGroups} from '@/lib/classroom/classroomService';
import type {Classroom,ClassroomAssignment,ClassroomGroup} from '@/lib/classroom/types';
beforeEach(()=>{state.history=[];state.projects.clear();state.roles.clear();state.deniedAssignment=false;state.queryError=false;state.projectListGate=null;state.historyReads=0;vi.mocked(listUserClassrooms).mockReset().mockResolvedValue({success:true,teaching:[],enrolled:[]});vi.mocked(listAssignments).mockReset().mockResolvedValue({success:true,assignments:[]});vi.mocked(listClassroomGroups).mockReset().mockResolvedValue({success:true,groups:[]});});
describe('saved workspace resume',()=>{
 it('skips deleted and revoked projects and resumes the next accessible shared workspace',async()=>{for(const id of ['revoked','shared'])state.projects.set(id,{id,title:id,owner_id:'other',group_id:null,standard:'c++17'});state.roles.set('shared','editor');state.history=['deleted','revoked','shared'].map(target_id=>({kind:'project',target_id,last_opened_at:'2026-10-24'}));expect((await lastAccessibleWorkspace('student'))?.href).toBe('/p/shared');});
 it('resumes accessible assignments and falls back when access was revoked',async()=>{state.history=[{kind:'assignment',target_id:'assignment',last_opened_at:'2026-10-24'}];expect((await lastAccessibleWorkspace('student'))?.language).toContain('Python');state.deniedAssignment=true;expect(await lastAccessibleWorkspace('student')).toBeNull();});
 it('reports a database outage rather than treating it as revoked access',async()=>{state.queryError=true;await expect(accessibleWorkspace('student','project','project')).rejects.toThrow('could not be verified');});
 it('shows saved Python and NASM languages without a C++ badge',async()=>{for(const language of ['python','asm8086']){state.projects.set(language,{id:language,title:language,owner_id:'student',group_id:null,standard:null,language});state.roles.set(language,'owner');const workspace=await accessibleWorkspace('student','project',language);expect(workspace?.languageId).toBe(language);expect(workspace?.language).not.toContain('C++');}});
 it('does not silently reopen unknown project languages as C++',async()=>{state.projects.set('unknown',{id:'unknown',title:'unknown',owner_id:'student',group_id:null,standard:null,language:'javascript'});state.roles.set('unknown','owner');await expect(accessibleWorkspace('student','project','unknown')).rejects.toThrow('not supported');});
 it('lists a project shared by its owner under Shared projects',()=>{expect(projectWorkspaceCategory({owner_id:'student',group_id:null,project_members:[{count:2}]},'student')).toBe('Shared projects');expect(projectWorkspaceCategory({owner_id:'student',group_id:null,project_members:[{count:1}]},'student')).toBe('Personal projects');expect(projectWorkspaceCategory({owner_id:'student',group_id:'group',project_members:[{count:1}]},'student')).toBe('Shared projects');});
});

describe('saved workspace library reads',()=>{
 it('starts projects, classroom and history reads independently',async()=>{
  let release!:()=>void;
  state.projectListGate=new Promise<void>(resolve=>{release=resolve;});
  const pending=allWorkspaces('student');
  await Promise.resolve();await Promise.resolve();
  expect(listUserClassrooms).toHaveBeenCalledWith('student');
  expect(state.historyReads).toBe(1);
  release();expect(await pending).toEqual([]);
 });
 it('loads at most four class lists and team scopes at once while keeping stable order and deduplicating classes',async()=>{
  const teaching={id:'teacher-class',name:'Teaching'} as Classroom;
  const enrolled=Array.from({length:7},(_,index)=>({id:`class-${index}`,name:`Class ${index}`} as Classroom));
  vi.mocked(listUserClassrooms).mockResolvedValue({success:true,teaching:[teaching],enrolled:[...enrolled,{...teaching,name:'Duplicate name'}]});
  let activeLists=0,maxLists=0,activeGroups=0,maxGroups=0;
  vi.mocked(listAssignments).mockImplementation(async(_userId,classId)=>{
   activeLists++;maxLists=Math.max(maxLists,activeLists);
   await new Promise<void>(resolve=>setImmediate(resolve));activeLists--;
   return {success:true,assignments:[{id:`assignment-${classId}`,title:classId,language:'asm8086',groupMode:true} as ClassroomAssignment]};
  });
  vi.mocked(listClassroomGroups).mockImplementation(async(_userId,classId,assignmentId)=>{
   activeGroups++;maxGroups=Math.max(maxGroups,activeGroups);
   await new Promise<void>(resolve=>setImmediate(resolve));activeGroups--;
   return {success:true,groups:[{name:`Team ${classId}`,assignmentId,members:[{userId:'student'}]} as ClassroomGroup,{name:'Other student team',members:[{userId:'other'}]} as ClassroomGroup]};
  });
  state.history=[{kind:'assignment',target_id:'assignment-class-3',last_opened_at:'2026-10-26'}];
  const workspaces=await allWorkspaces('student');
  expect(maxLists).toBe(4);expect(maxGroups).toBe(4);
  expect(listAssignments).toHaveBeenCalledTimes(8);
  expect(workspaces.map(workspace=>workspace.id)).toEqual(['teacher-class',...enrolled.map(cls=>cls.id)].map(id=>`assignment-${id}`));
  expect(workspaces[0].context).toBe('Teaching');
  expect(listClassroomGroups).toHaveBeenCalledTimes(7);
  expect(listClassroomGroups).toHaveBeenCalledWith('student','class-3','assignment-class-3');
  expect(workspaces[4].context).toBe('Class 3 · Team class-3');
  expect(workspaces[4].lastOpenedAt).toBe('2026-10-26');
  expect(workspaces.some(workspace=>workspace.context?.includes('Other student team'))).toBe(false);
 });
 it('preserves personal work when class access was revoked, and reports unresolved team reads',async()=>{
  state.projects.set('personal',{id:'personal',title:'Personal',owner_id:'student',group_id:null,standard:'c++17'});
  vi.mocked(listUserClassrooms).mockResolvedValue({success:true,teaching:[],enrolled:[{id:'class',name:'Class'} as Classroom]});
  vi.mocked(listAssignments).mockResolvedValueOnce({success:false,error:'Access revoked'});
  expect((await allWorkspaces('student')).map(workspace=>workspace.id)).toEqual(['personal']);
  vi.mocked(listAssignments).mockResolvedValue({success:true,assignments:[{id:'team-work',title:'Team work',language:'python',groupMode:true} as ClassroomAssignment]});
  vi.mocked(listClassroomGroups).mockResolvedValue({success:false,error:'Database unavailable'});
  await expect(allWorkspaces('student')).rejects.toThrow('Teams could not be loaded for Team work');
 });
});
