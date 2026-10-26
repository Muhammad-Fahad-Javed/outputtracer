#!/usr/bin/env node
// Sequential, disposable QA fixtures only. Credentials and source data stay private.
// Uses generated magic links locally; it sends no email and never prints tokens.
import { createRequire } from 'node:module';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(resolve(process.env.QA_PROJECT_ROOT || process.cwd(), 'package.json'));
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');
const { WebSocket } = require('ws');
const Y = require('yjs');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:3101';
const origin = process.env.QA_ORIGIN || 'https://outputtracer.com';
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const reportPath = process.env.QA_REPORT_PATH || '/tmp/outputtracer-saved-project-language-results.json';
const report = { startedAt: new Date().toISOString(), base, fixtures: [], passed: [] };
const actors = [], sockets = [];
const stamp = Date.now().toString(36);
let service, lastConnection = 0, clientId = 70000;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(condition, label) { if (!condition) throw new Error(label); report.passed.push(label); console.log(`PASS ${label}`); }
async function until(predicate, label, timeout = 25000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(50); }
  throw new Error(`Timed out: ${label}`);
}
async function login(accounts, name) {
  if (!accounts[name]?.id || !accounts[name]?.email) throw new Error('Disposable QA account is missing');
  const jar = new Map();
  const client = createServerClient(url, anon, { auth: { autoRefreshToken: false }, cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: rows => rows.forEach(row => jar.set(row.name, row.value)),
  } });
  const issued = await service.auth.admin.generateLink({ type: 'magiclink', email: accounts[name].email });
  if (issued.error) throw new Error('QA sign-in link generation failed');
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: issued.data.properties.hashed_token });
  if (verified.error || verified.data.user?.id !== accounts[name].id || !verified.data.session) throw new Error('QA sign-in verification failed');
  const actor = { id: accounts[name].id, email: accounts[name].email, client, jar, token: verified.data.session.access_token };
  actors.push(actor); return actor;
}
async function rpc(actor, name, args) {
  const result = await actor.client.rpc(name, args);
  if (result.error) throw new Error(`QA RPC failed: ${name}`);
  return result.data;
}
async function http(actor, path, { body, method = body === undefined ? 'GET' : 'POST', json = true, redirect = 'follow' } = {}) {
  const response = await fetch(base + path, { method, redirect, signal: AbortSignal.timeout(120000), headers: {
    Origin: origin, Cookie: [...actor.jar].map(([name, value]) => `${name}=${value}`).join('; '),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = json ? await response.json() : await response.text();
  return { status: response.status, data, location: response.headers.get('location') };
}
async function savedProject(actor, language, { title = `QA saved ${language} ${stamp}`, groupId = null, legacy = false } = {}) {
  const args = { p_title: title, p_standard: language === 'cpp' ? 'c++20' : null, p_group: groupId, p_main: null };
  if (!legacy) args.p_language = language;
  const id = await rpc(actor, 'create_project', args);
  if (typeof id !== 'string') throw new Error('QA creation did not return a project');
  const fixture = { id, language, ownerId: actor.id, title, groupId, legacy };
  report.fixtures.push(fixture); return fixture;
}
async function sourceFiles(actor, id) {
  const result = await actor.client.from('project_files').select('path,content').eq('project_id', id);
  if (result.error) throw new Error('QA project files could not be read');
  return Object.fromEntries((result.data || []).map(row => [row.path, row.content]));
}
async function connect(payload, endpoint = '/ws/terminal') {
  // Production permits eight new connections per minute per IP. Stay below it.
  const delay = 8200 - (Date.now() - lastConnection); if (delay > 0) await pause(delay);
  lastConnection = Date.now();
  const address = new URL(endpoint, base); address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(address, { origin, handshakeTimeout: 15000 });
  const connection = { ws, events: [], doc: new Y.Doc(), closed: false, failed: false };
  connection.output = () => connection.events.filter(event => event.type === 'stdout').map(event => event.data || '').join('');
  sockets.push(connection);
  ws.on('open', () => ws.send(JSON.stringify(payload)));
  ws.on('message', raw => {
    let event; try { event = JSON.parse(String(raw)); } catch { connection.failed = true; return; }
    connection.events.push(event);
    if (event.type === 'init' && event.state) Y.applyUpdate(connection.doc, Buffer.from(event.state, 'base64'));
    if (event.type === 'update' && event.update) Y.applyUpdate(connection.doc, Buffer.from(event.update, 'base64'));
  });
  ws.on('error', () => { connection.failed = true; });
  ws.on('close', code => { connection.closed = true; connection.closeCode = code; });
  return connection;
}
async function join(actor, project, expectedRole = 'editor') {
  const connection = await connect({ type: 'join', projectId: project.id, token: actor.token, clientId: ++clientId }, '/ws/collab');
  await until(() => connection.events.some(event => event.type === 'init') || connection.closed || connection.failed, 'project collaboration join');
  const init = connection.events.find(event => event.type === 'init');
  check(init?.role === expectedRole && init.language === project.language && init.standard === (project.language === 'cpp' ? 'c++20' : null), `${project.language} collaboration returns canonical language and ${expectedRole} role`);
  return connection;
}
const send = (connection, message) => connection.ws.send(JSON.stringify(message));
const textAt = (connection, file) => connection.doc.getMap('files').get(file)?.toString();
const assetAt = (connection, file) => connection.doc.getMap('dosAssets').get(file)?.base64;
const encoded = doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
function textUpdate(connection, filename, code) {
  const value = connection.doc.getMap('files').get(filename);
  if (!(value instanceof Y.Text)) throw new Error('QA canonical source file is missing');
  const vector = Y.encodeStateVector(connection.doc);
  connection.doc.transact(() => { value.delete(0, value.length); value.insert(0, code); });
  send(connection, { type: 'update', update: Buffer.from(Y.encodeStateAsUpdate(connection.doc, vector)).toString('base64') });
}
async function runStart(actor, project) {
  const connection = await connect({ projectId: project.id, language: project.language, accessToken: actor.token,
    files: { [project.language === 'cpp' ? 'main.cpp' : 'main.py']: 'FORGED CLIENT SOURCE' } });
  await until(() => connection.output().includes('Name: ') || connection.closed || connection.failed, 'canonical private console prompt');
  check(!connection.closed && !connection.failed && connection.output() === 'Name: ', `${project.language} console starts canonical source and waits for real input`);
  return connection;
}
async function finishRun(connection, input, expected, label) {
  send(connection, { type: 'stdin', data: input });
  await until(() => connection.closed || connection.failed, label);
  check(!connection.failed && connection.output() === expected && connection.events.some(event => event.type === 'exit' && event.code === 0), label);
}
async function terminalDenied(payload, label) {
  const connection = await connect(payload);
  await until(() => connection.closed || connection.failed, label);
  check(!connection.failed && connection.events.some(event => event.type === 'error') && !connection.events.some(event => event.type === 'ready' || event.type === 'stdout'), label);
}
async function persistedAssets(projectId, filename, base64) {
  const result = await service.from('project_documents').select('state_b64').eq('project_id', projectId).maybeSingle();
  if (result.error) throw new Error('QA durable project state could not be read');
  if (!result.data?.state_b64) return false;
  const doc = new Y.Doc();
  try { Y.applyUpdate(doc, Buffer.from(result.data.state_b64, 'base64')); return doc.getMap('dosAssets').get(filename)?.base64 === base64; }
  finally { doc.destroy(); }
}
function projectRow(html, id) {
  const index = html.indexOf(`href="/p/${id}"`);
  return index < 0 ? '' : html.slice(index, html.indexOf('</li>', index));
}
function redirectsTo(response, path) {
  let destination = [307, 308].includes(response.status) ? response.location : null;
  // Next.js streams redirects beneath loading.tsx as an explicit refresh tag.
  if (response.status === 200) {
    const tag = response.data.match(/<meta\b[^>]*id="__next-page-redirect"[^>]*>/)?.[0];
    destination = tag?.match(/content="\d+;url=([^\"]+)"/)?.[1]?.replaceAll('&amp;', '&');
  }
  if (!destination) return false;
  const target = new URL(destination, base);
  return target.origin === new URL(base).origin && target.pathname === path;
}

try {
  if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase QA environment is incomplete');
  service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = JSON.parse(await readFile(process.env.QA_ACCOUNT_PATH || '/home/ec2-user/.outputtracer-test-accounts.json', 'utf8')).accounts;
  const owner = await login(accounts, 'student'), editor = await login(accounts, 'student2'), outsider = await login(accounts, 'teacher');
  const projects = {};
  const entry = { cpp: 'main.cpp', python: 'main.py', asm8086: 'main.asm' };
  const starter = { cpp: 'int main', python: 'def main', asm8086: 'org 100h' };
  for (const language of ['cpp', 'python', 'asm8086']) {
    const project = await savedProject(owner, language); projects[language] = project;
    const metadata = await owner.client.from('projects').select('language,standard').eq('id', project.id).single();
    const files = await sourceFiles(owner, project.id);
    check(!metadata.error && metadata.data.language === language && metadata.data.standard === (language === 'cpp' ? 'c++20' : null) && Object.keys(files).length === 1 && files[entry[language]]?.includes(starter[language]), `${language} creation saves matching starter, entry file and language settings`);
  }
  const legacy = await savedProject(owner, 'cpp', { legacy: true });
  check((await sourceFiles(owner, legacy.id))['main.cpp']?.includes('int main'), 'Four-argument create_project RPC remains compatible with existing C++ clients');
  const groupId = await rpc(owner, 'create_group', { p_name: `QA saved group ${stamp}` });
  const grouped = await savedProject(owner, 'python', { groupId, title: `QA grouped Python ${stamp}` });
  const groupRead = await owner.client.from('groups').select('name,group_members(user_id)').eq('id', groupId).single();
  check(!groupRead.error && groupRead.data.group_members.some(member => member.user_id === owner.id), 'Shared-project group and membership reads do not recurse');
  const deniedGroup = await outsider.client.from('groups').select('id').eq('id', groupId);
  check(!deniedGroup.error && deniedGroup.data.length === 0, 'Group reads remain hidden from an unrelated QA account');
  for (const project of [projects.cpp, projects.asm8086]) {
    await rpc(owner, 'invite_to_project', { pid: project.id, target_email: editor.email, target_role: 'editor' });
  }
  const cppOwner = await join(owner, projects.cpp, 'owner'), cppEditor = await join(editor, projects.cpp);
  const cppCode = '#include <iostream>\n#include <string>\nint main(){std::string name;std::cout<<"Name: "<<std::flush;std::getline(std::cin,name);std::cout<<"["<<name<<"]\\n";}\n';
  textUpdate(cppOwner, 'main.cpp', cppCode);
  await until(() => textAt(cppEditor, 'main.cpp') === cppCode, 'shared C++ source broadcast');
  check(true, 'C++ project source edits reach the other editor');
  const cppRunA = await runStart(owner, projects.cpp), cppRunB = await runStart(editor, projects.cpp);
  await finishRun(cppRunA, '  Ada  \n', 'Name: [  Ada  ]\n', 'C++ owner console ignores forged source and preserves spaces');
  await finishRun(cppRunB, 'Grace\n', 'Name: [Grace]\n', 'Collaborating student gets a separate private C++ stdin/output session');
  const pyOwner = await join(owner, projects.python, 'owner');
  send(pyOwner, { type: 'file-create', name: 'helper.py', content: 'def decorate(name):\n    return "[" + name + "]"\n' });
  await until(() => textAt(pyOwner, 'helper.py')?.includes('def decorate'), 'shared Python helper creation');
  const pyCode = 'from helper import decorate\nname=input("Name: ")\nprint(decorate(name))\n';
  textUpdate(pyOwner, 'main.py', pyCode);
  const pyRun = await runStart(owner, projects.python);
  await finishRun(pyRun, '  Ada  \n', 'Name: [  Ada  ]\n', 'Multi-file Python imports its shared helper and ignores forged client source');
  await rpc(owner, 'invite_to_project', { pid: projects.python.id, target_email: editor.email, target_role: 'editor' });
  const revokedRun = await runStart(editor, projects.python);
  await rpc(owner, 'remove_project_member', { pid: projects.python.id, target: editor.id });
  await until(() => revokedRun.closed || revokedRun.failed, 'running project console permission revocation', 20000);
  check(!revokedRun.failed && revokedRun.events.some(event => event.type === 'error') && !revokedRun.events.some(event => event.type === 'exit' && event.code === 0), 'Revoking project membership stops the existing private Python session');
  await terminalDenied({ projectId: projects.python.id, language: 'python', accessToken: editor.token }, 'Revoked collaborator cannot start a new private project console');
  await terminalDenied({ projectId: projects.cpp.id, language: 'python', accessToken: owner.token }, 'C++ saved project rejects a Python terminal request');
  await terminalDenied({ projectId: projects.python.id, language: 'cpp', accessToken: owner.token }, 'Python saved project rejects a C++ terminal request');
  await terminalDenied({ projectId: projects.asm8086.id, accessToken: owner.token }, 'NASM saved project requires browser DOSBox instead of a server terminal');
  await terminalDenied({ projectId: projects.cpp.id, accessToken: outsider.token }, 'Unrelated QA account cannot start a project console');
  await rpc(owner, 'set_member_role', { pid: projects.cpp.id, target: editor.id, target_role: 'viewer' });
  send(cppEditor, { type: 'file-create', name: 'DENIED.cpp', content: 'int denied;' });
  await until(() => cppEditor.closed, 'editor downgrade closes a structural edit session');
  check(!textAt(cppOwner, 'DENIED.cpp') && (cppEditor.closeCode === 1008 || cppEditor.events.some(event => event.type === 'error')), 'An editor downgraded to viewer cannot create project files');
  const viewer = await join(editor, projects.cpp, 'viewer');
  const cppBefore = textAt(cppOwner, 'main.cpp');
  textUpdate(viewer, 'main.cpp', '// Viewer attempted an edit');
  send(viewer, { type: 'file-create', name: 'VIEWER.cpp', content: 'int denied;' });
  await pause(400);
  check(textAt(cppOwner, 'main.cpp') === cppBefore && !textAt(cppOwner, 'VIEWER.cpp'), 'Viewer text and file mutations never reach the canonical document');
  const viewerSync = await http(editor, `/api/projects/${projects.cpp.id}/sync`, { body: { state: encoded(viewer.doc) } });
  check(viewerSync.status === 403, 'Viewer cannot bypass permissions with the project snapshot API');
  const a = await join(owner, projects.asm8086, 'owner'), b = await join(editor, projects.asm8086);
  const binary = Buffer.from([0, 255, 128, 13, 10, 32, 0, 65]).toString('base64');
  send(a, { type: 'asset-upload', name: 'SAMPLE.BIN', base64: binary });
  await until(() => assetAt(a, 'SAMPLE.BIN') === binary && assetAt(b, 'SAMPLE.BIN') === binary, 'NASM binary input broadcast');
  check(true, 'NASM project binary inputs reach both students without changing source files');
  await until(() => persistedAssets(projects.asm8086.id, 'SAMPLE.BIN', binary), 'durable NASM binary input');
  check(true, 'NASM input assets are saved durably in the cloud document');
  const forged = new Y.Doc(); Y.applyUpdate(forged, Y.encodeStateAsUpdate(a.doc));
  const vector = Y.encodeStateVector(forged);
  forged.getMap('dosAssets').set('FORGED.BIN', { base64: 'AA==' });
  const errorsBefore = a.events.filter(event => event.type === 'error').length;
  send(a, { type: 'update', update: Buffer.from(Y.encodeStateAsUpdate(forged, vector)).toString('base64') });
  await until(() => a.events.filter(event => event.type === 'error').length > errorsBefore, 'raw binary mutation rejection');
  check(!assetAt(a, 'FORGED.BIN') && !assetAt(b, 'FORGED.BIN'), 'Raw Yjs updates cannot bypass NASM asset validation');
  const forgedSync = await http(owner, `/api/projects/${projects.asm8086.id}/sync`, { body: { state: encoded(forged) } });
  check(forgedSync.status === 400 && !assetAt(a, 'FORGED.BIN'), 'Forged asset snapshot is rejected by the saved-project sync API');
  forged.destroy();
  const cleanSync = await http(owner, `/api/projects/${projects.asm8086.id}/sync`, { body: { state: encoded(a.doc) } });
  check(cleanSync.status === 200 && cleanSync.data.ok === true, 'Valid NASM snapshot sync preserves canonical source and assets');
  const reloaded = await join(owner, projects.asm8086, 'owner');
  check(assetAt(reloaded, 'SAMPLE.BIN') === binary && Object.keys(await sourceFiles(owner, projects.asm8086.id)).every(file => /\.(asm|inc)$/i.test(file)), 'Reopened NASM project restores binary inputs separately from source files');
  await rpc(owner, 'set_member_role', { pid: projects.asm8086.id, target: editor.id, target_role: 'viewer' });
  send(b, { type: 'asset-upload', name: 'DENIED.BIN', base64: 'AA==' });
  await until(() => b.closed, 'asset permission downgrade');
  check(!assetAt(a, 'DENIED.BIN'), 'Revoked NASM editor cannot change binary input files');
  const library = await http(owner, '/projects', { json: false });
  check(library.status === 200 && !library.data.includes('Saved work could not be loaded.'), 'Projects page loads the language-aware library without a database or RLS error');
  check(projectRow(library.data, projects.cpp.id).includes('Shared project') && projectRow(library.data, projects.python.id).includes('Personal project'), 'Library distinguishes personally shared projects from private personal work');
  check(projectRow(library.data, projects.python.id).includes('Python 3') && !projectRow(library.data, projects.python.id).includes('C++') && projectRow(library.data, projects.asm8086.id).includes('8086 Assembly'), 'Library rows show the canonical language without an unrelated C++ badge');
  check(projectRow(library.data, grouped.id).includes(`QA saved group ${stamp}`), 'Library displays the accessible shared-group context');
  for (const project of [projects.cpp, projects.python, projects.asm8086]) {
    const saved = await http(owner, '/api/workspaces/history', { body: { kind: 'project', id: project.id } });
    check(saved.status === 200 && saved.data.success === true, `${project.language} project can update its authorized resume history`);
  }
  const resume = await http(owner, '/projects/resume', { json: false, redirect: 'manual' });
  check(redirectsTo(resume, `/p/${projects.asm8086.id}`), 'Projects resume opens the last accessible NASM workspace');
  const foreign = await savedProject(editor, 'python', { title: `QA resume revocation ${stamp}` });
  await rpc(editor, 'invite_to_project', { pid: foreign.id, target_email: owner.email, target_role: 'editor' });
  check((await http(owner, '/api/workspaces/history', { body: { kind: 'project', id: foreign.id } })).status === 200, 'Former collaborator can record a workspace while authorized');
  await rpc(editor, 'remove_project_member', { pid: foreign.id, target: owner.id });
  check((await http(owner, '/api/workspaces/history', { body: { kind: 'project', id: foreign.id } })).status === 403, 'Revoked project access cannot update resume history');
  const fallback = await http(owner, '/projects/resume', { json: false, redirect: 'manual' });
  check(redirectsTo(fallback, `/p/${projects.asm8086.id}`), 'Resume skips revoked work and falls back to the next accessible saved project');
  await rpc(owner, 'remove_project_member', { pid: projects.cpp.id, target: editor.id });
  const removed = await connect({ type: 'join', projectId: projects.cpp.id, token: editor.token, clientId: ++clientId }, '/ws/collab');
  await until(() => removed.closed || removed.failed, 'removed project member join denial');
  check(!removed.failed && removed.events.some(event => event.type === 'error') && !removed.events.some(event => event.type === 'init'), 'Removed collaborator cannot open a new project document session');
  const outsiderSync = await http(outsider, `/api/projects/${projects.cpp.id}/sync`, { body: { state: encoded(cppOwner.doc) } });
  check(outsiderSync.status === 403, 'Unrelated account cannot write a saved project snapshot');
  report.completedAt = new Date().toISOString();
  console.log(`COMPLETE ${report.passed.length} saved project language checks`);
} catch (error) {
  report.failure = String(error?.message || 'QA check failed').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]');
  console.error(`FAIL ${report.failure}`); process.exitCode = 1;
} finally {
  for (const connection of sockets) { connection.ws.terminate(); connection.doc.destroy(); }
  for (const actor of actors) { actor.client.realtime.disconnect(); actor.client.auth.stopAutoRefresh(); }
  service?.auth.stopAutoRefresh();
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  await chmod(reportPath, 0o600);
}
