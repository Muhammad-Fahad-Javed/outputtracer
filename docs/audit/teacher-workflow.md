# Teacher workflow

No teacher session was used. The teacher product is a mix of working pages and APIs that the pages never call.

| Capability | UI | API | Notes |
| --- | --- | --- | --- |
| Apply to teach | `/classroom/teach/apply` | `POST /api/classroom/teacher/apply` | Insert policy allows `draft` or `pending_review`, not `approved` |
| Teacher home | `/classroom/teacher` redirects to `/classroom` or the apply page | | No separate teacher dashboard |
| Create class, join code | `/classroom` | `POST /api/classroom`, `POST /api/classroom/join` | Requires a verified teacher in the service |
| Roster, remove student | manage page | roster route | Service checks the teacher |
| Groups and email invites | manage page | groups and invitations routes | |
| Create assignment | manage form: title, description, due date, points, publish | `createAssignment` | Starter code is a hardcoded hello-world. Test arrays are empty |
| Edit tests, rubric, starter files | No form | rubric and assignment routes exist | |
| Student writes and submits | Assignment page is a viewer | submit, execute, versions | Routes rejected every member (OT-002) until this branch. Still no button |
| Auto-grade | No button | grade route `mode=auto` | Reads hidden tests with the service role. Outage no longer becomes a zero in this branch |
| Feedback | No page | feedback route | |
| Announcements | Empty state tells the teacher to post | POST exists | No composer in the UI |
| Messages | `/classroom/[classId]/messages` | messages routes | |
| Progress | manage page modal | reports/progress | |
| Gradebook CSV | No button found | `gradebook/export` | |
| Discussions and abuse reports | No composer found | discussions and reports routes | |
| Other teacher's class | `getClassroom` denies non-members | | Not tested with two live teachers |

`callerCanUseGroup` and `assignmentBelongsToClassroom` are covered in `classroom.test.ts`. A student who is not in the group cannot use that `groupId` on execute or submit.
