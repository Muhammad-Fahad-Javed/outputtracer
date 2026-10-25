/** Browser-only, self-hosted DOSBox + official NASM DOS toolchain. */
import { inspectDosboxAssets } from "@/lib/dosboxAssets";
export type DosboxAssets = Record<string, { base64: string }>;
export type DosboxArtifacts = Record<string, Uint8Array>;
export interface DosFsNode { name: string; size: number | null; nodes: DosFsNode[] | null }
export interface DosCommand {
  exit(): Promise<void>; pause(): void; resume(): void; mute(): void;
  width(): number; height(): number;
  sendKeyEvent(key: number, pressed: boolean): void;
  simulateKeyPress(...keys: number[]): void;
  fsTree(): Promise<DosFsNode>; fsReadFile(path: string): Promise<Uint8Array>;
  events(): {
    onFrameSize(cb: (width: number, height: number) => void): void;
    onFrame(cb: (rgb: Uint8Array | null, rgba: Uint8Array | null) => void): void;
    onStdout(cb: (message: string) => void): void;
    onExit(cb: () => void): void;
  };
}
interface Emulator {
  pathPrefix: string;
  bundle(): Promise<{ dosboxConf: string }>;
  dosboxWorker(files: ({ path: string; contents: Uint8Array } | { dosboxConf: string; jsdosConf: { version: string } })[]): Promise<DosCommand>;
}
declare global { interface Window { emulators?: Emulator } }
const BASE = '/dosbox/emulators-8.5.2/';
let loading: Promise<Emulator> | undefined;
let toolchain: Promise<[Uint8Array, Uint8Array]> | undefined;
const encoder = new TextEncoder();
export const DOSBOX_MAX_RUN_MS = 5 * 60_000;
export const DOSBOX_MAX_FILES = 64;
export const DOSBOX_MAX_BYTES = 2 * 1024 * 1024;

