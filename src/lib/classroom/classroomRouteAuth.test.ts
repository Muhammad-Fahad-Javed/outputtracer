import { beforeEach, describe, expect, it, vi } from "vitest";

const { getClassroom } = vi.hoisted(() => ({
  getClassroom: vi.fn(async () => ({ success: false, error: "denied" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
  }),
}));

vi.mock("@/lib/classroom/classroomService", () => ({
  getClassroom,
  assignmentBelongsToClassroom: async () => true,
  callerCanUseGroup: async () => true,
}));

import { POST as execute } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/execute/route";
import { GET as rubricGet, POST as rubricPost } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/rubric/route";
import { GET as feedbackGet, POST as feedbackPost } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/feedback/route";
import { GET as gradeGet, POST as gradePost } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/grade/route";
import { GET as snapshotGet } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/submissions/[submissionId]/snapshot/route";
import { POST as submit } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/submit/route";
import { GET as versionsGet, POST as versionsPost } from "@/app/api/classroom/[classId]/assignments/[assignmentId]/versions/route";
import { GET as reportsGet } from "@/app/api/classroom/[classId]/reports/route";

const params = Promise.resolve({
  classId: "class-1",
  assignmentId: "assignment-1",
  submissionId: "submission-1",
});

function call(handler: (
  request: Request,
  context: { params: Promise<{ classId: string; assignmentId: string; submissionId: string }> }
) => Promise<Response>) {
  return handler(new Request("http://localhost/api"), { params });
}

describe("classroom routes pass user id before classroom id", () => {
  beforeEach(() => {
    getClassroom.mockClear();
  });

  const handlers = [
    ["execute", execute],
    ["rubric GET", rubricGet],
    ["rubric POST", rubricPost],
    ["feedback GET", feedbackGet],
    ["feedback POST", feedbackPost],
    ["grade GET", gradeGet],
    ["grade POST", gradePost],
    ["snapshot", snapshotGet],
    ["submit", submit],
    ["versions GET", versionsGet],
    ["versions POST", versionsPost],
    ["reports GET", reportsGet],
  ] as const;

  it.each(handlers)("%s looks up the classroom with (userId, classId)", async (_name, handler) => {
    const response = await call(handler as Parameters<typeof call>[0]);
    expect(response.status).toBe(403);
    expect(getClassroom).toHaveBeenCalledWith("user-1", "class-1");
  });
});
