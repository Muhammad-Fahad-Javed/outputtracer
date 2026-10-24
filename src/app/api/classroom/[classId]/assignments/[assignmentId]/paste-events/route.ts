import { NextResponse } from 'next/server';
import { classroomRequestUser } from '@/lib/classroom/requestUser';
import { getAssignment } from '@/lib/classroom/classroomService';
import { resolveClassroomDocument } from '@/lib/classroom/documents';
import { recordActivityEvent,listActivityEvents } from '@/lib/classroom/versioningService';
import { globalRateLimiter } from '@/lib/rateLimit';
export async function POST(request:Request,{params}:{params:Promise<{classId:string;assignmentId:string}>}){
 const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});
 if(!globalRateLimiter.check(`paste:${u.id}`,30,60000).ok)return NextResponse.json({error:'Too many events'},{status:429});
 const {classId,assignmentId}=await params;const a=await getAssignment(u.id,classId,assignmentId);if(!a.success||a.isTeacher||a.assignment?.inputPolicy!=='paste_allowed')return NextResponse.json({error:'Paste is unavailable'},{status:403});
 const resolved=await resolveClassroomDocument({actorId:u.id,classroomId:classId,assignmentId,isTeacher:false});if(!resolved.ok)return NextResponse.json({error:resolved.error},{status:403});
 try{const b=await request.json();if(typeof b.file!=='string'||!Object.hasOwn(resolved.doc.starterCode,b.file)||!Number.isInteger(b.characterCount)||b.characterCount<1||b.characterCount>200*1024)throw Error();await recordActivityEvent({assignmentId,actorId:u.id,eventType:'paste',metadata:{file:b.file,characterCount:b.characterCount}});return NextResponse.json({success:true});}catch{return NextResponse.json({error:'Paste event could not be saved'},{status:503});}
}

export async function GET(_request:Request,{params}:{params:Promise<{classId:string;assignmentId:string}>}){
 const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});
 const {classId,assignmentId}=await params;const a=await getAssignment(u.id,classId,assignmentId);
 if(!a.success||!a.isTeacher)return NextResponse.json({error:'Teacher privileges required'},{status:403});
 try{return NextResponse.json({success:true,events:(await listActivityEvents(assignmentId)).filter(e=>e.eventType==='paste').slice(0,200)});}catch{return NextResponse.json({error:'Activity log unavailable'},{status:503});}
}
