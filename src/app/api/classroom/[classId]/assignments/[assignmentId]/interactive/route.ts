import {NextResponse} from 'next/server';
import {classroomRequestUser} from '@/lib/classroom/requestUser';
import {getClassroom} from '@/lib/classroom/classroomService';
import {resolveClassroomDocument} from '@/lib/classroom/documents';
import {loadCanonicalClassroomFiles} from '@/lib/classroom/classroomRun';
import {studentEditDenial} from '@/lib/classroom/assignmentPolicy';
import {sessionManager} from '@/lib/asm/session';
import {hashCodeFiles} from '@/lib/classroom/versioningService';
import {globalRateLimiter} from '@/lib/rateLimit';
export async function POST(request:Request,{params}:{params:Promise<{classId:string;assignmentId:string}>}){
 const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});if(!globalRateLimiter.check(`interactive:${u.id}`,120,60000).ok)return NextResponse.json({error:'Execution request limit reached'},{status:429});
 const {classId,assignmentId}=await params;let b;try{b=await request.json();}catch{return NextResponse.json({error:'Invalid execution request'},{status:400});}
 const existing=typeof b.sessionId==='string'?sessionManager.authorize(b.sessionId,b.sessionToken):undefined;
 if(existing&&(!existing.scope||existing.scope.actorId!==u.id||existing.scope.classId!==classId||existing.scope.assignmentId!==assignmentId))return NextResponse.json({error:'Private execution session unavailable'},{status:403});
 if(b.action==='stop'&&existing){sessionManager.deleteSession(existing.id);return NextResponse.json({success:true});}
 const cls=await getClassroom(u.id,classId);if(!cls.success){if(existing)sessionManager.deleteSession(existing.id);return NextResponse.json({error:cls.error},{status:403});}
 const resolved=await resolveClassroomDocument({actorId:u.id,classroomId:classId,assignmentId,isTeacher:Boolean(cls.isTeacher),groupId:typeof b.groupId==='string'?b.groupId:undefined,studentId:typeof b.studentId==='string'?b.studentId:undefined});
 if(!resolved.ok||resolved.doc.language!=='asm8086'){if(existing)sessionManager.deleteSession(existing.id);return NextResponse.json({error:resolved.ok?'NASM assignments only':resolved.error},{status:403});}
 const doc=resolved.doc;if(!cls.isTeacher&&(studentEditDenial(doc)||!doc.allowRun)){if(existing)sessionManager.deleteSession(existing.id);return NextResponse.json({error:'Your teacher has disabled execution or editing.'},{status:403});}
 if(existing&&existing.scope?.docKey!==doc.docKey)return NextResponse.json({error:'Session belongs to a different document'},{status:403});
 try{
 let session=existing;
 if(b.action==='start'){if(existing)sessionManager.deleteSession(existing.id);const files=await loadCanonicalClassroomFiles(doc);const source=files['main.asm'];if(typeof source!=='string'||Buffer.byteLength(source)>65536)return NextResponse.json({error:'main.asm must be at most 64 KB'},{status:400});session=sessionManager.createSession({source,maxSteps:5000,ownerKey:`classroom:${u.id}`,interactiveInput:true});session.scope={actorId:u.id,docKey:doc.docKey,classId,assignmentId,sourceRevision:hashCodeFiles(files)};const assembled=await session.assemble();if(!assembled.success){sessionManager.deleteSession(session.id);return NextResponse.json({error:'Assembly failed',diagnostics:assembled.diagnostics},{status:400});}await session.runUntilBlocked(doc.timeLimitMs);}
 else if(!session)return NextResponse.json({error:'Session expired. Start a new run.'},{status:404});
 else if(b.action==='input'){if(typeof b.input!=='string')throw Error('Input text is required.');session.provideInput(b.input);await session.runUntilBlocked(doc.timeLimitMs);}
 else if(b.action!=='status')return NextResponse.json({error:'Unknown execution action'},{status:400});
 return NextResponse.json({success:true,sessionId:session!.id,sessionToken:session!.token,sourceRevision:session!.scope?.sourceRevision,status:session!.getStatus()});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Execution failed'},{status:400});}
}
