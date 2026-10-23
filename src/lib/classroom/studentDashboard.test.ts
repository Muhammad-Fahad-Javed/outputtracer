import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ available: true, authenticated: true, noClasses: false, fail: '', calls: [] as unknown[][] }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.authenticated ? { id: 'u1' } : null } }) } }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => {
  if (!state.available) return null;
  return { from: (table: string) => {
    const result = {
      data: table === 'classroom_members' ? (state.noClasses ? [] : [{ classroom_id: 'c1', classroom: { name: 'Class' } }])
        : table === 'classroom_assignments' ? [{ id: 'a1', title: 'Work', classroom_id: 'c1' }]
        : table === 'classroom_group_members' ? [{ group_id: 'g1' }]
        : table === 'submission_grades' ? [{ submission_id: 's1', total_points: 0, max_points: 50, graded_at: '2026-10-22', submission: { assignment: { id: 'a1', classroom_id: 'c1' } } }]
        : table === 'classroom_submissions' ? [{ assignment_id: 'a1', status: 'submitted' }] : [],
      count: table === 'classroom_notifications' ? 25 : 3,
      error: state.fail === table ? { message: 'database unavailable' } : null,
    };
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => { state.calls.push([table, method, ...args]); return query; };
    }
    query.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return query;
  } };
} }));
import { GET } from '@/app/api/classroom/student/dashboard/route';
beforeEach(() => { state.available = true; state.authenticated = true; state.noClasses = false; state.fail = ''; state.calls = []; });
describe('student dashboard', () => {
  it('uses completed practice rows and a full unread count independently of recent activity', async () => {
    const response = await GET(); const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.stats.unreadCount).toBe(25);
    expect(state.calls).toContainEqual(['practice_progress', 'eq', 'is_completed', true]);
    expect(state.calls).toContainEqual(['classroom_notifications', 'eq', 'is_read', false]);
  });
  it('includes authorized group submissions and scopes grades to enrolled classrooms', async () => {
    const body = await (await GET()).json();
    expect(body.stats.pendingAssignmentsCount).toBe(0);
    expect(body.recentGrades[0]).toMatchObject({ submissionId: 's1', grade: 0, maxPoints: 50 });
    expect(state.calls).toContainEqual(['classroom_submissions', 'or', 'student_id.eq.u1,group_id.in.(g1)']);
    expect(state.calls).toContainEqual(['submission_grades', 'in', 'submission.assignment.classroom_id', ['c1']]);
  });
  it('does not report missing storage or query failures as zero activity', async () => {
    state.available = false; expect((await GET()).status).toBe(503);
    state.available = true;
    for (const table of ['classroom_members', 'classroom_assignments', 'practice_progress', 'classroom_notifications']) {
      state.fail = table; expect((await GET()).status).toBe(500);
    }
  });
  it('requires a signed-in user', async () => {
    state.authenticated = false; expect((await GET()).status).toBe(401);
  });
  it('does not send an empty classroom filter to the grade query', async () => {
    state.noClasses = true;
    const response = await GET();
    expect(response.status).toBe(200);
    expect(state.calls.some(call => call[0] === 'submission_grades')).toBe(false);
  });
});
