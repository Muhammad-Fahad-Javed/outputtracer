# Regression checklist

Use this after deploying `cursor/full-audit-fixes-a40c` and, separately, after applying migration 0013.

## Deploy

- [ ] `scripts/deploy-production.sh` completes. Candidate smoke passes before promotion.
- [ ] If you can do it on a spare host, kill the process after promotion and confirm `.next.prev` is restored. Do not do that on the only production box without a backup of `.next`.
- [ ] Homepage contains the new deployment id.
- [ ] `https://www.outputtracer.com/` is still 308 to the apex.
- [ ] `/projects` and `/admin` still redirect anonymous users to `/login`.

## Compiler

- [ ] `POST /api/predict` with `{"source":"#include <iostream>\nint main(){std::cout<<\"hi\";}","trace":false}` returns `"output":"hi"`.
- [ ] A program with `for(;;){}` returns a timeout, not a stuck PM2 process (`ps` shows no leftover `main.out` after a minute).
- [ ] A project run still requires a signed-in editor and does not accept substitute source.
- [ ] Terminal stdin still reaches a program that uses `cin`.

## Classroom

- [ ] A teacher `GET` of an assignment route that used to 403 now returns the assignment or a real 404, not "classroom not found" for their own class.
- [ ] A student who is not in the class still receives 403.
- [ ] Hidden tests are absent from the student JSON.
- [ ] After migration 0013, the student JWT cannot `select=hidden_test_cases` or `select=explanation`.
- [ ] After migration 0013, a teacher can still open the class, because those reads use the service role.

## Learn and labs

- [ ] A learn question page does not contain the answer string in the HTML before submit.
- [ ] Submitting the right answer still returns the explanation.
- [ ] `/examples` "Try in Predictor" opens `/` with that source in the C++ buffer.
- [ ] An assembly lesson still opens `/assembly` with the starter.
- [ ] `/api/python` stays 503 `disabled` until the Docker worker is configured.

## Auth

- [ ] Email login still returns to the `next` path.
- [ ] Google OAuth still returns to this host, not a staging host.
- [ ] A non-admin who opens `/admin` sees the restriction panel.

## SEO

- [ ] `robots.txt` disallows `/projects` without requiring a trailing slash.
- [ ] `/practice` and `/python` are not disallowed.
