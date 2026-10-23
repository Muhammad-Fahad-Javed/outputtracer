import { describe, it, expect } from 'vitest';
import { canReadHistory } from './historyAccess';
const actor = { actorId: 'u1', assignmentId: 'a1', isTeacher: false, groupIds: ['g1'] };
describe('history access', () => {
  it('denies other assignments even to teachers', () => {
    expect(canReadHistory({ ...actor, isTeacher: true }, { assignmentId: 'a2', studentId: 'u1' })).toBe(false);
  });
  it('allows only personal records or current group membership for students', () => {
    expect(canReadHistory(actor, { assignmentId: 'a1', studentId: 'u1' })).toBe(true);
    expect(canReadHistory(actor, { assignmentId: 'a1', studentId: 'u2' })).toBe(false);
    expect(canReadHistory(actor, { assignmentId: 'a1', groupId: 'g1' })).toBe(true);
    expect(canReadHistory(actor, { assignmentId: 'a1', groupId: 'g2' })).toBe(false);
    expect(canReadHistory(actor, { assignmentId: 'a1' })).toBe(false);
  });
  it('does not let a personal first version authorize a foreign second version', () => {
    const versions = [{ assignmentId: 'a1', studentId: 'u1' }, { assignmentId: 'a1', studentId: 'u2' }];
    expect(versions.every(v => canReadHistory(actor, v))).toBe(false);
  });
});
