import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ teacher: false, versions: {} as Record<string, object>, snapshot: null as object | null }));
vi.mock('@/lib/classroom/requestUser', () => ({ classroomRequestUser: async () => ({ id: 'u1' }), isLocalPreviewActor: () => false }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }) }));
vi.mock('@/lib/classroom/classroomService', () => ({
  getClassroom: async () => ({ success: true, isTeacher: state.teacher }),
  getAssignment: async () => ({ success: true }),
  assignmentBelongsToClassroom: async () => true,
  listCallerGroupIds: async () => ['g1'],
}));
vi.mock('@/lib/classroom/versioningService', () => ({
  getCodeVersion: async (id: string) => state.versions[id],
  getSubmissionSnapshot: async () => state.snapshot,
  computeVersionDiff: () => ({ files: [] }),
}));
import { GET as diff } from '@/app/api/classroom/[classId]/assignments/[assignmentId]/versions/route';
import { GET as snapshot } from '@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/snapshot/route';
import { GET as gradeGet, POST as gradePost } from '@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/grade/route';
import { GET as feedbackGet, POST as feedbackPost } from '@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/feedback/route';
const context = { params: Promise.resolve({ classId: 'c1', assignmentId: 'a1', submissionId: 's1' }) };
beforeEach(() => { state.teacher = false; state.versions = {}; state.snapshot = null; });
describe('history endpoint boundaries', () => {
  it('denies cross-assignment grade and feedback reads/writes to a teacher', async () => {
    state.teacher = true;
    state.snapshot = { assignmentId: 'other', studentId: 'u2' };
    for (const handler of [gradeGet, gradePost, feedbackGet, feedbackPost]) {
      expect((await handler(new Request('http://localhost/'), context)).status).toBe(403);
    }
  });
  it('denies another student’s grades and feedback', async () => {
    state.snapshot = { assignmentId: 'a1', studentId: 'u2' };
    for (const handler of [gradeGet, feedbackGet]) {
      expect((await handler(new Request('http://localhost/'), context)).status).toBe(403);
    }
  });
  it('rejects a foreign second diff version even when the first belongs to the caller', async () => {
    state.versions = { v1: { assignmentId: 'a1', studentId: 'u1' }, v2: { assignmentId: 'a1', studentId: 'u2' } };
    expect((await diff(new Request('http://localhost/?diff=v1,v2'), context)).status).toBe(403);
  });
  it('rejects cross-assignment diff and snapshot IDs for teachers', async () => {
    state.teacher = true;
    state.versions = { v1: { assignmentId: 'a1' }, v2: { assignmentId: 'other' } };
    expect((await diff(new Request('http://localhost/?diff=v1,v2'), context)).status).toBe(403);
    state.snapshot = { assignmentId: 'other', studentId: 'u1' };
    expect((await snapshot(new Request('http://localhost/'), context)).status).toBe(403);
  });
  it('rejects another group snapshot and allows the caller’s group', async () => {
    state.snapshot = { assignmentId: 'a1', groupId: 'g2' };
    expect((await snapshot(new Request('http://localhost/'), context)).status).toBe(403);
    state.snapshot = { assignmentId: 'a1', groupId: 'g1' };
    expect((await snapshot(new Request('http://localhost/'), context)).status).toBe(200);
  });
});
