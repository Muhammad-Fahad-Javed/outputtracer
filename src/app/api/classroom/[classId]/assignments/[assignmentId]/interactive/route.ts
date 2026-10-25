import {NextResponse} from 'next/server';
import {classroomRequestUser} from '@/lib/classroom/requestUser';
import {getClassroom} from '@/lib/classroom/classroomService';
import {resolveClassroomDocument} from '@/lib/classroom/documents';
import {sessionManager} from '@/lib/asm/session';
import {globalRateLimiter} from '@/lib/rateLimit';
export async function POST(request:Request,{params}:{params:Promise<{classId:string;assignmentId:string}>}){
 const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});if(!globalRateLimiter.check(`interactive:${u.id}`,120,60000).ok)return NextResponse.json({error:'Execution request limit reached'},{status:429});
 const {classId,assignmentId}=await params;let b;try{b=await request.json();}catch{return NextResponse.json({error:'Invalid execution request'},{status:400});}
 if(!b||typeof b!=='object'||Array.isArray(b))return NextResponse.json({error:'Invalid execution request'},{status:400});
 const existing=typeof b.sessionId==='string'?sessionManager.authorize(b.sessionId,b.sessionToken):undefined;
 if(existing&&(!existing.scope||existing.scope.actorId!==u.id||existing.scope.classId!==classId||existing.scope.assignmentId!==assignmentId))return NextResponse.json({error:'Private execution session unavailable'},{status:403});
 if(b.action==='stop'&&existing){sessionManager.deleteSession(existing.id);return NextResponse.json({success:true});}
 const cls=await getClassroom(u.id,classId);if(!cls.success){if(existing)sessionManager.deleteSession(existing.id);return NextResponse.json({error:cls.error},{status:403});}
 const resolved=await resolveClassroomDocument({actorId:u.id,classroomId:classId,assignmentId,isTeacher:Boolean(cls.isTeacher),groupId:typeof b.groupId==='string'?b.groupId:undefined,studentId:typeof b.studentId==='string'?b.studentId:undefined});
 if(!resolved.ok||resolved.doc.language!=='asm8086'){if(existing)sessionManager.deleteSession(existing.id);return NextResponse.json({error:resolved.ok?'NASM assignments only':resolved.error},{status:403});}
 if(existing)sessionManager.deleteSession(existing.id);
 return NextResponse.json({success:false,code:'browser_execution_required',error:'Assembly projects now run in the browser DOSBox console. Server execution sessions are unavailable.'},{status:409});
}
