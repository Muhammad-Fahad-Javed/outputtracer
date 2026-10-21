# OUTPUTTRACER CLASSROOM — STAGING VALIDATION AND PRODUCTION RELEASE RUNBOOK

**Target Branch:** `feature/outputtracer-classroom`  
**Base Branch:** `feature/outputtracer-learn`  
**Target Repository:** `https://github.com/Muhammad-Fahad-Javed/outputtracer`  
**Document Version:** 1.0.0 — Final Autonomous Handoff  

---

## 1. PRE-RELEASE STATUS & AUDIT SUMMARY

### Automated Test Suite Status
- **Vitest Suites:** 15 test files, **164 / 164 passing tests** (100% pass rate).
- **ESLint:** 0 errors across classroom, admin, and learn routes.
- **Next.js Production Build:** `npm run build` succeeds cleanly with 262 routes compiled and optimized (including static SSG practice paths and dynamic classroom API endpoints).

### Security & Integrity Fixes Implemented
1. **SEC-01 (Database Persistence Fail-Closed):**
   - Eliminated silent fallback to ephemeral in-memory state on database write failures.
   - When Supabase environment variables are configured, any failed write across code versions, snapshots, rubrics, grades, announcements, discussions, and notifications throws or returns an explicit error rather than disguising a failure as success.
2. **SEC-02 (Code Version Race Conditions):**
   - Implemented a 3-attempt conflict retry loop in `saveCodeVersion`.
   - Added database-level unique constraint in migration `0008_classroom_integrity_fixes.sql`:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS uq_assignment_code_versions_student_version
       ON public.assignment_code_versions(assignment_id, student_id, version_number)
       WHERE student_id IS NOT NULL;
     ```
3. **SEC-03 (Classroom Submissions Unique On-Conflict Constraint):**
   - Added partial unique index to support the submission upsert query deterministically:
     ```sql
     CREATE UNIQUE INDEX IF NOT EXISTS uq_classroom_submissions_student
       ON public.classroom_submissions(assignment_id, student_id)
       WHERE student_id IS NOT NULL;
     ```
4. **Mission H (CSV Formula Injection Protection):**
   - Sanitized all string cells in `exportGradebookCsv` by detecting formula prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) and prefixing them with a single quote (`'`), preventing DDE exploitation in Microsoft Excel and Google Sheets.
5. **Mission E (Sandbox Isolation Verification):**
   - Verified that `runInSandbox` uses strict AbortController timeouts (10s max), validates input limits (max 20 files, 256KB per file), and communicates via isolated HTTP endpoints (`SANDBOX_EXECUTION_URL`).
   - If `SANDBOX_EXECUTION_URL` is omitted, execution uses `/api/predict` via child process with strict resource limits, but production multi-tenant deployments should set a dedicated containerized sandbox.

---

## 2. REQUIRED ENVIRONMENT VARIABLES

Ensure the following environment variables are set in your deployment environments (`.env.production` or system environment):

