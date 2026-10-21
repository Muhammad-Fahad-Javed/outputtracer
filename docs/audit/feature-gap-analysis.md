# Feature gap analysis

These are product gaps, distinct from the defects fixed in this branch.

| Gap | What exists | What a student or teacher still cannot do |
| --- | --- | --- |
| Assignment workspace | Execute, submit, version, and grade APIs | Open the assignment and press submit. The page links to `/` |
| Tests on an assignment | Columns `public_test_cases` and `hidden_test_cases` | Enter a test in the create form. The form does not collect them, and `createAssignment` stores `[]` |
| Announcements | POST API and a list | Compose one. The empty state tells teachers to post |
| Discussions, rubric editor, gradebook export | Routes | No UI caller under `src/` |
| Python course | `curriculum/python-curriculum.json` | Nothing imports it. The learn seed has C++ and 8086 only |
| Practice is not the learn gradebook | Two stores | Practice progress is a browser upsert. Learn progress is server graded. They do not share a dashboard |
| Predictor component | `Predictor.tsx` and `mockPredict` | Not mounted. The live IDE is `UnifiedShell`, which calls `/api/predict` |
| Admin moderation button | `POST /api/admin/moderation` | Dashboard shows archived state and does not call the route |
| Account deletion | `DELETE /api/profile` | Not exercised. Retention of classroom rows after delete was not traced against a database |
| Notifications | Bell and `/api/classroom/notifications` | Not clicked |

Do not describe these as shipped classroom workflows in marketing copy. The homepage can honestly offer the public C++ IDE, practice questions, the assembly lab, and courses. It should not claim that teachers can grade from the assignment page until that button exists.
