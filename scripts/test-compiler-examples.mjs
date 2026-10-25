#!/usr/bin/env node
/**
 * Small, sequential execution checks. No coursework or accounts are created.
 * Run from a checkout containing dependencies. Python HTTP needs the existing
 * disposable QA account file and server-side Supabase env; credentials never
 * appear in reports. Example on the host:
 * node --env-file=.env.production.local scripts/test-compiler-examples.mjs 
 *   --base=http://127.0.0.1:3000 --mode=buffered --report=/tmp/compiler-results.json
 * --mode=ws exercises the actual terminal protocol (including EOF and Stop).
 * --mode=interactive exercises NASM waiting/resume without pre-supplied input.
 */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const [key, ...value] = arg.replace(/^--/, '').split('='); return [key, value.join('=') || true];
}));
const base = String(args.base || process.env.QA_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const origin = String(args.origin || process.env.QA_ORIGIN || 'https://outputtracer.com');
const mode = args.mode || 'buffered';
const selected = String(args.languages || 'cpp,python,nasm').split(',');
const require = createRequire(resolve(process.env.QA_PROJECT_ROOT || process.cwd(), 'package.json'));
const normalize = value => String(value ?? '').replace(/\r\n/g, '\n');
const results = [];
let actor;
let lastTerminalStart = 0;

export const examples = {
  cpp: [
    { name: 'hello', files: { 'main.cpp': '#include <iostream>\nint main(){std::cout << "Hello, C++!\\n";}' }, stdin: '', expected: 'Hello, C++!\n' },
    { name: 'arithmetic and loop', files: { 'main.cpp': '#include <iostream>\nint main(){int total=0;for(int i=1;i<=5;i++)total+=i;std::cout << "sum=" << total << ", factorial=";int product=1;for(int i=1;i<=5;i++)product*=i;std::cout << product << "\\n";}' }, stdin: '', expected: 'sum=15, factorial=120\n' },
    { name: 'spaces, empty line and multiline input', files: { 'main.cpp': '#include <iostream>\n#include <string>\nint main(){std::string a,b,c;std::getline(std::cin,a);std::getline(std::cin,b);std::getline(std::cin,c);std::cout<<"["<<a<<"]\\n["<<b<<"]\\n["<<c<<"]\\n";}' }, stdin: '  Ada Lovelace  \n\nsecond line\n', expected: '[  Ada Lovelace  ]\n[]\n[second line]\n' },
    { name: 'multiple prompts and function call', files: { 'main.cpp': '#include <iostream>\n#include <string>\nint twice(int n){return n*2;}\nint main(){std::string name;int n;std::cout<<"Name: "<<std::flush;std::getline(std::cin,name);std::cout<<"Number: "<<std::flush;std::cin>>n;std::cout<<name<<": "<<twice(n)<<"\\n";}' }, stdin: 'Grace Hopper\n21\n', expected: 'Name: Number: Grace Hopper: 42\n', turns: [{ prompt: 'Name: ', data: 'Grace Hopper\n' }, { prompt: 'Number: ', data: '21\n' }] },
  ],
  python: [
    { name: 'hello', files: { 'main.py': 'print("Hello, Python!")\n' }, stdin: '', expected: 'Hello, Python!\n' },
    { name: 'arithmetic and loop', files: { 'main.py': 'total = sum(range(1, 6))\nproduct = 1\nfor n in range(1, 6):\n    product *= n\nprint(f"sum={total}, factorial={product}")\n' }, stdin: '', expected: 'sum=15, factorial=120\n' },
    { name: 'spaces, empty line and multiline input', files: { 'main.py': 'for _ in range(3):\n    print("[" + input() + "]")\n' }, stdin: '  Ada Lovelace  \n\nsecond line\n', expected: '[  Ada Lovelace  ]\n[]\n[second line]\n' },
    { name: 'multiple prompts and function call', files: { 'main.py': 'def twice(n):\n    return n * 2\nname = input("Name: ")\nn = int(input("Number: "))\nprint(f"{name}: {twice(n)}")\n' }, stdin: 'Grace Hopper\n21\n', expected: 'Name: Number: Grace Hopper: 42\n', turns: [{ prompt: 'Name: ', data: 'Grace Hopper\n' }, { prompt: 'Number: ', data: '21\n' }] },
  ],
  nasm: [
    { name: 'hello', code: 'org 100h\nmov dx,message\nmov ah,09h\nint 21h\nmov ax,4c00h\nint 21h\nmessage db "Hello, NASM!",13,10,"$"', stdin: '', expected: 'Hello, NASM!\n' },
    { name: 'arithmetic and loop', code: 'org 100h\nmov cx,5\nmov bl,0\nsum_loop:\nadd bl,cl\nloop sum_loop\nmov dl,bl\nadd dl,30h\nsub dl,10\nmov ah,2\nint 21h\nmov cx,3\nmov dl,"!"\nprint_loop:\nint 21h\nloop print_loop\nmov ax,4c00h\nint 21h', stdin: '', expected: '5!!!' },
    { name: 'buffered input preserves spaces', code: 'org 100h\nmov dx,prompt\nmov ah,09h\nint 21h\nmov dx,buffer\nmov ah,0ah\nint 21h\nmov ax,4c00h\nint 21h\nprompt db "Line: $"\nbuffer db 80,0\ntimes 80 db 0', stdin: '  Ada Lovelace  \n', expected: 'Line:   Ada Lovelace  \n' },
    { name: 'echo character and private character prompts', code: 'org 100h\nmov dx,first\nmov ah,9\nint 21h\nmov ah,1\nint 21h\nmov bl,al\nmov dx,second\nmov ah,9\nint 21h\nmov ah,8\nint 21h\nmov cl,al\nmov ax,4c00h\nint 21h\nfirst db "Character: $"\nsecond db " Private: $"', stdin: 'Ax', expected: 'Character: A Private: ', turns: [{ mode: 'character', data: 'A' }, { mode: 'character_no_echo', data: 'x' }] },
  ],
};

async function login() {
  if (actor) return actor;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Private QA authentication environment is unavailable');
  const accountPath = process.env.QA_ACCOUNT_PATH || '/home/ec2-user/.outputtracer-test-accounts.json';
  const account = JSON.parse(await readFile(accountPath, 'utf8')).accounts.student;
  if (!account?.email) throw Error('Existing disposable student account is unavailable');
  const { createServerClient } = require('@supabase/ssr');
  const { createClient } = require('@supabase/supabase-js');
  const jar = new Map();
  const client = createServerClient(url, anon, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: rows => rows.forEach(row => jar.set(row.name, row.value)) } });
  const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: issued, error: issueError } = await service.auth.admin.generateLink({ type: 'magiclink', email: account.email });
  if (issueError) throw Error('Could not issue disposable QA session');
  const { data, error } = await client.auth.verifyOtp({ type: 'magiclink', token_hash: issued.properties.hashed_token });
  if (error || !data.session) throw Error('Could not authenticate disposable QA session');
  actor = { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '), accessToken: data.session.access_token };
  return actor;
}

