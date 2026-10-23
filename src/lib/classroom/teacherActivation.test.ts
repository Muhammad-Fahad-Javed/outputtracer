import { describe, it, expect, vi } from 'vitest';
import { activateTeacherProfile } from './teacherActivation';
import { readFileSync } from 'node:fs';
describe('teacher self-service', () => {
  it('calls only the self-scoped RPC without a target or requested role', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    expect(await activateTeacherProfile({ rpc })).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('activate_teacher_profile');
  });
  it('fails closed on a restriction, missing migration, or unavailable database', async () => {
    expect((await activateTeacherProfile({ rpc: vi.fn().mockResolvedValue({ error: { message: 'restricted' } }) })).success).toBe(false);
    expect((await activateTeacherProfile({ rpc: vi.fn().mockRejectedValue(new Error('offline')) })).success).toBe(false);
  });
  it('migration restricts its caller and preserves moderation (static contract, not a live SQL test)', () => {
    const sql = readFileSync('supabase/migrations/0016_teacher_self_service.sql', 'utf8');
    expect(sql).toContain('actor uuid := auth.uid()');
    expect(sql).toContain("teacher_status in ('suspended', 'revoked')");
    expect(sql).toContain("values (actor, 'teacher')");
    expect(sql).toContain('from public, anon');
    expect(sql).not.toContain("values (actor, 'admin')");
  });
});
