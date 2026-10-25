'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Play, Square, RotateCcw, Download, RefreshCw } from 'lucide-react';
import { createDosbox, dosKey, DOSBOX_MAX_RUN_MS, readDosArtifacts, sourceRevision, withDosFs, type DosCommand, type DosboxAssets, type DosboxArtifacts } from '@/lib/dosbox/runtime';

export type BrowserDosboxProps = {
  files: Record<string, string>;
  getFiles?: () => Record<string, string>;
  assets?: DosboxAssets;
  getAssets?: () => DosboxAssets;
  runRequest?: number;
  stopRequest?: number;
  canRun?: boolean;
  onRunningChange?: (running: boolean) => void;
  onStatusChange?: (status: string) => void;
  onArtifactsChange?: (artifacts: DosboxArtifacts) => void;
  onOutputChange?: (output: string) => void;
};

export default function BrowserDosbox(props: BrowserDosboxProps) {
  const { files, assets, runRequest = 0, stopRequest = 0, canRun = true } = props;
  const inputId = useId();
  const latest = useRef(props); latest.current = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const command = useRef<DosCommand | null>(null);
  const generation = useRef(0);
  const sourcePaths = useRef(new Set<string>());
  const poll = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(new Set<number>());
  const [status, setStatus] = useState('Ready');
  const [active, setActive] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [revision, setRevision] = useState('');
  const [currentRevision, setCurrentRevision] = useState('');
  const [diagnostics, setDiagnostics] = useState('');
  const [artifacts, setArtifacts] = useState<DosboxArtifacts>({});
  const [line, setLine] = useState('');
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const buttonClass = 'inline-flex items-center gap-1 rounded border border-[#414141] px-2 py-1 text-xs text-[#ddd] hover:bg-[#303030] disabled:opacity-40';
  const updateStatus = useCallback((value: string, running: boolean) => {
    setStatus(value); setActive(running);
    latest.current.onStatusChange?.(value); latest.current.onRunningChange?.(running);
  }, []);
  useEffect(() => {
    let valid = true;
    void sourceRevision(files, assets).then(hash => { if (valid) setCurrentRevision(hash); });
    return () => { valid = false; };
  }, [files, assets]);
  const clearTimers = useCallback(() => {
    if (poll.current) clearTimeout(poll.current);
    if (deadline.current) clearTimeout(deadline.current);
    poll.current = null; deadline.current = null;
  }, []);
  const stop = useCallback(async (label = 'Stopped') => {
    generation.current += 1; clearTimers(); pressed.current.clear();
    const ci = command.current; command.current = null; setHasSession(false);
    updateStatus(label, false);
    if (ci) { ci.pause(); await ci.exit().catch(() => undefined); }
  }, [clearTimers, updateStatus]);
  const refreshArtifacts = useCallback(async (ci = command.current) => {
    if (!ci) return;
    setRefreshing(true);
    try {
      const next = await readDosArtifacts(ci, sourcePaths.current);
      if (ci === command.current) { setArtifacts(next); latest.current.onArtifactsChange?.(next); }
    } catch (error) {
      if (ci === command.current) setDiagnostics(error instanceof Error ? error.message : 'Could not read output files.');
    } finally { setRefreshing(false); }
  }, []);
  const run = useCallback(async () => {
    const allowed = () => latest.current.canRun !== false;
    if (!allowed()) return;
    const id = generation.current + 1;
    await stop('Loading browser DOSBox…');
    if (id !== generation.current) return;
    const snapshot = { ...(latest.current.getFiles?.() ?? latest.current.files) };
    const input = structuredClone(latest.current.getAssets?.() ?? latest.current.assets ?? {});
    setDiagnostics(''); setLine(''); setArtifacts({}); latest.current.onArtifactsChange?.({});
    latest.current.onOutputChange?.(''); updateStatus('Loading browser DOSBox…', true);
    try {
      const hash = await sourceRevision(snapshot, input);
      if (id !== generation.current) return;
      setRevision(hash); setCurrentRevision(hash);
      const { ci, sourcePaths: paths } = await createDosbox(snapshot, input);
      if (id !== generation.current || !allowed()) { await ci.exit(); return; }
      command.current = ci; setHasSession(true); sourcePaths.current = paths;
      updateStatus('Assembling with NASM…', true);
      const context = canvas.current?.getContext('2d');
      let width = ci.width() || 640; let height = ci.height() || 400;
      if (canvas.current) { canvas.current.width = width; canvas.current.height = height; }
      ci.events().onFrameSize((w, h) => {
        width = w; height = h;
        if (canvas.current && command.current === ci) { canvas.current.width = w; canvas.current.height = h; }
      });
      ci.events().onFrame((rgb, rgba) => {
        if (!context || command.current !== ci) return;
        const frame = context.createImageData(width, height);
        if (rgba) frame.data.set(rgba);
        else if (rgb) for (let src = 0, dst = 0; src < rgb.length; src += 3, dst += 4) {
          frame.data[dst] = rgb[src]; frame.data[dst + 1] = rgb[src + 1]; frame.data[dst + 2] = rgb[src + 2]; frame.data[dst + 3] = 255;
        }
        context.putImageData(frame, 0, 0);
      });
      let output = ''; let ready = false;
      ci.events().onStdout(message => {
        if (command.current !== ci) return;
        const start = message.indexOf('__OT_DOSBOX_READY__');
        if (start >= 0) {
          ready = true; updateStatus('Running · keyboard input goes to DOSBox', true);
          message = message.slice(start + '__OT_DOSBOX_READY__'.length).replace(/^\s*\r?\n/, '');
        }
        if (!ready) return;
        const clean = message.replace(/__OT_DOSBOX_(?:DONE|FAILED)__\r?\n?/g, '');
        output = (output + clean).slice(-262144);
        latest.current.onOutputChange?.(output);
      });
      ci.events().onExit(() => {
        if (command.current === ci) { clearTimers(); command.current = null; setHasSession(false); updateStatus('Finished', false); }
      });
      const inspect = async () => {
        if (command.current !== ci || id !== generation.current) return;
        try {
          const tree = await withDosFs(ci, () => ci.fsTree());
          const runtime = tree.nodes?.find(n => n.name.toUpperCase() === 'OTSYS');
          const names = new Set(runtime?.nodes?.map(n => n.name.toUpperCase()) ?? []);
          if (names.has('FAILED.TXT')) {
            const log = new TextDecoder().decode(await withDosFs(ci, () => ci.fsReadFile('BUILD.LOG')));
            setDiagnostics(log || 'NASM could not assemble this project.');
            latest.current.onOutputChange?.(log);
            ci.pause(); clearTimers(); updateStatus('Assembly failed', false); return;
          }
          if (names.has('READY.TXT') && !ready) {
            ready = true; updateStatus('Running · keyboard input goes to DOSBox', true); canvas.current?.focus();
          }
          if (names.has('DONE.TXT')) {
            ci.pause(); clearTimers(); updateStatus(names.has('EXITERR.TXT') ? 'Program finished with an error exit' : 'Program finished', false); await refreshArtifacts(ci); return;
          }
        } catch { /* Startup filesystem may not be ready yet. Retry while this run remains active. */ }
        if (command.current === ci && id === generation.current) poll.current = setTimeout(() => { void inspect(); }, 500);
      };
      poll.current = setTimeout(() => { void inspect(); }, 250);
      deadline.current = setTimeout(() => { void stop('Stopped · five-minute run limit'); }, DOSBOX_MAX_RUN_MS);
    } catch (error) {
      if (id !== generation.current) return;
      setDiagnostics(error instanceof Error ? error.message : 'Could not start browser DOSBox.');
      updateStatus('Could not start', false);
    }
  }, [stop, clearTimers, refreshArtifacts, updateStatus]);
  const runSeen = useRef(runRequest); const stopSeen = useRef(stopRequest);
  useEffect(() => { if (runRequest !== runSeen.current) { runSeen.current = runRequest; void run(); } }, [runRequest, run]);
  useEffect(() => { if (stopRequest !== stopSeen.current) { stopSeen.current = stopRequest; void stop(); } }, [stopRequest, stop]);
  useEffect(() => {
    if (canRun) return;
    const task = setTimeout(() => { void stop('Run disabled'); }, 0);
    return () => clearTimeout(task);
  }, [canRun, stop]);
  useEffect(() => () => { void stop(); }, [stop]);
  const releaseKeys = () => {
    for (const key of pressed.current) command.current?.sendKeyEvent(key, false);
    pressed.current.clear();
  };
  const sendLine = async () => {
    const ci = command.current;
    if (!ci || !active || sending) return;
    if (/[^\x20-\x7e]/.test(line)) { setDiagnostics('DOS text input currently supports printable ASCII characters.'); return; }
    setSending(true);
    const shifted: Record<string, string> = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`' };
    try {
      for (const char of line.slice(0, 1024)) {
        if (command.current !== ci) break;
        const shift = /[A-Z]/.test(char) || !!shifted[char];
        if (shift) ci.sendKeyEvent(340, true);
        ci.simulateKeyPress((shifted[char] ?? char.toUpperCase()).charCodeAt(0));
        await new Promise(resolve => setTimeout(resolve, 25));
        if (shift) ci.sendKeyEvent(340, false);
      }
      if (command.current === ci) ci.simulateKeyPress(257);
      setLine('');
    } finally { setSending(false); }
  };
  const download = (name: string, data: Uint8Array) => {
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)]));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name.split('/').pop() ?? name; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="flex h-full min-h-0 flex-col bg-[#101010] text-[#ddd]" aria-label="Browser DOSBox console">
    <div className="flex flex-wrap items-center gap-2 border-b border-[#333] bg-[#191919] px-3 py-1.5">
      <span className="text-xs font-semibold">DOSBox · NASM</span>
      <span className="mr-auto text-xs text-[#aaa]" role="status">{status}</span>
      <button className={buttonClass} onClick={() => void run()} disabled={!canRun || active}><Play size={12}/>Run</button>
      <button className={buttonClass} onClick={() => void stop()} disabled={!active}><Square size={12}/>Stop</button>
      <button className={buttonClass} onClick={() => void run()} disabled={!canRun}><RotateCcw size={12}/>Restart</button>
    </div>
    {revision && <div className="border-b border-[#292929] px-3 py-1 text-[11px] text-[#aaa]">
      Running snapshot {revision} · private browser session
      {currentRevision && currentRevision !== revision && <span className="ml-2 text-amber-300">Code or input files changed — run again to use the latest version.</span>}
    </div>}
    {diagnostics && <pre role="alert" className="max-h-40 shrink-0 overflow-auto whitespace-pre-wrap border-b border-red-900 bg-[#251818] p-3 text-xs text-red-200">{diagnostics}</pre>}
    <div className="relative min-h-0 flex-1 overflow-auto bg-black">
      {!revision && <div className="p-4 text-sm text-[#aaa]">Run the current editor snapshot locally in your browser. Click the DOS screen to type directly.</div>}
      <canvas ref={canvas} tabIndex={0} aria-label="DOSBox screen. Click to send keyboard input to your program." className={`${revision ? 'block' : 'hidden'} mx-auto h-auto w-full max-w-[720px] outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400`} style={{ imageRendering: 'pixelated' }}
        onKeyDown={event => { const key = dosKey(event.nativeEvent); if (key !== null && active) { event.preventDefault(); if (!event.repeat) { pressed.current.add(key); command.current?.sendKeyEvent(key, true); } } }}
        onKeyUp={event => { const key = dosKey(event.nativeEvent); if (key !== null) { event.preventDefault(); pressed.current.delete(key); command.current?.sendKeyEvent(key, false); } }}
        onBlur={releaseKeys} onContextMenu={event => event.preventDefault()}/>
    </div>
    <form className="flex shrink-0 gap-2 border-t border-[#333] px-3 py-2" onSubmit={event => { event.preventDefault(); void sendLine(); }}>
      <label htmlFor={inputId} className="sr-only">DOSBox program input</label>
      <input id={inputId} value={line} onChange={event => setLine(event.target.value)} maxLength={1024} disabled={!active || sending} placeholder="Program input · Enter sends a line; click screen for character input" autoComplete="off" spellCheck={false} className="min-w-0 flex-1 rounded border border-[#414141] bg-[#181818] px-2 py-1 text-xs text-[#eee] placeholder:text-[#999] disabled:opacity-50"/>
      <button className={buttonClass} disabled={!active || sending}>Send</button>
    </form>
    <details className="shrink-0 border-t border-[#333] px-3 py-1 text-xs">
      <summary className="cursor-pointer text-[#aaa]">Output files ({Object.keys(artifacts).length}) · private to this run</summary>
      <div className="flex flex-wrap items-center gap-2 py-2">
        <button className={buttonClass} disabled={!hasSession || active || refreshing} onClick={() => void refreshArtifacts()}><RefreshCw size={12}/>Refresh</button>
        {Object.entries(artifacts).map(([name, data]) => <button className={buttonClass} key={name} onClick={() => download(name, data)}><Download size={12}/>{name} ({data.length} B)</button>)}
        {!Object.keys(artifacts).length && <span className="text-[#999]">Programs can write files to OUTPUT\.</span>}
      </div>
    </details>
  </section>;
}
