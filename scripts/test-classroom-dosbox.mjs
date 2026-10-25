#!/usr/bin/env node
// Disposable QA coursework only. Never prints credentials, tokens or private account data.
// Supply the same QA/Supabase environment as test-classroom-consoles.mjs.
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
const reportPath = process.env.QA_REPORT_PATH || '/tmp/outputtracer-classroom-dosbox-results.json';
const actors = [], sockets = [], passed = [], fixtures = [];
const report = { startedAt: new Date().toISOString(), base, fixtures, passed };
let service;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function check(condition, label) { if (!condition) throw new Error(label); passed.push(label); console.log(`PASS ${label}`); }
async function until(predicate, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await predicate()) return; await pause(50); }
  throw new Error(`Timed out: ${label}`);
}
async function login(accounts, name) {
  const jar = new Map();
  const client = createServerClient(url, anon, { auth: { autoRefreshToken: false }, cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: rows => rows.forEach(row => jar.set(row.name, row.value)),
  } });
  const issued = await service.auth.admin.generateLink({ type: 'magiclink', email: accounts[name].email });
  if (issued.error) throw new Error('QA sign-in link generation failed');
  const verified = await client.auth.verifyOtp({ type: 'magiclink', token_hash: issued.data.properties.hashed_token });
  if (verified.error) throw new Error('QA sign-in verification failed');
  const actor = { id: accounts[name].id, client, jar };
  actors.push(actor);
  return actor;
}
async function request(actor, path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: {
    Origin: origin, Cookie: [...actor.jar].map(([name, value]) => `${name}=${value}`).join('; '),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let data; try { data = await response.json(); } catch { throw new Error(`QA endpoint returned non-JSON (${response.status})`); }
  return { status: response.status, data };
}
async function api(actor, path, body, method) {
  const result = await request(actor, path, body, method);
  if (result.status >= 400 || result.data.success === false) throw new Error(`QA fixture request failed (${result.status}): ${path}`);
  return result.data;
}
let lastJoin = 0, clientId = 50000;
async function join(actor, path, scope = {}) {
  const session = await api(actor, `${path}/session`, scope);
  if (!session.token) throw new Error('QA document session did not issue a token');
  const delay = 8000 - (Date.now() - lastJoin); if (delay > 0) await pause(delay);
  lastJoin = Date.now();
  const address = new URL('/ws/collab', base); address.protocol = address.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(address, { origin, handshakeTimeout: 10000 });
  const connection = { ws, events: [], doc: new Y.Doc(), closed: false, failed: false };
  sockets.push(connection);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'join', kind: 'classroom', token: session.token, clientId: ++clientId })));
  ws.on('message', raw => {
    let event; try { event = JSON.parse(String(raw)); } catch { connection.failed = true; return; }
    connection.events.push(event);
    if (event.type === 'init' && event.state) Y.applyUpdate(connection.doc, Buffer.from(event.state, 'base64'));
    if (event.type === 'update' && event.update) Y.applyUpdate(connection.doc, Buffer.from(event.update, 'base64'));
  });
  ws.on('error', () => { connection.failed = true; });
  ws.on('close', () => { connection.closed = true; });
  await until(() => connection.events.some(event => event.type === 'init') || connection.failed || connection.closed, 'collaboration join');
  if (connection.failed || connection.closed) throw new Error('QA collaboration join failed');
  return connection;
}
const assetAt = (connection, name) => connection.doc.getMap('dosAssets').get(name)?.base64;
const send = (connection, message) => connection.ws.send(JSON.stringify(message));