/** Restrict names before inserting anything into the fixed launch script. */
export function dosPath(path: string): string {
  const normal = path.replace(/\\/g, '/').toUpperCase();
  if (normal.length > 80 || !normal.split('/').every(p => /^[A-Z0-9_~-]{1,8}(\.[A-Z0-9_~-]{1,3})?$/.test(p) && !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/.test(p))) {
    throw new Error(`DOS file names must use 1–8 letters/numbers and an optional 1–3 character extension: ${path}`);
  }
  if (/^(OTSYS|\.JSDOS)(\/|$)/.test(normal) || /^(MAIN\.COM|BUILD\.LOG|RUN\.BAT|CWSDPMI\.EXE|AUTOEXEC\.BAT|CONFIG\.SYS)$/.test(normal)) {
    throw new Error(`Reserved runtime file name: ${path}`);
  }
  return normal;
}
export function prepareDosFiles(files: Record<string, string>, assets: DosboxAssets = {}) {
  const entries: { path: string; contents: Uint8Array }[] = [];
  const seen = new Set<string>();
  let size = 0;
  const add = (name: string, contents: Uint8Array) => {
    const path = dosPath(name);
    if (seen.has(path)) throw new Error(`Duplicate DOS file: ${name}`);
    seen.add(path); size += contents.length;
    if (size > DOSBOX_MAX_BYTES || entries.length >= DOSBOX_MAX_FILES) throw new Error('DOS project exceeds 64 files or 2 MB.');
    entries.push({ path, contents });
  };
  for (const [name, source] of Object.entries(files)) {
    if (!/\.(ASM|INC)$/i.test(name)) throw new Error(`Only .asm and .inc source files can run: ${name}`);
    add(name, encoder.encode(source));
  }
  if (!seen.has('MAIN.ASM')) throw new Error('The project needs a main.asm entry file.');
  const checked = inspectDosboxAssets(assets);
  if (!checked.ok) throw new Error(checked.message);
  for (const [name, asset] of Object.entries(assets)) {
    if (asset.base64.length > Math.ceil(DOSBOX_MAX_BYTES * 4 / 3) + 4) throw new Error(`Input file is too large: ${name}`);
    const binary = atob(asset.base64);
    add(`INPUT/${name}`, Uint8Array.from(binary, c => c.charCodeAt(0)));
  }
  return entries;
}
export async function sourceRevision(files: Record<string, string>, assets: DosboxAssets = {}) {
  const data = encoder.encode(JSON.stringify([Object.entries(files).sort(), Object.entries(assets).sort()]));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('').slice(0, 12);
}
export function loadDosbox(): Promise<Emulator> {
  if (!loading) loading = new Promise<Emulator>((resolve, reject) => {
    if (window.emulators) { window.emulators.pathPrefix = BASE; resolve(window.emulators); return; }
    const script = document.createElement('script');
    script.src = `${BASE}emulators.js`; script.async = true;
    script.onload = () => {
      if (!window.emulators) { reject(new Error('DOSBox runtime did not initialize.')); return; }
      window.emulators.pathPrefix = BASE; resolve(window.emulators);
    };
    script.onerror = () => { script.remove(); reject(new Error('Could not download the local DOSBox runtime. Please retry.')); };
    document.head.appendChild(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
async function fetchBytes(path: string) {
  const response = await fetch(path, { cache: 'force-cache' });
  if (!response.ok) throw new Error('Could not load the NASM toolchain. Please retry.');
  return new Uint8Array(await response.arrayBuffer());
}
export async function createDosbox(files: Record<string, string>, assets: DosboxAssets = {}) {
  const project = prepareDosFiles(files, assets);
  const emulators = await loadDosbox();
  toolchain ??= Promise.all([
    fetchBytes('/dosbox/nasm-2.16.03/NASM.EXE'), fetchBytes('/dosbox/nasm-2.16.03/CWSDPMI.EXE'),
  ]).catch(error => { toolchain = undefined; throw error; });
  const [nasm, dpmi] = await toolchain;
  const bundle = await emulators.bundle();
  // No shell prompt, editor, networking, host drive or user-controlled commands.
  // The worker's virtual drive is private to this run. Runtime markers live outside OUTPUT.
  const launch = [
    '@echo off', 'mount c .', 'c:', 'set PATH=C:\\OTSYS',
    ...project.map(file => `attrib +r ${file.path.replace(/\//g, '\\')}`),
    'OTSYS\\NASM.EXE -f bin MAIN.ASM -o MAIN.COM -Z BUILD.LOG',
    'if errorlevel 1 goto failed', 'cls', 'echo __OT_DOSBOX_READY__>OTSYS\\READY.TXT',
    'MAIN.COM', 'if errorlevel 1 goto runerror', 'goto done',
    ':runerror', 'echo __OT_DOSBOX_FAILED__>OTSYS\\EXITERR.TXT',
    ':done', 'echo __OT_DOSBOX_DONE__>OTSYS\\DONE.TXT', 'goto finished',
    ':failed', 'echo __OT_DOSBOX_FAILED__>OTSYS\\FAILED.TXT', ':finished', 'OTSYS\\HALT.COM',
  ].join('\n');
  const conf = bundle.dosboxConf.replace('ipx=true', 'ipx=false')
    .replace(/cycles=auto/, 'cycles=fixed 10000')
    .replace(/\[autoexec\][\s\S]*/, `[autoexec]\n${launch}\n`);
  const ci = await emulators.dosboxWorker([
    { dosboxConf: conf, jsdosConf: { version: '8' } },
    ...project,
    // Worker transport transfers (detaches) buffers. Keep cached toolchain bytes
    // intact so Restart and simultaneous private sessions receive fresh copies.
    { path: 'OTSYS/NASM.EXE', contents: new Uint8Array(nasm) },
    { path: 'OTSYS/CWSDPMI.EXE', contents: new Uint8Array(dpmi) },
    // BIOS wait loop: never returns to a DOS prompt, stays responsive to worker control.
    { path: 'OTSYS/HALT.COM', contents: Uint8Array.from([0xb4, 0, 0xcd, 0x16, 0xeb, 0xfa]) },
    { path: 'OUTPUT/.KEEP', contents: new Uint8Array() },
  ]);
  ci.mute();
  return { ci, sourcePaths: new Set(project.map(p => p.path)) };
}
const fsQueues = new WeakMap<DosCommand, Promise<unknown>>();
export function withDosFs<T>(ci: DosCommand, task: () => Promise<T>): Promise<T> {
  const previous = fsQueues.get(ci) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  fsQueues.set(ci, current);
  return current;
}
export async function readDosArtifacts(ci: DosCommand, sourcePaths: Set<string>): Promise<DosboxArtifacts> {
  return withDosFs(ci, () => readDosArtifactsUnlocked(ci, sourcePaths));
}
async function readDosArtifactsUnlocked(ci: DosCommand, sourcePaths: Set<string>): Promise<DosboxArtifacts> {
  const tree = await ci.fsTree();
  const candidates: string[] = [];
  let total = 0;
  const walk = (node: DosFsNode, prefix: string) => {
    const path = prefix ? `${prefix}/${node.name}` : node.name === '.' ? '' : node.name;
    if (node.nodes) {
      if (/^(OTSYS|\.JSDOS)$/i.test(path)) return;
      for (const child of node.nodes) walk(child, path);
    } else if (/^OUTPUT\//i.test(path) && node.size !== null && node.size <= DOSBOX_MAX_BYTES && !sourcePaths.has(path.toUpperCase()) &&
      !/^(MAIN\.COM|BUILD\.LOG|OUTPUT\/\.KEEP)$/i.test(path)) {
      total += node.size;
      if (candidates.length < DOSBOX_MAX_FILES && total <= DOSBOX_MAX_BYTES) candidates.push(path);
    }
  };
  walk(tree, '');
  const result: DosboxArtifacts = {};
  // js-dos allows one filesystem request at a time.
  for (const path of candidates) result[path] = await ci.fsReadFile(path);
  return result;
}

export function dosKey(event: Pick<KeyboardEvent, 'key' | 'code'>): number | null {
  const special: Record<string, number> = { Enter: 257, Backspace: 259, Tab: 258, Escape: 256, Delete: 261,
    ArrowUp: 265, ArrowDown: 264, ArrowRight: 262, ArrowLeft: 263, Insert: 260, Home: 268, End: 269,
    PageUp: 266, PageDown: 267, ShiftLeft: 340, ShiftRight: 344, ControlLeft: 341, ControlRight: 345,
    AltLeft: 342, AltRight: 346 };
  if (special[event.code]) return special[event.code];
  const physical: Record<string, number> = { Minus: 45, Equal: 61, BracketLeft: 91, BracketRight: 93, Backslash: 92, Semicolon: 59, Quote: 39, Comma: 44, Period: 46, Slash: 47, Backquote: 96, Space: 32 };
  if (physical[event.code]) return physical[event.code];
  if (/^Digit[0-9]$/.test(event.code)) return Number(event.code.slice(5)) + 48;
  if (special[event.key]) return special[event.key];
  if (/^F([1-9]|1[0-2])$/.test(event.key)) return 289 + Number(event.key.slice(1));
  if (event.key.length === 1 && event.key.charCodeAt(0) < 128) return event.key.toUpperCase().charCodeAt(0);
  return null;
}
