import { NextResponse } from 'next/server';
import { classroomRequestUser } from '@/lib/classroom/requestUser';
import { createAssignmentTeam,listClassroomGroups } from '@/lib/classroom/classroomService';
type Context={params:Promise<{classId:string;assignmentId:string}>};
export async function GET(_request:Request,{params}:Context){const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});const {classId,assignmentId}=await params;const result=await listClassroomGroups(u.id,classId,assignmentId);return NextResponse.json(result,{status:result.success?200:403});}
export async function POST(request:Request,{params}:Context){const u=await classroomRequestUser();if(!u)return NextResponse.json({error:'Sign in required'},{status:401});const {classId,assignmentId}=await params;try{const body=await request.json();if(typeof body.name!=='string'||(body.studentIds&&!Array.isArray(body.studentIds))||(body.emails&&!Array.isArray(body.emails))||(body.groupId&&typeof body.groupId!=='string')||(request.method==='PUT'&&!body.groupId))throw Error('Invalid team details');const result=await createAssignmentTeam(u.id,classId,assignmentId,body);return NextResponse.json(result,{status:result.success?200:400});}catch{return NextResponse.json({error:'Invalid team details'},{status:400});}}

export async function PUT(request:Request,context:Context){return POST(request,context);}
