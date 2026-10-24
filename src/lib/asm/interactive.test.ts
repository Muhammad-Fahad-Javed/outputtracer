import {describe,it,expect} from 'vitest';
import {AsmSession} from './session';
function session(source:string,maxSteps=2000){const s=new AsmSession('id','token',source,maxSteps);s.cpu.interactiveInput=true;expect(s.assembleSync().success).toBe(true);return s;}
describe('interactive DOS input',()=>{
 it('waits without advancing IP, echoes character input, and pauses again for non-echo input',async()=>{
  const s=session('org 100h\nmov ah,1\nint 21h\nmov bl,al\nmov ah,8\nint 21h\nmov cl,al\nhlt');
  let status=await s.runUntilBlocked();expect(status.state).toBe('waiting_for_input');expect(status.stdout).toBe('');
  const ip=s.cpu.ip;s.run(20);expect(s.cpu.ip).toBe(ip);
  s.provideInput('A');status=await s.runUntilBlocked();expect(status.inputRequest).toBe('character_no_echo');expect(status.stdout).toBe('A');expect(s.cpu.bl).toBe(65);
  s.provideInput('x');status=await s.runUntilBlocked();expect(s.cpu.cl).toBe(120);expect(status.stdout).toBe('A');expect(status.state).not.toBe('waiting_for_input');
 });
 it('preserves spaces and empty buffered input across multiple prompts',async()=>{
  const s=session('org 100h\nmov dx,buffer\nmov ah,0ah\nint 21h\nmov bl,[buffer+1]\nmov ah,0ah\nint 21h\nhlt\nbuffer db 20,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0');
  expect((await s.runUntilBlocked()).inputRequest).toBe('line');s.provideInput(' a ');
  expect((await s.runUntilBlocked()).inputRequest).toBe('line');expect(s.cpu.bl).toBe(3);
  s.provideInput('');await s.runUntilBlocked();expect(s.cpu.stdout).toContain(' a ');
 });
 it('retains its execution budget across resumes and clears input on reset',async()=>{
  const s=session('org 100h\nagain: mov ah,1\nint 21h\njmp again',12);
  for(let i=0;i<5&&!s.executionError;i++){await s.runUntilBlocked();if(s.cpu.inputRequest())s.provideInput('z');}
  await s.runUntilBlocked();expect(s.executionError).toContain('limit');s.reset();expect(s.executionError).toBeUndefined();expect(s.cpu.stdinBuffer).toBe('');expect(s.executedSteps).toBe(0);
 });
 it('rejects invalid input and keeps grading in deterministic buffered mode',()=>{
  const s=session('org 100h\nmov ah,1\nint 21h\nhlt');s.run(10);expect(()=>s.provideInput('ab')).toThrow();expect(()=>s.provideInput('🙂')).toThrow();
  const grading=new AsmSession('grade','token','org 100h\nmov ah,1\nint 21h\nhlt',100,'G');expect(grading.assembleSync().success).toBe(true);grading.run(100);expect(grading.cpu.stdout).toBe('G');expect(grading.cpu.inputRequest()).toBeUndefined();
 });
});
