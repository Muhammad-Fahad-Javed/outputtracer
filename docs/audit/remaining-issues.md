# Remaining issues

These are not fixed, or they are fixed only in code and still need an operator.

## Blocked on production access

| Item | Why it is not done |
| --- | --- |
| Deploy OT-001 and this branch | Not authorized to deploy. Live `outputtracer.com` was not changed in this pass. |
| Apply migration 0013 | Needs a backup, a staging database, and explicit approval. Not applied. |
| Apply migration 0014 | Same. Until it is applied, a signed-in browser can still insert `practice_submissions.is_correct` through PostgREST even though the app no longer does that. |
| Real student, teacher, and admin sessions | No Supabase keys, no test accounts, no Google OAuth client in this environment. |
| Staging deploy and rollback | `rollback_promoted` is in `scripts/deploy-production.sh` and was not executed against a host. |
| Confirm production bubblewrap | This VM now has bubblewrap. The EC2 host was not inspected. If production has no bubblewrap, the new policy refuses public C++ execution instead of using `unshare --net`. Set `ALLOW_FILESYSTEM_VISIBLE_SANDBOX=1` only after accepting that the host filesystem stays visible. |

## Still open in the product

| Item | Notes |
| --- | --- |
| GDB variable quality | A traced `int x = 1` produced one step, but the variable string included `argc`, `argv`, and unwind internals. Output was correct. The step text is not a reliable view of `x`. |
| CSP enforcement | The policy is report-only. It allows `'unsafe-inline'` and `'unsafe-eval'` because Monaco and Next need a browser pass before enforcement. |
| HSTS | Off until `ENABLE_HSTS=1` after the certificate on `https://outputtracer.com` is confirmed. |
| Group submission status | `GET .../mine` loads the row where `student_id` is the caller. A group submission stored only with `group_id` is not shown there yet. |
| Assignment editor | One public test and one hidden test in the create form. There is no list editor for many cases. |
| Announcement composer | Not built. |
| Admin invite without a service client | Still not rechecked in this pass. |
| `nasm` | Not installed here. The lab uses the built-in assembler. |
| Python | Still disabled unless a configured isolated worker is present. There is no worker in this environment. |
| Practice JSON on disk | `data/questions/*.json` still contains answers on the server. They are not passed to the client component. They are not under `public/`. |
| Collab revocation | A member who is removed keeps the socket they already opened until it closes. New joins are checked. |
| Browser end-to-end tests | No Playwright run. The assignment workspace, practice grading button, and lesson error were not clicked in a browser. |
| Logged-out classroom copy, duplicate nav, close-tab | Not changed. |

## Isolation limits that remain even with bubblewrap

Bubblewrap here is not a separate virtual machine. It hides most of the host filesystem, drops the network, and applies `prlimit`. It does not provide a dedicated uid per tenant, a disk quota beyond `RLIMIT_FSIZE`, or a guarantee against kernel bugs. `RLIMIT_NPROC` is still per uid and is shared with the Node process. A production host should prefer a container or microVM if one is available; this branch does not add one.