| Variable Name | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase Project URL (e.g. `https://xxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase Public Anonymous API Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Privileged Service Role Key (Server-side only; never expose to client) |
| `ADMIN_USER_IDS` | Yes | Comma-separated list of platform administrator UUIDs |
| `SANDBOX_EXECUTION_URL` | Recommended | Isolated sandbox service URL (e.g. Docker runner / gVisor daemon) |
| `NEXTAUTH_URL` / `APP_URL` | Optional | Application base URL (defaults to `https://outputtracer.com`) |

> [!CAUTION]
> Never commit actual secrets or keys to the git repository. All `.env` files are excluded via `.gitignore`.

---

## 3. DATABASE MIGRATIONS GUIDE (STEP-BY-STEP)

The classroom platform requires four SQL migration files to be applied **in exact sequential order**.

### Migration Files
1. `supabase/migrations/0005_classroom_platform.sql` (Teacher applications, verified teacher profiles, classrooms, members, groups, assignments, submissions base)
2. `supabase/migrations/0006_phase3_versioning_grading.sql` (Assignment code versions, immutable submission snapshots, rubrics, grades, feedback, activity logs)
3. `supabase/migrations/0007_phase4_communications.sql` (Announcements, discussions, notifications, abuse reports)
4. `supabase/migrations/0008_classroom_integrity_fixes.sql` (Partial unique indexes for race condition prevention and UPSERT determinism)

### Step 3.1: Staging Database Application (Recommended First)
1. Open your Supabase Dashboard for your **Staging Project**.
2. Navigate to **SQL Editor** -> **New Query**.
3. Open `supabase/migrations/0005_classroom_platform.sql`, copy all contents, paste into the SQL editor, and click **Run**.
4. Repeat for `0006_phase3_versioning_grading.sql`.
5. Repeat for `0007_phase4_communications.sql`.
6. Repeat for `0008_classroom_integrity_fixes.sql`.

### Step 3.2: Post-Migration Database Health Check
Run the following SQL verification script in your Supabase SQL Editor:

```sql
-- 1. Check all required tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'teacher_applications',
    'teacher_profiles',
    'classrooms',
    'classroom_members',
    'classroom_groups',
    'classroom_group_members',
    'classroom_assignments',
    'classroom_submissions',
    'assignment_code_versions',
    'submission_snapshots',
    'assignment_rubrics',
    'submission_grades',
    'submission_feedback',
    'assignment_activity_events',
    'assignment_execution_logs',
    'classroom_announcements',
    'classroom_discussions',
    'classroom_notifications',
    'classroom_abuse_reports'
  )
ORDER BY table_name;

-- 2. Verify RLS is enabled on all tables
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename LIKE 'classroom%' OR tablename LIKE 'assignment%' OR tablename LIKE 'submission%' OR tablename LIKE 'teacher%';

-- 3. Verify unique indexes from 0008
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname IN (
    'uq_classroom_submissions_student',
    'uq_classroom_submissions_group',
    'uq_assignment_code_versions_student_version',
    'uq_assignment_code_versions_group_version'
  );
```

---

## 4. STAGING VERIFICATION CHECKLIST

Perform these sanity checks in your staging environment before deploying to production:

- [ ] **Teacher Application Flow:**
  - Submit application as a non-verified user at `/classroom/teach/apply`.
  - Log in with an admin account listed in `ADMIN_USER_IDS` and navigate to `/admin/teachers`.
  - Approve the teacher application. Verify the applicant now displays the verified educator badge.
- [ ] **Classroom & Group Creation:**
  - Create a new classroom as the verified teacher.
  - Create student collaboration groups within the classroom.
  - Note the generated join code (e.g. `OT-XXXXXXX`).
- [ ] **Student Enrollment:**
  - Log in with a student account and join using the join code.
  - Verify student is added to `classroom_members`.
- [ ] **Assignment & Sandboxed Submission:**
  - Create a published assignment with public and hidden test cases.
  - Switch to student account, write code, and save versions (verify `version_number` increments: 1, 2, 3...).
  - Submit assignment and verify submission snapshot is immutable.
- [ ] **Grading & Feedback:**
  - As teacher, trigger auto-grading and review test case results (hidden test cases must not leak to student UI).
  - Add rubric scores and teacher feedback.
- [ ] **Communications & Moderation:**
  - Create an announcement; verify student receives a notification.
  - Post in assignment discussion; test replying to threads.
  - Test reporting a message for moderation.
- [ ] **Gradebook CSV Export:**
  - Export gradebook as teacher; verify CSV downloads with proper escaping and formula protection.
  - Confirm student cannot export the gradebook.

---

## 5. AWS / PRODUCTION RELEASE INSTRUCTIONS

Once staging validation is complete:

1. **Database Migration:**
   - Apply migrations `0005`, `0006`, `0007`, and `0008` to the production Supabase instance using the Supabase SQL editor.
2. **Git Commit & Push:**
   - Stage and commit the local integrity fixes:
     ```bash
     git add src/ supabase/ migrations/ docs/
     git commit -m "feat(classroom): Phase 6 release readiness — fail-closed persistence, unique constraint fixes, and staging runbook"
     git push origin feature/outputtracer-classroom
     ```
3. **Pull Request & Code Review:**
   - Open a Pull Request from `feature/outputtracer-classroom` into `feature/outputtracer-learn`.
   - Complete review and merge.
4. **Production Server Deployment (AWS EC2 / PM2):**
   - Pull the updated branch on your production EC2 server:
     ```bash
     git pull origin <merged-branch>
     npm ci
     npm run build
     pm2 restart outputtracer --update-env
     ```
5. **Verify Live Health:**
   - Check `pm2 status` and `pm2 logs outputtracer`.
   - Test `https://outputtracer.com/classroom` and ensure existing routes (`/learn`, `/assembly`, `/practice`, `/projects`) are completely unaffected.

---

## 6. ROLLBACK PLAN

If an unexpected production defect is detected:

### Step 6.1: Application Code Rollback
```bash
# Revert to previous production commit
git checkout <previous-commit-hash>
npm ci
npm run build
pm2 restart outputtracer --update-env
```

### Step 6.2: Database Considerations
- The classroom tables and migrations are purely additive and do not alter or delete existing tables (`profiles`, `projects`, `learn_courses`, etc.).
- There is no need to drop classroom tables during an application rollback; simply reverting the frontend/API code disables classroom access safely.
