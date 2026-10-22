# Route inventory

Anonymous `curl -sI` against https://outputtracer.com/ on 21 October 2026, plus the source of each page. A 200 means the URL responded. It does not mean the feature works. The compiler page is `/` and the predict API was broken (see the compiler report).

| Route | Audience | Auth in source | Live status | Result |
| --- | --- | --- | --- | --- |
| `/` | Everyone | Public IDE (`UnifiedShell`) | 200 | Shell is public. C++ run was broken live. |
| `/about` | Everyone | Public | 200 | Static |
| `/python` | Everyone | Public lab | 200 | API disabled live (503 `disabled`) |
| `/assembly` | Everyone | Public lab | 200 | Assemble API succeeded with the builtin engine |
| `/examples` | Everyone | Public | 200 | "Try in Predictor" now loads into `UnifiedShell` in this branch |
| `/practice` | Everyone | Public static bank | 200 | 10 topics, 220 questions |
| `/practice/[topic]` | Everyone | `notFound()` if the topic is missing | not probed per topic | Server render |
| `/practice/[topic]/[id]` | Everyone | Grades in the browser | not probed per id | Answer is in the client bundle |
| `/learn` | Everyone | Published courses | 200 | DB or seed fallback |
| `/learn/dashboard` | Student | Redirect if no user | 307 `/login?next=/learn/dashboard` | Pass for anonymous |
| `/learn/courses/[slug]` | Everyone | Public syllabus | not individually probed | |
| `/learn/courses/[slug]/[lesson]` | Everyone | Public lesson | not individually probed | Explanation blanked for students in this branch |
| `/login`, `/login/learner`, `/login/teacher`, `/login/admin` | Everyone | Public forms; noindex layout | 200 | |
| `/signup` | Everyone | noindex | 200 | |
| `/profile` | User | Client redirect; API 401 | 200 HTML | Page shell is public. Data requires a session. noindex layout added in this branch |
| `/projects`, `/groups`, `/p/[id]` | User | Proxy plus page `getUser()` | `/projects` 307 to login | Pass for anonymous |
| `/classroom` | Student/teacher | Client page, API 401 | 200 | Logged-out UI looks like an empty class list |
| `/classroom/student` | Student | API 401 message | 200 | |
| `/classroom/teacher` | Teacher | Server redirect | not in the first probe set; deploy script expects 307 | Source redirects |
| `/classroom/teach/apply` | Applicant | Client form | not probed | |
| `/classroom/[classId]` and children | Member | API checks | not probed with an id | Manage UI is teacher-only in the client |
| `/admin`, `/admin/learn`, `/admin/teachers` | Admin | Proxy plus `checkIsAdmin` | `/admin` 307 to login | Non-admins who are signed in see a restriction panel |
| `/auth/callback` | OAuth | Same-origin `next` | 307 `/projects` with no code | Expected without a code |
| `/dashboard`, `/compiler` | n/a | No such pages | 404 | |
| `/api` | Health | Public | 200 | Compiler version, not isolation mode |
| `/api/config` | Browser | Public anon key | 200 | Anon key is meant to be public. Service role is not in this response (source returns URL and anon key only) |
| `/robots.txt`, `/sitemap.xml` | Crawlers | | 200 | Live robots still use trailing-slash disallows until deploy |
| `https://www.outputtracer.com/` | | | 308 to apex | Pass |
| `http://outputtracer.com/` | | | 301 to HTTPS | Pass |

There was no `src/app/not-found.tsx`. Unknown URLs use the Next.js default 404 (live 404 confirmed). This branch adds a branded not-found page.

Protected routes are "signed in", not "has the role". `/admin` still checks `checkIsAdmin` in the page and in every `/api/admin` handler. `/classroom` is not in the proxy `PROTECTED` list. Its APIs call `getUser()`.

Loading, empty, and error UI were read from components, not exercised in a browser. There is no `error.tsx`. Monaco and the terminal were not clicked. Mobile layout was not screenshotted.
