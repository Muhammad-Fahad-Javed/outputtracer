import {describe,it,expect,vi} from 'vitest';
import {activateTeacherProfile} from './teacherActivation';
describe('teacher access requires administrator approval',()=>{
 it('never invokes the privilege-granting RPC, including with a valid client',async()=>{
  const rpc=vi.fn().mockResolvedValue({error:null});
  expect(await activateTeacherProfile({rpc})).toEqual({success:false,error:expect.stringContaining('Administrator approval')});
  expect(rpc).not.toHaveBeenCalled();
 });
 it('fails closed without a database client',async()=>{expect((await activateTeacherProfile(null)).success).toBe(false);});
});
