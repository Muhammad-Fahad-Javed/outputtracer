import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {accessibleWorkspace} from '@/lib/workspaces';
import {isUuid} from '@/lib/cloud/roles';
export async function POST(request:Request){const c=await createClient();const u=c?(await c.auth.getUser()).data.user:null;if(!u)return NextResponse.json({error:'Sign in required'},{status:401});try{const b=await request.json();if(!['project','assignment'].includes(b.kind)||!isUuid(b.id))return NextResponse.json({error:'Invalid workspace'},{status:400});const work=await accessibleWorkspace(u.id,b.kind,b.id);if(!work)return NextResponse.json({error:'Workspace unavailable'},{status:403});const a=createAdminClient();if(!a)throw Error();const {error}=await a.from('workspace_history').upsert({user_id:u.id,kind:b.kind,target_id:b.id,last_opened_at:new Date().toISOString()},{onConflict:'user_id,kind,target_id'});if(error)throw error;return NextResponse.json({success:true});}catch{return NextResponse.json({error:'Could not save resume history'},{status:503});}}
