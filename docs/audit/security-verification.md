# Security verification

Date: 2026-10-21. Environment: this cloud agent VM, not production, not a Supabase project.

## What was executed

| Check | Result |
| --- | --- |
| Hello world `POST /api/predict` with `trace: false` | `status: success`, `output: "hi"`, `meta.exitCode: 0`, compile about 267 ms, run about 19 ms |
| Same request with tracing left on | `status: success`, `output: "1"`, one GDB step. Variable text is noisy (see remaining issues). |
| Program reads `/etc/passwd` | stdout `closed`. Isolation in the same process is bubblewrap after the probe fix. |
| Integration: `#include` of a file outside the temp directory | Did not print the secret `424242` |
| Integration: outbound socket | Passed under `bwrap` |
| Integration: child environment | Does not contain the service-role key |
| Process-group timeout | Python parent forks and sleeps; after the deadline `ps` does not show the marker |
| Compiler timeout | `for(;;)` returns `timeout` |
| Output limit | stdout spam returns `output_limit` |
| Spoofed `X-Forwarded-For` | Left-most hop is ignored when the proxy is trusted |
| Practice public shape | `toPublicPracticeQuestion` has no `answer` or `explanation` |
| Lesson completion | `markLessonCompleted` returns false for `cpp-scope-shadowing` until a correct attempt exists |
| Migration files | 0013 and 0014 match the statements in `migrations.audit.test.ts`. Neither file was executed against Postgres. |
| Homepage headers on `127.0.0.1:3000` | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, `Content-Security-Policy-Report-Only`. No `X-Powered-By`. No enforcing CSP. No HSTS. |
| `deploy.sh` | Exits 1. It does not mention a live deploy in a way that runs one. |

## What was not executed

- No request was sent to production `outputtracer.com` in this pass.
- No user JWT was used against PostgREST.
- No cross-account project, submission, or collaboration session was opened.
- No hostile payload was aimed at the production host.
- CSP violations were not collected from a browser.
- Nginx was not reconfigured. The app-side rate-limit fix assumes the trusted proxy appends or sets `X-Forwarded-For`. Set `TRUSTED_PROXY_HOPS=2` when Cloudflare and Nginx both append. Prefer Nginx setting the header from `$remote_addr` (or the real-ip module) and hops `1`.

## Python

`pythonSandboxClient` still refuses a host fallback in production and when a worker URL is configured but the call fails. Python stays unavailable here because no worker is configured. That was not re-enabled.