async function post(path, body, authenticated = false) {
  const auth = authenticated ? await login() : null;
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...(auth ? { Cookie: auth.cookie } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(35000) });
  const data = await response.json();
  if (!response.ok) throw Error(`HTTP ${response.status}: ${typeof data.error === 'string' ? data.error : data.error?.message || 'request failed'}`);
  return data;
}

async function buffered(language, example, invalid = false) {
  if (language === 'cpp') {
    const result = await post('/api/predict', { files: example.files, stdin: example.stdin, trace: false });
    return { output: result.output || '', rejected: result.status === 'error' && result.error?.kind === 'compile_error', status: result.status, exitCode: result.meta?.exitCode, diagnostic: result.error?.kind };
  }
  if (language === 'python') {
    const result = await post('/api/python', { code: example.files['main.py'], stdin: example.stdin, language: 'python' }, true);
    if (!result.ok) throw Error(result.error?.message || 'Python request failed');
    return { output: result.result.stdout, rejected: result.result.status === 'syntax_error', status: result.result.status, exitCode: result.result.exitCode, diagnostic: invalid ? result.result.stderr?.slice(0, 300) : undefined };
  }
  let session;
  try {
    session = await post('/api/asm', { action: 'create', source: example.code, stdin: example.stdin });
    if (!session.success) return { output: session.status?.stdout || '', rejected: true, status: 'assemble_error', diagnostic: session.assembleResult?.diagnostics?.slice(0, 2) };
    const token = { sessionId: session.sessionId, sessionToken: session.sessionToken };
    let result;
    for (let i = 0; i < 5; i++) {
      result = await post('/api/asm', { action: 'run', ...token, limit: 1000 });
      if (['terminated', 'halted', 'error', 'waiting_for_input'].includes(result.status.state)) break;
    }
    return { output: result.status.stdout, status: result.status.state, exitCode: result.status.exitCode, rejected: false };
  } finally {
    if (session?.sessionId && session?.sessionToken) await post('/api/asm', { action: 'stop', sessionId: session.sessionId, sessionToken: session.sessionToken });
  }
}