try {
  if (!url || !anon || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase QA environment is incomplete');
  service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const accounts = JSON.parse(await readFile(process.env.QA_ACCOUNT_PATH || '/home/ec2-user/.outputtracer-test-accounts.json', 'utf8')).accounts;
  const teacher = await login(accounts, 'teacher'), student = await login(accounts, 'student'), teammate = await login(accounts, 'student2');
  const classroom = (await api(teacher, '/api/classroom', { name: `QA browser DOSBox ${new Date().toISOString()}`, subject: 'COAL', language: 'asm8086' })).classroom;
  fixtures.push({ classId: classroom.id });
  await api(student, '/api/classroom/join', { joinCode: classroom.joinCode });
  await api(teammate, '/api/classroom/join', { joinCode: classroom.joinCode });
  const code = 'org 100h\nmov ax, 12\nmov bx, 3\nmul bx\nmov ax, 4c00h\nint 21h\n';
  const assignment = (await api(teacher, `/api/classroom/${classroom.id}/assignments`, {
    title: 'QA shared DOS binary assets and manual review', language: 'asm8086', groupMode: true, groupScope: 'assignment', requiredGroupSize: 2,
    inputPolicy: 'typing_only', isPublished: true, starterCode: { 'main.asm': code }, maxPoints: 100, publicTestCases: [], hiddenTestCases: [],
  })).assignment;
  const path = `/api/classroom/${classroom.id}/assignments/${assignment.id}`;
  Object.assign(fixtures[0], { assignmentId: assignment.id });
  const team = await api(teacher, `${path}/teams`, { name: 'QA DOS pair', studentIds: [student.id, teammate.id] });
  const groupId = team.groupId;
  Object.assign(fixtures[0], { groupId });
  check(typeof groupId === 'string' && groupId.length > 0, 'Teacher creates assignment-specific two-student team atomically');
  const a = await join(student, path), b = await join(teammate, path);
  check(a.events.find(event => event.type === 'init')?.role === 'editor' && b.events.find(event => event.type === 'init')?.role === 'editor', 'Both teammates join the shared document as editors');
  const binary = Buffer.from([0, 255, 13, 10, 128, 32, 0, 65]).toString('base64');
  send(a, { type: 'asset-upload', name: 'SAMPLE.BIN', base64: binary });
  await until(() => assetAt(a, 'SAMPLE.BIN') === binary && assetAt(b, 'SAMPLE.BIN') === binary, 'binary upload broadcast');
  check(true, 'Exact binary input data broadcasts to both group members');
  await until(async () => {
    const { data, error } = await service.from('classroom_documents').select('state_b64').eq('assignment_id', assignment.id).eq('group_id', groupId).maybeSingle();
    if (error) throw new Error('QA persisted document lookup failed');
    if (!data?.state_b64) return false;
    const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(data.state_b64, 'base64'));
    const matches = doc.getMap('dosAssets').get('SAMPLE.BIN')?.base64 === binary; doc.destroy(); return matches;
  }, 'durable input asset save');
  check(true, 'Binary assets survive in durable shared document state');
  const forged = new Y.Doc(); Y.applyUpdate(forged, Y.encodeStateAsUpdate(a.doc));
  let forgedUpdate; forged.on('update', update => { forgedUpdate = update; });
  forged.getMap('dosAssets').set('FORGED.BIN', { base64: 'AA==' });
  const errorsBefore = a.events.filter(event => event.type === 'error').length;
  send(a, { type: 'update', update: Buffer.from(forgedUpdate).toString('base64') });
  await until(() => a.events.filter(event => event.type === 'error').length > errorsBefore, 'forged asset update rejection');
  check(!assetAt(a, 'FORGED.BIN') && !assetAt(b, 'FORGED.BIN'), 'Generic Yjs updates cannot bypass asset validation');
  forged.destroy();
  const review = await join(teacher, path, { groupId });
  check(review.events.find(event => event.type === 'init')?.role === 'viewer' && assetAt(review, 'SAMPLE.BIN') === binary, 'Teacher watch loads canonical shared input assets read-only');
  send(review, { type: 'asset-upload', name: 'TEACHER.BIN', base64: 'AA==' });
  await pause(300);
  check(!assetAt(a, 'TEACHER.BIN') && !assetAt(review, 'TEACHER.BIN'), 'Read-only teacher watch cannot mutate student input assets');
  const submitted = await api(student, `${path}/submit`, { groupId, files: { 'main.asm': 'FORGED CLIENT SOURCE' }, inputAssets: { 'FORGED.BIN': { base64: 'AA==' } } });
  Object.assign(fixtures[0], { submissionId: submitted.submissionId, firstSnapshotId: submitted.snapshotId });
  check(Boolean(submitted.submissionId && submitted.snapshotId && submitted.contentHash), 'Submission creates an immutable team hand-in');
  const listPath = `${path}/submissions?groupId=${encodeURIComponent(groupId)}`;
  const listed = await api(teacher, listPath);
  check(listed.submissions.some(row => row.id === submitted.submissionId), 'Teacher review list includes the submitted team hand-in');
  const submissionPath = `${path}/submissions/${submitted.submissionId}`;
  const snapshot = (await api(teacher, `${submissionPath}/snapshot`)).snapshot;
  check(snapshot.frozenCodeFiles['main.asm'] === code && snapshot.inputAssets?.['SAMPLE.BIN']?.base64 === binary && !snapshot.inputAssets?.['FORGED.BIN'] && snapshot.contentHashScope === 'source_and_input_assets_v1', 'Immutable hand-in includes canonical source and exact input assets, ignoring forged client payload');
  check((await request(student, listPath)).status === 403, 'Students cannot open the teacher review list');
  check((await api(teammate, `${submissionPath}/snapshot`)).snapshot.id === snapshot.id, 'Groupmate can read their own team hand-in');
  const grade = await api(teacher, `${submissionPath}/grade`, { mode: 'manual', gradeMode: 'manual', manualPoints: 75, maxPoints: 999, expectedSnapshotId: snapshot.id });
  check(grade.grade.totalPoints === 75 && grade.grade.maxPoints === 100 && grade.grade.snapshotId === snapshot.id, 'Manual grade uses assignment maximum and exact reviewed snapshot');
  const gradedMine = (await api(student, `${path}/mine`)).submission;
  check(gradedMine.grade === 75 && gradedMine.maxPoints === 100 && gradedMine.status === 'graded', 'Student reload shows the canonical teacher grade');
  check((await request(student, `${submissionPath}/grade`, { mode: 'manual', manualPoints: 100 })).status === 403, 'Students cannot assign grades');
  const auto = await request(teacher, `${submissionPath}/grade`, { mode: 'auto' });
  check(auto.status === 409 && auto.data.code === 'manual_review_required', 'Assembly auto-grading refuses to fabricate a server execution result');
  const execute = await request(student, `${path}/execute`, { groupId, runTests: true });
  check(execute.status === 409 && execute.data.code === 'browser_execution_required' && execute.data.stdout === undefined, 'Legacy server execution explicitly requires browser DOSBox');
  check((await api(student, `${submissionPath}/grade`)).grade.totalPoints === 75, 'Rejected execution and automatic grading leave the manual grade intact');
  const changedBinary = Buffer.from([0, 255, 13, 10, 128, 32, 0, 66]).toString('base64');
  send(b, { type: 'asset-upload', name: 'SAMPLE.BIN', base64: changedBinary });
  await until(() => assetAt(a, 'SAMPLE.BIN') === changedBinary && assetAt(b, 'SAMPLE.BIN') === changedBinary, 'new asset revision');
  const resubmitted = await api(teammate, `${path}/submit`, { groupId });
  Object.assign(fixtures[0], { latestSnapshotId: resubmitted.snapshotId });
  check(resubmitted.submissionId === submitted.submissionId && resubmitted.snapshotId !== snapshot.id && resubmitted.contentHash !== submitted.contentHash, 'Resubmitting changed input creates a new snapshot and content hash');
  const resubmittedMine = (await api(student, `${path}/mine`)).submission;
  check(resubmittedMine.grade == null && resubmittedMine.status === 'submitted', 'A resubmission does not display the grade of an older snapshot');
  const stale = await request(teacher, `${submissionPath}/grade`, { mode: 'manual', manualPoints: 80, expectedSnapshotId: snapshot.id });
  check([400, 409].includes(stale.status) && /newer work|newer|refresh/i.test(stale.data.error || ''), 'Stale teacher review cannot grade a newer hand-in');
  const latest = (await api(teacher, `${submissionPath}/snapshot`)).snapshot;
  check(latest.id === resubmitted.snapshotId && latest.inputAssets['SAMPLE.BIN'].base64 === changedBinary, 'Teacher refresh receives the latest immutable input revision');
  report.completedAt = new Date().toISOString();
  console.log(`COMPLETE ${passed.length} classroom DOSBox checks`);
} catch (error) {
  // Endpoint failure messages above contain only statuses and fixture paths.
  report.failure = String(error?.message || 'QA check failed').replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]');
  console.error(`FAIL ${report.failure}`); process.exitCode = 1;
} finally {
  for (const connection of sockets) { connection.ws.terminate(); connection.doc.destroy(); }
  for (const actor of actors) { actor.client.realtime.disconnect(); actor.client.auth.stopAutoRefresh(); }
  service?.auth.stopAutoRefresh();
  await writeFile(reportPath, JSON.stringify(report, null, 2), { mode: 0o600 });
  await chmod(reportPath, 0o600);
}
