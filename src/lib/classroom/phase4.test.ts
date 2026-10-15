/**
 * phase4.test.ts
 *
 * Automated test suite for Phase 4:
 * 1. Classroom announcements (creation restricted to teachers, listed for enrolled students, pinned ordering)
 * 2. Assignment discussion threads (enrolled students can post/read)
 * 3. Group discussions isolation (cross-group access is strictly denied; teacher retains access)
 * 4. Cross-classroom isolation (students from other classrooms cannot read/post)
 * 5. Targeted notification delivery (only recipient can view their notification)
 * 6. Abuse reporting workflow (students can submit; teachers can review, resolve, and hide offending posts)
 * 7. Moderated posts are hidden from student views
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createAnnouncement,
  listAnnouncements,
  createDiscussionPost,
  listDiscussionPosts,
  createNotification,
  listUserNotifications,
  markNotificationAsRead,
  submitAbuseReport,
  resolveAbuseReport,
  _resetCommunicationMemory,
  _setGroupMember,
} from "./communicationService";
import {
  createClassroom,
  joinClassroomByCode,
  _resetClassroomMemory,
} from "./classroomService";
import { _setMemoryTeacherProfile, _resetMemoryStores } from "./roles";

const TEACHER_1 = "teacher-1-uuid";
const TEACHER_2 = "teacher-2-uuid";
const STUDENT_A = "student-a-uuid";
const STUDENT_B = "student-b-uuid";
const OUTSIDER = "outsider-student-uuid";

let class1Id: string;
let class2Id: string;

beforeEach(async () => {
  _resetMemoryStores();
  _resetClassroomMemory();
  _resetCommunicationMemory();

  // Setup verified teachers
  _setMemoryTeacherProfile(TEACHER_1, {
    userId: TEACHER_1,
    status: "approved",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  _setMemoryTeacherProfile(TEACHER_2, {
    userId: TEACHER_2,
    status: "approved",
    verifiedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create Classroom 1
  const c1 = await createClassroom(TEACHER_1, { name: "CS 101: Intro to C++" });
  class1Id = c1.classroom!.id;

  // Create Classroom 2
  const c2 = await createClassroom(TEACHER_2, { name: "CS 201: Data Structures" });
  class2Id = c2.classroom!.id;

  // Enroll Student A & B in Classroom 1
  await joinClassroomByCode(STUDENT_A, c1.classroom!.joinCode);
  await joinClassroomByCode(STUDENT_B, c1.classroom!.joinCode);

  // Enroll Outsider in Classroom 2 ONLY
  await joinClassroomByCode(OUTSIDER, c2.classroom!.joinCode);
});

// ==============================================================================
// 1. Announcements
// ==============================================================================
describe("Classroom Announcements", () => {
  it("allows verified teacher to post an announcement", async () => {
    const res = await createAnnouncement(class1Id, TEACHER_1, {
      title: "Welcome to CS 101",
      content: "First assignment is posted.",
      isPinned: true,
    });

    expect(res.success).toBe(true);
    expect(res.announcement?.title).toBe("Welcome to CS 101");
    expect(res.announcement?.isPinned).toBe(true);
  });

  it("denies students from posting announcements", async () => {
    const res = await createAnnouncement(class1Id, STUDENT_A, {
      title: "Student Post",
      content: "Trying to post announcement.",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Only the classroom instructor can post announcements");
  });

  it("denies teacher of another classroom from posting announcements", async () => {
    const res = await createAnnouncement(class1Id, TEACHER_2, {
      title: "Intruder Announcement",
      content: "I teach class 2.",
    });

    expect(res.success).toBe(false);
  });

  it("lists announcements for enrolled students with pinned first", async () => {
    await createAnnouncement(class1Id, TEACHER_1, {
      title: "Normal Update",
      content: "Regular content",
      isPinned: false,
    });
    await createAnnouncement(class1Id, TEACHER_1, {
      title: "Important Exam Date",
      content: "Pinned exam date",
      isPinned: true,
    });

    const res = await listAnnouncements(class1Id, STUDENT_A);
    expect(res.success).toBe(true);
    expect(res.announcements?.length).toBe(2);
    // Pinned should be first
    expect(res.announcements![0].title).toBe("Important Exam Date");
  });

  it("denies outsiders from viewing announcements", async () => {
    await createAnnouncement(class1Id, TEACHER_1, {
      title: "Class 1 Announcement",
      content: "Secret details",
    });

    const res = await listAnnouncements(class1Id, OUTSIDER);
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();

    // Verify Outsider can access their own Classroom 2 announcements
    const res2 = await listAnnouncements(class2Id, OUTSIDER);
    expect(res2.success).toBe(true);
  });
});

// ==============================================================================
// 2. Assignment Discussions & Group Privacy
// ==============================================================================
describe("Discussion Threads & Group Isolation", () => {
  const ASSIGNMENT_ID = "asg-01";
  const GROUP_ALPHA = "grp-alpha";
  const GROUP_BETA = "grp-beta";

  beforeEach(() => {
    // Student A is in Group Alpha
    _setGroupMember(GROUP_ALPHA, STUDENT_A);
    // Student B is in Group Beta
    _setGroupMember(GROUP_BETA, STUDENT_B);
  });

  it("enrolled students can post and view assignment discussion threads", async () => {
    const postRes = await createDiscussionPost(class1Id, STUDENT_A, {
      assignmentId: ASSIGNMENT_ID,
      content: "How should we handle memory leaks in problem 2?",
    });

    expect(postRes.success).toBe(true);
    expect(postRes.post?.content).toContain("memory leaks");

    const listRes = await listDiscussionPosts(class1Id, STUDENT_B, ASSIGNMENT_ID);
    expect(listRes.success).toBe(true);
    expect(listRes.posts?.length).toBe(1);
    expect(listRes.posts![0].id).toBe(postRes.post?.id);
  });

  it("allows group members to post in their private group discussion", async () => {
    const res = await createDiscussionPost(class1Id, STUDENT_A, {
      groupId: GROUP_ALPHA,
      content: "Group Alpha private notes.",
    });

    expect(res.success).toBe(true);
  });

  it("denies a student from posting in another group's discussion", async () => {
    const res = await createDiscussionPost(class1Id, STUDENT_B, {
      groupId: GROUP_ALPHA, // Student B is in Beta, not Alpha
      content: "Spying on Alpha.",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("You are not a member of this collaboration group");
  });

  it("denies a student from viewing another group's discussion posts", async () => {
    // Student A posts in Alpha
    await createDiscussionPost(class1Id, STUDENT_A, {
      groupId: GROUP_ALPHA,
      content: "Alpha secret strategy.",
    });

    // Student B tries to read Alpha posts
    const res = await listDiscussionPosts(class1Id, STUDENT_B, undefined, GROUP_ALPHA);
    expect(res.success).toBe(false);
    expect(res.error).toContain("You cannot view discussion of other groups");
  });

  it("allows the classroom teacher to inspect any group's discussion", async () => {
    await createDiscussionPost(class1Id, STUDENT_A, {
      groupId: GROUP_ALPHA,
      content: "Alpha group project progress update.",
    });

    const res = await listDiscussionPosts(class1Id, TEACHER_1, undefined, GROUP_ALPHA);
    expect(res.success).toBe(true);
    expect(res.posts?.length).toBe(1);
  });

  it("blocks users not enrolled in the classroom from discussion posts", async () => {
    const res = await createDiscussionPost(class1Id, OUTSIDER, {
      assignmentId: ASSIGNMENT_ID,
      content: "Can I post here?",
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain("Access denied");
  });
});

// ==============================================================================
// 3. Notifications & Direct Delivery
// ==============================================================================
describe("Targeted Notifications", () => {
  it("delivers notification only to the intended recipient", async () => {
    await createNotification({
      recipientId: STUDENT_A,
      classroomId: class1Id,
      type: "grade",
      title: "Assignment Graded",
      message: "You scored 95/100 on Project 1.",
    });

    // Student A sees notification
    const resA = await listUserNotifications(STUDENT_A);
    expect(resA.success).toBe(true);
    expect(resA.notifications?.length).toBe(1);
    expect(resA.notifications![0].title).toBe("Assignment Graded");

    // Student B does NOT see Student A's notification
    const resB = await listUserNotifications(STUDENT_B);
    expect(resB.success).toBe(true);
    expect(resB.notifications?.length).toBe(0);
  });

  it("marks notification as read", async () => {
    const notif = await createNotification({
      recipientId: STUDENT_A,
      classroomId: class1Id,
      type: "feedback",
      title: "New Instructor Comment",
      message: "Great implementation of the tree traversal.",
    });

    const notifId = notif.notification!.id;
    await markNotificationAsRead(notifId, STUDENT_A);

    const resA = await listUserNotifications(STUDENT_A);
    const updated = resA.notifications?.find((n) => n.id === notifId);
    expect(updated?.isRead).toBe(true);
  });
});

// ==============================================================================
// 4. Abuse Reporting & Content Moderation
// ==============================================================================
describe("Abuse Reporting & Moderation", () => {
  it("allows student to submit an abuse report for offensive post", async () => {
    const postRes = await createDiscussionPost(class1Id, STUDENT_B, {
      assignmentId: "asg-01",
      content: "Inappropriate comment violating code of conduct.",
    });

    const reportRes = await submitAbuseReport(STUDENT_A, {
      classroomId: class1Id,
      targetType: "discussion",
      targetId: postRes.post!.id,
      reason: "harassment",
      details: "Violates classroom policy.",
    });

    expect(reportRes.success).toBe(true);
    expect(reportRes.report?.status).toBe("pending");
    expect(reportRes.report?.targetId).toBe(postRes.post!.id);
  });

  it("allows teacher to resolve report and hide offensive content from students", async () => {
    // Post offensive message
    const postRes = await createDiscussionPost(class1Id, STUDENT_B, {
      assignmentId: "asg-01",
      content: "Spam content.",
    });
    const postId = postRes.post!.id;

    // Report it
    const reportRes = await submitAbuseReport(STUDENT_A, {
      classroomId: class1Id,
      targetType: "discussion",
      targetId: postId,
      reason: "spam",
    });
    const reportId = reportRes.report!.id;

    // Teacher resolves and hides content
    const resolveRes = await resolveAbuseReport(
      reportId,
      TEACHER_1,
      class1Id,
      "resolved",
      "Spam post removed.",
      true // hide content
    );
    expect(resolveRes.success).toBe(true);

    // Student A inspecting discussions now sees ZERO posts (hidden)
    const studentView = await listDiscussionPosts(class1Id, STUDENT_A, "asg-01");
    expect(studentView.posts?.length).toBe(0);

    // Teacher inspecting discussions still sees the post flagged with isHiddenByModerator = true
    const teacherView = await listDiscussionPosts(class1Id, TEACHER_1, "asg-01");
    expect(teacherView.posts?.length).toBe(1);
    expect(teacherView.posts![0].isHiddenByModerator).toBe(true);
    expect(teacherView.posts![0].hiddenReason).toBe("Spam post removed.");
  });

  it("denies students from resolving or acting on abuse reports", async () => {
    const res = await resolveAbuseReport("rep-any", STUDENT_A, class1Id, "resolved");
    expect(res.success).toBe(false);
    expect(res.error).toContain("Instructor access required");
  });
});
