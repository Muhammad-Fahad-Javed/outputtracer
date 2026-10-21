import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getUserProfile,
  updateUserProfile,
  deleteUserAccount,
  listUsersAdmin,
  updateUserRoleAdmin,
  _resetProfileServiceMemory,
} from "./profileService";
import {
  submitTeacherApplication,
  decideTeacherApplicationAdmin,
  _resetTeacherServiceMemory,
} from "./teacherService";
import {
  getUserCapabilities,
  checkIsVerifiedTeacher,
  _resetMemoryStores,
  _setMemoryTeacherProfile,
} from "./roles";
import {
  notifyPlatformOwnerNewTeacherApplication,
  notifyTeacherApplicationDecision,
} from "./emailProvider";

describe("Unified Profiles, Roles & Administrative Control System", () => {
  beforeEach(() => {
    _resetProfileServiceMemory();
    _resetTeacherServiceMemory();
    _resetMemoryStores();
    vi.clearAllMocks();
  });

  describe("1. Shared User Profile System", () => {
    it("creates and retrieves a default unified user profile", async () => {
      const profile = await getUserProfile("user-test-1");
      // Memory fallback default
      expect(profile).toBeNull();

      const updateRes = await updateUserProfile("user-test-1", {
        fullName: "Jane Doe",
        displayName: "Jane",
        username: "jane_doe",
        bio: "Passionate about algorithms and systems programming.",
        country: "Canada",
        city: "Toronto",
        preferredLanguages: ["cpp", "asm8086"],
      });

      expect(updateRes.success).toBe(true);
      expect(updateRes.profile?.fullName).toBe("Jane Doe");
      expect(updateRes.profile?.username).toBe("jane_doe");
      expect(updateRes.profile?.preferredLanguages).toContain("asm8086");
    });

    it("rejects invalid usernames with spaces or special characters", async () => {
      const res = await updateUserProfile("user-test-2", {
        username: "invalid username with spaces!",
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain("Username can only contain lowercase letters");
    });

    it("rejects usernames that are too short (< 3 chars) or too long (> 30 chars)", async () => {
      const shortRes = await updateUserProfile("user-test-2", { username: "ab" });
      expect(shortRes.success).toBe(false);
      expect(shortRes.error).toContain("between 3 and 30 characters");

      const longRes = await updateUserProfile("user-test-2", {
        username: "a".repeat(35),
      });
      expect(longRes.success).toBe(false);
      expect(longRes.error).toContain("between 3 and 30 characters");
    });

    it("rejects excessively long bio or names", async () => {
      const bioRes = await updateUserProfile("user-test-3", {
        bio: "x".repeat(505),
      });
      expect(bioRes.success).toBe(false);
      expect(bioRes.error).toContain("Bio must not exceed 500 characters");

      const nameRes = await updateUserProfile("user-test-3", {
        fullName: "x".repeat(105),
      });
      expect(nameRes.success).toBe(false);
      expect(nameRes.error).toContain("Full name must not exceed 100 characters");
    });

    it("requires explicit confirmation phrase 'DELETE MY ACCOUNT' to delete an account", async () => {
      const wrongPhrase = await deleteUserAccount("user-test-4", "delete me please");
      expect(wrongPhrase.success).toBe(false);
      expect(wrongPhrase.error).toContain("DELETE MY ACCOUNT");

      const correctPhrase = await deleteUserAccount("user-test-4", "DELETE MY ACCOUNT");
      expect(correctPhrase.success).toBe(true);
    });
  });

  describe("2. Role Resolution and Capabilities Boundaries", () => {
    it("defaults unauthenticated visitor to non-privileged capabilities", async () => {
      const caps = await getUserCapabilities(undefined);
      expect(caps.isAuthenticated).toBe(false);
      expect(caps.isAdmin).toBe(false);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
    });

    it("recognizes ordinary authenticated student without teacher or admin permissions", async () => {
      const caps = await getUserCapabilities("student-user-123");
      expect(caps.isAuthenticated).toBe(true);
      expect(caps.isAdmin).toBe(false);
      expect(caps.isVerifiedTeacher).toBe(false);
      expect(caps.canCreateClassroom).toBe(false);
    });

    it("resolves approved teacher status correctly and grants classroom creation rights", async () => {
      _setMemoryTeacherProfile("teacher-user-456", {
        userId: "teacher-user-456",
        status: "approved",
        verifiedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const isTeacher = await checkIsVerifiedTeacher("teacher-user-456");
      expect(isTeacher).toBe(true);

      const caps = await getUserCapabilities("teacher-user-456");
      expect(caps.isVerifiedTeacher).toBe(true);
      expect(caps.canCreateClassroom).toBe(true);
    });
  });

  describe("3. Teacher Application & Notification Workflow", () => {
    it("submits a teacher application and stores it with pending_review status", async () => {
      const res = await submitTeacherApplication("teacher-applicant-1", {
        institutionName: "MIT Department of EECS",
        institutionEmail: "faculty@mit.edu",
        department: "Computer Science",
        coursesIntended: "Intro to C++ & Computer Architecture",
        evidenceNotes: "Faculty profile available at mit.edu/directory/faculty-profile",
        isDraft: false,
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("pending_review");
      expect(res.application?.institutionName).toBe("MIT Department of EECS");
    });

    it("handles draft applications with draft status", async () => {
      const res = await submitTeacherApplication("teacher-applicant-draft", {
        institutionName: "Stanford University",
        evidenceNotes: "Will add full syllabus link later",
        isDraft: true,
      });

      expect(res.success).toBe(true);
      expect(res.application?.status).toBe("draft");
    });

    it("simulates email delivery safely when email provider API key is unconfigured", async () => {
      const ownerRes = await notifyPlatformOwnerNewTeacherApplication({
        applicantName: "Dr. Alan Turing",
        applicantEmail: "turing@cambridge.ac.uk",
        institutionName: "University of Cambridge",
        submittedAt: new Date().toISOString(),
        reviewUrl: "http://localhost:3000/admin/teachers",
      });

      expect(ownerRes.success).toBe(true);
      expect(["resend", "mock"]).toContain(ownerRes.provider);

      const decisionRes = await notifyTeacherApplicationDecision({
        recipientEmail: "turing@cambridge.ac.uk",
        recipientName: "Dr. Alan Turing",
        decision: "approved",
        reviewerNotes: "Credentials verified via faculty staff registry.",
        actionUrl: "http://localhost:3000/classroom",
      });

      expect(decisionRes.success).toBe(true);
      expect(["resend", "mock"]).toContain(decisionRes.provider);
    });
  });

  describe("4. Administrator User Management & Safety Guards", () => {
    it("allows authorized administrators to review applications and grant teacher roles", async () => {
      // Create pending application
      const appRes = await submitTeacherApplication("applicant-to-approve", {
        institutionName: "Oxford University",
        evidenceNotes: "Staff directory verification Oxford",
        isDraft: false,
      });
      expect(appRes.success).toBe(true);
      const appId = appRes.application!.id;

      // Set admin in memory
      process.env.ADMIN_USER_IDS = "admin-tester-id";

      const decisionRes = await decideTeacherApplicationAdmin(
        "admin-tester-id",
        appId,
        {
          decision: "approve",
          reasonCode: "verified_credentials",
          reviewerNotes: "Verified via department website.",
        }
      );

      expect(decisionRes.success).toBe(true);
      expect(decisionRes.application?.status).toBe("approved");

      // Verify user now has verified teacher capabilities
      const caps = await getUserCapabilities("applicant-to-approve");
      expect(caps.isVerifiedTeacher).toBe(true);
    });

    it("lists platform users and allows updating user roles", async () => {
      process.env.ADMIN_USER_IDS = "admin-tester-id";
      const usersRes = await listUsersAdmin("admin-tester-id");
      expect(usersRes.success).toBe(true);
      expect(Array.isArray(usersRes.users)).toBe(true);

      const updateRoleRes = await updateUserRoleAdmin("admin-tester-id", "test-user-id", "teacher", "add");
      expect(updateRoleRes.success).toBe(true);
    });
  });
});
