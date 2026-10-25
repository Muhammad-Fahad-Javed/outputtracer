/**
 * Real NASM/DOSBox integration checks, using the pinned runtime's Node adapter.
 * Run from the repository root: node --import tsx scripts/test-browser-dosbox.mjs
 * No compilation server, network requests, credentials or custom 8086 engine.
 * Browser worker/canvas behavior is also checked separately in the visible UI.
 */
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createDosbox, readDosArtifacts } from '../src/lib/dosbox/runtime.ts';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
require(root+'/public/dosbox/emulators-8.5.2/emulators.js');
const emu=globalThis.emulators;
globalThis.window={emulators:emu,addEventListener(){},removeEventListener(){}};
const bundleOrig=emu.bundle.bind(emu);emu.bundle=()=>{emu.pathPrefix=root+'/public/dosbox/emulators-8.5.2/';return bundleOrig()};
const orig=emu.dosboxNode.bind(emu);emu.dosboxWorker=(init)=>{emu.pathPrefix=root+'/public/dosbox/emulators-8.5.2/';return orig(init)};
globalThis.fetch=async(path)=>{const bytes=await fs.readFile(root+'/public'+path);return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}};
const examples=[
{name:'arithmetic SHL MUL DIV',src:`org 100h
mov ax,6
mov bx,7
mul bx
shl ax,1
mov bx,2
xor dx,dx
div bx
add al,0
mov [value],al
mov ah,3ch
xor cx,cx
mov dx,file
int 21h
mov bx,ax
mov ah,40h
mov cx,1
mov dx,value
int 21h
mov ah,3eh
int 21h
int 20h
file db 'OUTPUT/ANSWER.BIN',0
value db 0`,expected:[42],output:'OUTPUT/ANSWER.BIN'},
{name:'binary input/output',src:`org 100h
mov ax,3d00h
mov dx,input
int 21h
mov bx,ax
mov ah,3fh
mov cx,4
mov dx,buffer
int 21h
mov ah,3eh
int 21h
mov ah,3ch
xor cx,cx
mov dx,output
int 21h
mov bx,ax
mov ah,40h
mov cx,4
mov dx,buffer
int 21h
mov ah,3eh
int 21h
int 20h
input db 'INPUT/DATA.BIN',0
output db 'OUTPUT/COPY.BIN',0
buffer times 4 db 0`,assets:{'DATA.BIN':{base64:'AP+AKg=='}},expected:[0,255,128,42],output:'OUTPUT/COPY.BIN'},
{name:'DOS character, non-echo and buffered line input',src:`org 100h
mov ah,01h
int 21h
mov [chars],al
mov ah,08h
int 21h
mov [chars+1],al
mov dx,buf
mov ah,0ah
int 21h
mov ah,3ch
xor cx,cx
mov dx,output
int 21h
mov bx,ax
mov ah,40h
mov cx,2
mov dx,chars
int 21h
mov ah,40h
xor cx,cx
mov cl,[buf+1]
mov dx,buf+2
int 21h
mov ah,3eh
int 21h
int 20h
output db 'OUTPUT/INPUT.TXT',0
chars db 0,0
buf db 20,0
 times 21 db 0`,keys:[65,66,32,32,72,73,32,32,257],expected:[97,98,32,32,104,105,32,32],output:'OUTPUT/INPUT.TXT'},
{name:'NASM invalid instruction diagnostic',src:'org 100h\nnot_an_instruction ax,bx',failure:true},
];
(async()=>{for(const ex of examples){let {ci,sourcePaths}=await createDosbox({'main.asm':ex.src},ex.assets);await new Promise(resolve=>setTimeout(resolve,1500));if(ex.keys){for(let i=0;i<30;i++){const t=await ci.fsTree();if(t.nodes?.find((n)=>n.name==='OTSYS')?.nodes?.some((n)=>n.name==='READY.TXT'))break;await new Promise(resolve=>setTimeout(resolve,200));}}if(ex.keys)for(const key of ex.keys){ci.simulateKeyPress(key);await new Promise(resolve=>setTimeout(resolve,60));}await new Promise(resolve=>setTimeout(resolve,1000));const tree=await ci.fsTree();const names=tree.nodes?.find((n)=>n.name==='OTSYS')?.nodes?.map((n)=>n.name)||[];if(ex.failure){let log=new TextDecoder().decode(await ci.fsReadFile('BUILD.LOG'));if(!names.includes('FAILED.TXT')||!log.includes('error'))throw Error('missing diagnostic '+log);console.log('PASS',ex.name,log.trim())}else{if(!names.includes('DONE.TXT'))throw Error('not done '+JSON.stringify(names));if(names.includes('EXITERR.TXT'))throw Error('unexpected error exit '+ex.name);let artifacts=await readDosArtifacts(ci,sourcePaths);let actual=Array.from(artifacts[ex.output]||[]);if(JSON.stringify(actual)!==JSON.stringify(ex.expected))throw Error('wrong output '+JSON.stringify(actual));console.log('PASS',ex.name,actual)}await ci.exit();}process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
