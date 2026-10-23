# Remaining issues

The status table that this audit now maintains is [../OUTPUTTRACER_AUDIT_TRACKER.md](../OUTPUTTRACER_AUDIT_TRACKER.md). Rows below that were closed after this file was first written are marked there.

These are not fixed, or they are fixed only in code and still need an operator.

## Blocked on database configuration or authenticated access

| Item | Why it is not done |
| --- | --- |
| Apply migration 0013 | Needs a backup, a staging database, and explicit approval. Not applied. |
| Apply migration 0014 | Same. Until it is applied, a signed-in browser can still insert `practice_submissions.is_correct` through PostgREST even though the app no longer does that. |
| Real student, teacher, and admin sessions | Supabase is connected, but no disposable role-specific test accounts or verified Google OAuth flow were available in this pass. |

## Still open in the product

| Item | Notes |
| --- | --- |
| GDB variable quality | Closed in code. `readableTraceVariables` drops `argc`, `argv`, and runtime symbols before a step is returned. Unit-tested. A fresh GDB session was not re-captured after the filter. |
| CSP enforcement | The policy is report-only. It allows `'unsafe-inline'` and `'unsafe-eval'` because Monaco and Next need a browser pass before enforcement. |
| HSTS | Off until `ENABLE_HSTS=1` after the certificate on `https://outputtracer.com` is confirmed. |
| Group submission status | Closed in code. `GET .../mine` also loads a submission whose `group_id` is a group the caller belongs to. Selection is unit-tested. The query was not run against Supabase. |
| Assignment editor | One public test and one hidden test in the create form. There is no list editor for many cases. |
| Announcement composer | Closed for the class page. A teacher can post from the Announcements tab. Checked in the local browser against the in-memory store. |
| Admin invite without a service client | Still not rechecked in this pass. |
| `nasm` | Not installed here. The lab uses the built-in assembler. |
| Python capacity | The isolated worker is live with two concurrent slots on a one-vCPU EC2 host. Load and queue behavior still need production monitoring. |
| Practice JSON on disk | `data/questions/*.json` still contains answers on the server. They are not passed to the client component. They are not under `public/`. |
| Collab revocation | A member who is removed keeps the socket they already opened until it closes. New joins are checked. |
| Browser end-to-end tests | No Playwright run. The assignment workspace, practice grading button, and lesson error were not clicked in a browser. |
| Logged-out classroom copy, duplicate nav, close-tab | Not changed. |

## Isolation limits that remain even with bubblewrap

Bubblewrap here is not a separate virtual machine. It hides most of the host filesystem, drops the network, and applies `prlimit`. It does not provide a dedicated uid per tenant, a disk quota beyond `RLIMIT_FSIZE`, or a guarantee against kernel bugs. `RLIMIT_NPROC` is still per uid and is shared with the Node process. A production host should prefer a container or microVM if one is available; this branch does not add one.
