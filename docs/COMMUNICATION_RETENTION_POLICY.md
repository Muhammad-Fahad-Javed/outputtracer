# OutputTracer Classroom: Data Retention, Moderation, and Privacy Architecture

## 1. Direct Messaging (DM) Evaluation & Architectural Decision

### Policy & Safety Conclusion
Per Phase 4 specifications: *"Add direct messaging only if its authorization, reporting, moderation, and privacy design is ready."*

**Design Verdict: HELD (Not Enabled for Unmonitored Student-to-Student DMs)**
In K-12 and collegiate computer science educational environments, unmonitored private student-to-student direct messaging poses significant compliance risks regarding:
1. **Academic Integrity & Unregulated Code Copying**: Students sharing unmonitored solutions outside assignment boundaries.
2. **Harassment & Bullying**: Lack of audit trails in student-to-student DMs without continuous automated filtering.
3. **FERPA / COPPA Compliance**: Requirements for instructor supervision and institutional data retention.

**What Phase 4 Enables Instead:**
1. **Assignment Discussion Threads**: Public peer-to-peer and student-to-teacher questions scoped strictly to an assignment.
2. **Group Collaboration Channels**: Group discussions strictly limited to teammates assigned to that group by the instructor.
3. **Instructor-to-Student Direct Feedback**: Direct, private instructor annotations, rubric grades, and feedback notices on submissions.
4. **Targeted Notifications**: System-delivered directed notices for grades, feedback, deadlines, and announcements.

---

## 2. Retention and Deletion Lifecycle

| Data Entity | Retention Period | Deletion Behavior | Moderation / Audit Trail |
| :--- | :--- | :--- | :--- |
| **Announcements** | Retained for classroom lifetime + 1 academic year post-archive. | Soft-archived on classroom archive; cascading hard delete on classroom purge. | Preserves instructor author audit log. |
| **Assignment Discussions** | Retained while assignment is active. | Cascade deleted when assignment is deleted. Soft-hidden when flagged for abuse. | `is_hidden_by_moderator` preserves original text for administrative review. |
| **Group Discussions** | Retained for group assignment duration. | Cascade deleted with group. | Scoped strictly to group members; instructor retains visibility. |
| **Notifications** | 90 days active retention. | Auto-pruned 90 days after delivery or immediately on user profile removal. | Recipients can mark read/unread. |
| **Abuse Reports** | Permanent security log (minimum 3 years). | Anonymized reporter reference if account is deleted (`on delete set null`). | Preserves decision history, timestamp, and moderator notes. |

---

## 3. Moderation & Abuse Reporting Workflow

1. **Member Reporting**:
   - Any authenticated student enrolled in the classroom can flag discussion posts, announcements, or comments.
   - Categorized under: `spam`, `harassment`, `inappropriate_content`, `academic_dishonesty`, or `other`.
2. **Instructor Triaging**:
   - Only the verified classroom instructor or platform administrator can review pending abuse reports for the classroom.
3. **Intervention**:
   - **Dismiss**: Report is marked dismissed with optional moderator notes.
   - **Resolve & Hide**: Report is resolved, and `is_hidden_by_moderator` is set to `true`. Hidden posts are immediately excluded from student queries while preserved for administrative review.
