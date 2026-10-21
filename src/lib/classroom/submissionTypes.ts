// ==============================================================================
// Phase 3 Types: Versioning, Grading, Execution, Activity, Contributions
// ==============================================================================

export type ActivityEventType = "save" | "run" | "submit" | "grade" | "feedback" | "reopen";
export type GradeMode = "auto" | "manual" | "mixed";
export type RunMode = "manual" | "auto_grade" | "teacher_review";

// --------------------------------------------------------------------------
// Code Versions — immutable snapshots of a student's code at a point in time
// --------------------------------------------------------------------------
export interface CodeVersion {
  id: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  versionNumber: number;
  codeFiles: Record<string, string>;
  /** SHA-256 hex digest of canonical JSON(codeFiles) for tamper detection */
  contentHash: string;
  language: string;
  createdAt: string;
}

export interface SaveVersionInput {
  assignmentId: string;
  codeFiles: Record<string, string>;
  language?: string;
  /** Either studentId or groupId must be set */
  studentId?: string;
  groupId?: string;
}

// --------------------------------------------------------------------------
// Activity Events — attributable per-user events linked to versions/submissions
// --------------------------------------------------------------------------
export interface ActivityEvent {
  id: string;
  assignmentId: string;
  actorId: string;
  eventType: ActivityEventType;
  versionId?: string;
  submissionId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// --------------------------------------------------------------------------
// Submission Snapshots — immutable, frozen code at submission time
// --------------------------------------------------------------------------
export interface SubmissionSnapshot {
  id: string;
  submissionId: string;
  versionId: string;
  assignmentId: string;
  studentId?: string;
  groupId?: string;
  frozenCodeFiles: Record<string, string>;
  contentHash: string;
  submittedAt: string;
  isLate: boolean;
}

// --------------------------------------------------------------------------
// Execution Logs — safe summaries of code runs; hidden test columns never sent to students
// --------------------------------------------------------------------------
export interface ExecutionLog {
  id: string;
  versionId?: string;
  submissionId?: string;
  assignmentId: string;
  actorId: string;
  language: string;
  stdin: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  durationMs?: number;
  publicTestsPassed?: number;
  publicTestsTotal?: number;
  /** Hidden test counts: ONLY included in server-to-teacher responses, never to students */
  hiddenTestsPassed?: number;
  hiddenTestsTotal?: number;
  runMode: RunMode;
  createdAt: string;
}

/** Student-safe view — hidden test fields always omitted */
export type StudentExecutionLog = Omit<ExecutionLog, "hiddenTestsPassed" | "hiddenTestsTotal">;

// --------------------------------------------------------------------------
// Code Diff — computed, never stored
// --------------------------------------------------------------------------
export interface DiffHunk {
  type: "equal" | "insert" | "delete";
  lines: string[];
}

export interface CodeFileDiff {
  fileName: string;
  hunks: DiffHunk[];
  addedLines: number;
  removedLines: number;
}

export interface VersionDiff {
  fromVersionId: string;
  toVersionId: string;
  fileDiffs: CodeFileDiff[];
  summary: string;
}

// --------------------------------------------------------------------------
// Rubrics — structured grading criteria
// --------------------------------------------------------------------------
export interface RubricItem {
  id: string;
  description: string;
  maxPoints: number;
}

export interface AssignmentRubric {
  id: string;
  assignmentId: string;
  items: RubricItem[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRubricInput {
  items: Array<Omit<RubricItem, "id"> & { id?: string }>;
}

// --------------------------------------------------------------------------
// Grades — always reference the exact submitted version via snapshot
// --------------------------------------------------------------------------
export interface SubmissionGrade {
  id: string;
  submissionId: string;
  snapshotId: string;
  /** The exact version that was graded — immutable reference */
  versionId: string;
  rubricScores: Record<string, number>; // rubricItemId -> pointsAwarded
  autoTestPoints: number;
  manualPoints: number;
  totalPoints: number;
  maxPoints: number;
  gradedBy: string;
  gradeMode: GradeMode;
  gradedAt: string;
  updatedAt: string;
}

export interface GradeInput {
  submissionId: string;
  rubricScores?: Record<string, number>;
  manualPoints?: number;
  gradeMode?: GradeMode;
}

// --------------------------------------------------------------------------
// Feedback — teacher annotations on a submission
// --------------------------------------------------------------------------
export interface SubmissionFeedbackItem {
  id: string;
  submissionId: string;
  teacherId: string;
  comment: string;
  fileName?: string;
  lineNumber?: number;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AddFeedbackInput {
  comment: string;
  fileName?: string;
  lineNumber?: number;
  isPrivate?: boolean;
}

// --------------------------------------------------------------------------
// Group Contribution Reports
// --------------------------------------------------------------------------
export interface GroupContributionEntry {
  studentId: string;
  displayName?: string;
  saveEventCount: number;
  runEventCount: number;
  totalEventCount: number;
  lastActiveAt?: string;
}

export interface GroupContributionReport {
  submissionId: string;
  groupId: string;
  computedAt: string;
  contributions: GroupContributionEntry[];
}

// --------------------------------------------------------------------------
// Sandbox Execution — strict external call, never run in process
// --------------------------------------------------------------------------
export interface SandboxRequest {
  files: Record<string, string>;
  stdin?: string;
  language: string;
  timeLimitMs?: number;
  memLimitMb?: number;
}

export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  compilationError?: string;
}
