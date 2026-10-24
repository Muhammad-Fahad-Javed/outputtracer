import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({profile:null as null|{status:string;approved_by?:string},error:false}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:state.profile,error:state.error?{message:'offline'}:null})};return q;}})}));
import {checkIsVerifiedTeacher,_setMemoryTeacherProfile,_resetMemoryStores} from './roles';
beforeEach(()=>{_resetMemoryStores();state.profile=null;state.error=false;vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://example.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','anon');});
afterEach(()=>vi.unstubAllEnvs());
describe('production teacher approval checks',()=>{
 it('requires an approved status with administrator provenance',async()=>{for(const profile of [{status:'approved'},{status:'pending_review',approved_by:'admin'},{status:'suspended',approved_by:'admin'},{status:'revoked',approved_by:'admin'}]){state.profile=profile;expect(await checkIsVerifiedTeacher('teacher')).toBe(false);}state.profile={status:'approved',approved_by:'admin'};expect(await checkIsVerifiedTeacher('teacher')).toBe(true);});
 it('fails closed on outages rather than trusting memory or stale roles',async()=>{const now=new Date().toISOString();_setMemoryTeacherProfile('teacher',{userId:'teacher',status:'approved',createdAt:now,updatedAt:now,verifiedAt:now});state.profile={status:'approved',approved_by:'admin'};state.error=true;expect(await checkIsVerifiedTeacher('teacher')).toBe(false);});
});
