import { describe, expect, it } from 'vitest';
import { dosKey, dosPath, prepareDosFiles, readDosArtifacts, type DosCommand } from './runtime';

describe('browser DOSBox project boundary', () => {
  it('loads exact source and binary input without changing bytes', () => {
    const entries = prepareDosFiles({ 'main.asm': 'org 100h\r\nint 20h', 'lib/math.inc': 'db 1' }, { 'TEST.BIN': { base64: 'AP+A' } });
    expect(entries.map(e => e.path)).toEqual(['MAIN.ASM', 'LIB/MATH.INC', 'INPUT/TEST.BIN']);
    expect([...entries[2].contents]).toEqual([0, 255, 128]);
    expect(new TextDecoder().decode(entries[0].contents)).toBe('org 100h\r\nint 20h');
  });
  it.each(['../MAIN.ASM', '/MAIN.ASM', 'a&&b.asm', 'a b.asm', 'longfilename.asm', 'OTSYS/RUN.COM', 'autoexec.bat', 'CONFIG.SYS', 'main.com', 'a/../b.asm', 'a.b.c'])('rejects unsafe or reserved DOS path %s', path => {
    expect(() => dosPath(path)).toThrow();
  });
  it('requires main.asm and rejects case-insensitive duplicate files', () => {
    expect(() => prepareDosFiles({ 'other.asm': '' })).toThrow('main.asm');
    expect(() => prepareDosFiles({ 'main.asm': '', 'MAIN.ASM': '' })).toThrow('Duplicate');
  });
  it('bounds total project size and file count', () => {
    expect(() => prepareDosFiles({ 'main.asm': 'a'.repeat(2 * 1024 * 1024 + 1) })).toThrow('2 MB');
    const files: Record<string, string> = { 'main.asm': '' };
    for (let i = 0; i < 64; i++) files[`F${i}.INC`] = '';
    expect(() => prepareDosFiles(files)).toThrow('64 files');
  });
  it('exports only output files, never source, runtime or other drive files', async () => {
    const calls: string[] = [];
    const ci = {
      fsTree: async () => ({ name: '.', size: null, nodes: [
        { name: 'OTSYS', size: null, nodes: [{ name: 'SECRET.TXT', size: 4, nodes: null }] },
        { name: 'MAIN.ASM', size: 5, nodes: null },
        { name: 'OTHER.TXT', size: 5, nodes: null },
        { name: 'OUTPUT', size: null, nodes: [
          { name: '.KEEP', size: 0, nodes: null },
          { name: 'REPORT.TXT', size: 4, nodes: null },
          { name: 'HUGE.BIN', size: 3 * 1024 * 1024, nodes: null },
        ] },
      ] }),
      fsReadFile: async (path: string) => { calls.push(path); return Uint8Array.of(1, 2, 3, 4); },
    } as unknown as DosCommand;
    const files = await readDosArtifacts(ci, new Set(['MAIN.ASM']));
    expect(Object.keys(files)).toEqual(['OUTPUT/REPORT.TXT']);
    expect(calls).toEqual(['OUTPUT/REPORT.TXT']);
  });
  it('maps keyboard controls to DOSBox SDL keys', () => {
    expect(dosKey({ code: 'ArrowUp', key: 'ArrowUp' })).toBe(265);
    expect(dosKey({ code: 'ShiftLeft', key: 'Shift' })).toBe(340);
    expect(dosKey({ code: 'KeyA', key: 'A' })).toBe(65);
    expect(dosKey({ code: 'Enter', key: 'Enter' })).toBe(257);
    expect(dosKey({ code: 'Unknown', key: '🙂' })).toBeNull();
  });
});
