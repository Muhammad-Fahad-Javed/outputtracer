# OutputTracer audit

Evidence-based audit of the repository at commit `4a8317e` (branch `main` at the start of the audit) and of https://outputtracer.com/ as it responded on 21 October 2026.

The repair branch is `cursor/full-audit-fixes-a40c`. Production was **not** redeployed by this audit. Findings that say "live" describe the site before this branch is deployed. Findings that say "fixed in this branch" are covered by tests in this commit and are not live until `scripts/deploy-production.sh` runs and `supabase/migrations/0013_close_privilege_gaps.sql` is applied.

## How to read this

| Document | Contents |
| --- | --- |
| [executive-summary.md](./executive-summary.md) | Verdict, production health, what to do first |
| [architecture.md](./architecture.md) | Stack, directories, lifecycles |
| [route-inventory.md](./route-inventory.md) | Pages probed on production and in source |
| [feature-inventory.md](./feature-inventory.md) | Feature status with evidence |
| [api-inventory.md](./api-inventory.md) | Route handlers |
| [database-and-rls.md](./database-and-rls.md) | Tables, policies, migration 0013 |
| [security-report.md](./security-report.md) | Findings with severity and whether they were exploited |
| [file-workflows.md](./file-workflows.md) | Create, save, download, and execute paths |
| [student-workflow.md](./student-workflow.md) | Learner paths |
| [teacher-workflow.md](./teacher-workflow.md) | Teacher and classroom paths |
| [admin-workflow.md](./admin-workflow.md) | Administrator paths |
| [compiler-and-tracer.md](./compiler-and-tracer.md) | C++ and Python execution |
| [assembly-lab.md](./assembly-lab.md) | 8086 lab |
| [deployment-report.md](./deployment-report.md) | How a release is built and shipped |
| [performance-and-seo.md](./performance-and-seo.md) | Headers, robots, sitemap, metadata |
| [test-results.md](./test-results.md) | Commands and counts |
| [prioritized-fix-plan.md](./prioritized-fix-plan.md) | What was fixed and what remains |
| [regression-checklist.md](./regression-checklist.md) | Checks after deploy |
| [feature-gap-analysis.md](./feature-gap-analysis.md) | Implemented versus missing product behavior |

Secrets, service-role keys, and OAuth client secrets are not recorded here.