async function terminal(language, example, invalid = false, action) {
  // Honor the real eight-starts/minute IP limit instead of disabling it for QA.
  const wait = 8000 - (Date.now() - lastTerminalStart);
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
  lastTerminalStart = Date.now();
  const { WebSocket } = require('ws');
  const auth = language === 'python' ? await login() : null;
  return new Promise((resolveResult, reject) => {
    const url = new URL('/ws/terminal', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url, { origin, handshakeTimeout: 10000 });
    let output = '', stderr = '', exitCode, rejected = false, status = 'connecting', turn = 0, failure, stopped = false;
    const timer = setTimeout(() => { ws.terminate(); reject(Error('Terminal check exceeded 35 seconds')); }, 35000);
    ws.on('open', () => ws.send(JSON.stringify({ language, files: example.files, ...(auth ? { accessToken: auth.accessToken } : {}) })));
    ws.on('error', error => { failure = /Unexpected server response: \d+/.exec(error.message)?.[0] || 'Terminal connection failed'; });
    ws.on('message', raw => {
      let message; try { message = JSON.parse(raw.toString()); } catch { failure = 'Invalid terminal response'; ws.close(); return; }
      if (message.type === 'stdout') output += message.data || '';
      if (message.type === 'stderr') stderr += message.data || '';
      if (message.type === 'ready') {
        status = 'ready';
        if (action === 'stop') { stopped = true; ws.send(JSON.stringify({ type: 'stop' })); }
        else if (!example.turns) { if (example.stdin) ws.send(JSON.stringify({ type: 'stdin', data: example.stdin })); if (action === 'eof') ws.send(JSON.stringify({ type: 'eof' })); }
      }
      while (example.turns?.[turn] && output.includes(example.turns[turn].prompt)) {
        ws.send(JSON.stringify({ type: 'stdin', data: example.turns[turn].data })); turn++;
      }
      if (message.type === 'compile_error') { rejected = true; status = 'compile_error'; stderr += message.data || ''; }
      if (message.type === 'error' || message.type === 'timeout' || message.type === 'output_limit') { failure = message.data || message.type; status = message.type; }
      if (message.type === 'exit') { exitCode = message.code; status = 'exited'; if (invalid && exitCode !== 0 && /SyntaxError/.test(stderr)) rejected = true; }
    });
    ws.on('close', () => {
      clearTimeout(timer);
      if (failure) { reject(Error(failure)); return; }
      if (action === 'stop' && !stopped) { reject(Error('Stop was not sent after program readiness')); return; }
      resolveResult({ output, exitCode, status: stopped ? 'stopped' : status, rejected, diagnostic: invalid ? stderr.slice(0, 300) : undefined });
    });
  });
}

