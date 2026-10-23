import type { ClassroomLanguage } from "./languages";
// Type definitions for OutputTracer Classroom & Teacher Verification Platform

export type TeacherApplicationStatus =
  | "draft"
  | "pending_review"
  | "info_requested"
  | "approved"
  | "rejected"
  | "suspended";

export type DecisionReasonCode =
  | "verified_credentials"
  | "institutional_affiliation_confirmed"
  | "insufficient_evidence"
  | "invalid_affiliation"
  | "policy_violation"
  | "other";

export interface TeacherApplication {
  id: string;
  userId: string;
  status: TeacherApplicationStatus;
  institutionName: string;
  institutionEmail?: string;
  department?: string;
  coursesIntended?: string;
  evidenceNotes: string;
  reviewerId?: string;
  reviewerNotes?: string;
  decisionReasonCode?: DecisionReasonCode;
  submittedAt: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherProfile {
  userId: string;
  status: "approved" | "suspended" | "revoked";
  applicationId?: string;
  approvedBy?: string;
  verifiedAt: string;
  suspendedAt?: string;
  suspensionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomAuditLog {
  id: string;
  actorId?: string;
  action: string;
  targetType: "teacher_application" | "teacher_profile" | "classroom" | "classroom_assignment" | "submission" | "user";
  targetId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
}

export interface TeacherApplicationInput {
  institutionName: string;
  institutionEmail?: string;
  department?: string;
  coursesIntended?: string;
  evidenceNotes: string;
  isDraft?: boolean;
}

export interface TeacherDecisionInput {
  decision: "approve" | "reject" | "request_info" | "suspend";
  reasonCode: DecisionReasonCode;
  reviewerNotes?: string;
}

export interface UserCapabilities {
  isAuthenticated: boolean;
  isAdmin: boolean;
  isVerifiedTeacher: boolean;
  teacherApplicationStatus: TeacherApplicationStatus | "none";
  canCreateClassroom: boolean;
}

// ==============================================================================
// Phase 2: Classrooms, Membership, Groups, and Assignments
// ==============================================================================

export type ClassroomRole = "teacher" | "assistant" | "student";

export interface ClassroomSettings {
  allowStudentDiscussions: boolean;
  requireApprovalToJoin: boolean;
}

export interface Classroom {
  language?: ClassroomLanguage;
  id: string;
  teacherId: string;
  name: string;
  subject: string;
  description: string;
  joinCode: string;
  isArchived: boolean;
  settings: ClassroomSettings;
  memberCount?: number;
  assignmentCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassroomMember {
  classroomId: string;
  userId: string;
  role: ClassroomRole;
  joinedAt: string;
  displayName?: string;
  email?: string;
}

export interface ClassroomGroup {
  id: string;
  classroomId: string;
  name: string;
  memberCount?: number;
  members?: ClassroomMember[];
  createdAt: string;
}

export interface AssignmentTestCase {
  id: string;
  name: string;
  stdin: string;
  expectedOutput: string;
  points: number;
  isHidden?: boolean;
}

export interface ClassroomAssignment {
  language?: ClassroomLanguage;
  id: string;
  classroomId: string;
  title: string;
  description: string;
  starterCode: Record<string, string>;
  publicTestCases: AssignmentTestCase[];
  hiddenTestCases?: AssignmentTestCase[]; // Stripped for students
  dueDate?: string;
  allowLate: boolean;
  /** Explicit teacher lock. Due date with late work off also freezes students. */
  locked: boolean;
  /** Students may compile and run. Teachers can run even when this is false. */
  allowRun: boolean;
  /** Stored per assignment. Classroom execution does not start a trace. */
  allowTrace: boolean;
  /** Wall-clock limit for a student or teacher run. Cannot exceed the global cap. */
  timeLimitMs: number;
  maxPoints: number;
  groupMode: boolean;
  isPublished: boolean;
  submissionCount?: number;
  createdAt: string;
  updatedAt: string;
}

export type SubmissionStatus = "draft" | "submitted" | "graded" | "returned";

export interface ClassroomSubmission {
  id: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  status: SubmissionStatus;
  codeFiles: Record<string, string>;
  submittedAt: string;
  isLate: boolean;
  grade?: number;
  feedback?: string;
  gradedBy?: string;
  gradedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateClassroomInput {
  language?: ClassroomLanguage;
  name: string;
  subject?: string;
  description?: string;
}

export interface CreateAssignmentInput {
  language?: ClassroomLanguage;
  title: string;
  description?: string;
  starterCode?: Record<string, string>;
  publicTestCases?: AssignmentTestCase[];
  hiddenTestCases?: AssignmentTestCase[];
  dueDate?: string;
  allowLate?: boolean;
  locked?: boolean;
  allowRun?: boolean;
  allowTrace?: boolean;
  timeLimitMs?: number;
  maxPoints?: number;
  groupMode?: boolean;
  isPublished?: boolean;
}