async function nasmInteractive(example) {
  let session;
  try {
    session = await post('/api/asm', { action: 'create', source: example.code, stdin: '' });
    if (!session.success) return { output: '', rejected: true, status: 'assemble_error' };
    const token = { sessionId: session.sessionId, sessionToken: session.sessionToken };
    let result = await post('/api/asm', { action: 'run', ...token, limit: 1000 });
    const observedPauses = [];
    const turns = example.turns || (example.stdin ? [{ mode: 'line', data: example.stdin.replace(/\n$/, '') }] : []);
    for (const turn of turns) {
      observedPauses.push(result.status.inputRequest);
      if (result.status.state !== 'waiting_for_input' || result.status.inputRequest !== turn.mode) throw Error(`Expected ${turn.mode} input pause`);
      result = await post('/api/asm', { action: 'input', ...token, input: turn.data });
    }
    return { output: result.status.stdout, exitCode: result.status.exitCode, status: result.status.state, rejected: false, observedPauses };
  } finally {
    if (session?.sessionId && session?.sessionToken) await post('/api/asm', { action: 'stop', sessionId: session.sessionId, sessionToken: session.sessionToken });
  }
}

async function run(label, language, example, method, invalid = false, action) {
  const started = Date.now();
  try {
    const result = await (method === 'ws' ? terminal(language, example, invalid, action) : method === 'interactive' ? nasmInteractive(example) : buffered(language, example, invalid));
    const passed = invalid ? result.rejected : action === 'stop' ? result.status === 'stopped' : normalize(result.output) === example.expected && result.exitCode === 0;
    results.push({ label, language, method, passed, expected: invalid ? 'language error reported' : action === 'stop' ? 'program stopped' : example.expected, actual: result, durationMs: Date.now() - started });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${JSON.stringify(result)}`);
  } catch (error) {
    const detail = error?.message?.replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 350) || 'Check failed';
    results.push({ label, language, method, passed: false, error: detail, durationMs: Date.now() - started });
    console.log(`FAIL ${label}: ${detail}`);
  }
}

const invalid = {
  cpp: { files: { 'main.cpp': 'int main(){ this is invalid C++; }' }, stdin: '' },
  python: { files: { 'main.py': 'def broken(:\n    pass\n' }, stdin: '' },
  nasm: { code: 'org 100h\nnot_a_real_instruction ax,42', stdin: '' },
};

for (const method of mode === 'all' ? ['buffered', 'ws', 'interactive'] : [mode]) {
  for (const language of selected) {
    if (method === 'ws' && language === 'nasm') continue; // NASM uses the authenticated/resumable HTTP engine, not a host shell.
    if (method === 'interactive' && language !== 'nasm') continue;
    for (const example of examples[language] || []) await run(`${language}/${method}/${example.name}`, language, example, method);
    await run(`${language}/${method}/invalid code`, language, invalid[language], method, true);
    if (method === 'ws') {
      const eof = language === 'cpp'
        ? { files: { 'main.cpp': '#include <iostream>\n#include <string>\nint main(){std::string s;int count=0;while(std::getline(std::cin,s))++count;std::cout<<"lines="<<count<<"\\n";}' }, stdin: 'one\ntwo\n', expected: 'lines=2\n' }
        : { files: { 'main.py': 'import sys\nprint("lines=" + str(len(sys.stdin.readlines())))\n' }, stdin: 'one\ntwo\n', expected: 'lines=2\n' };
      await run(`${language}/ws/EOF`, language, eof, method, false, 'eof');
      const stop = language === 'cpp' ? { files: { 'main.cpp': '#include <iostream>\nint main(){int x;std::cin>>x;}' } } : { files: { 'main.py': 'input("Waiting: ")\n' } };
      await run(`${language}/ws/Stop`, language, stop, method, false, 'stop');
    }
  }
}
const report = { createdAt: new Date().toISOString(), base, mode, checks: results.length, passed: results.filter(result => result.passed).length, results };
if (args.report) await writeFile(String(args.report), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(`COMPLETE ${report.passed}/${report.checks} checks passed`);
process.exitCode = report.passed === report.checks ? 0 : 1;
