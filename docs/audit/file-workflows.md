# File workflows

| Operation | Implementation | Storage | Authorization | Validation | Tests | Finding |
| --- | --- | --- | --- | --- | --- | --- |
| Compile a submission | `cppRunner` writes a temp dir | OS temp, deleted after the run in the runner's `finally` (see `cppRunner.ts`) | Public for ad-hoc source. Project runs require access | `inspectSourceFiles` blocks `..`, separators, size, count | `sourceFiles.test.ts`, `cppRunner.test.ts` | OT-001 dropped argv before the file was compiled. Fixed in branch |
| Terminal run | `wsTerminal.ts` | Same temp pattern | Public, or project token when `projectId` is set | Same file inspector | Origin tests | Unauthenticated public IDE is intentional |
| Create cloud project | `createProject` RPC | `projects`, `project_files` | Signed-in owner | DB checks | cloud role tests | |
| Edit project | Yjs over `/ws/collab` | Memory hub, then `project_documents` and `project_files` | `accessFromToken` and `canEdit` | `file-create` checks names. Raw Yjs updates do not | `collabDoc.test.ts` | Document can grow past the create-file checks (open, medium) |
| Save on unload | `sendBeacon` to `POST /api/projects/[id]/sync` | Same tables | Editor | Snapshot ingest | Not an HTTP test | |
| Download project | `CloudIde.tsx` JSZip of open buffers | Browser only | Whoever has the buffers | None server-side | None | Download matches the editor, not a fresh server read |
| Delete project | `deleteProject` RPC | Supabase cascade | Owner RPC | DB | Not retested here | |
| Practice code | JSON in `data/questions` | Git | Public | Static | learn tests are separate | Answers ship to the browser |
| Learn starter code | DB or `initialData.ts` | Supabase | Published lessons are public | Admin CMS | `learn.test.ts` | |
| Assignment starter | `createAssignment` writes a fixed hello-world | `classroom_assignments.starter_code` | Teacher via service role | Title length in SQL | `classroom.test.ts` | UI does not edit starter files or tests |
| Assignment execute files | JSON `codeFiles` | version row | Member, and group member if `groupId` is set | execution client size limits | route auth test | Argument order was wrong |
| Avatar upload | `/api/profile/avatar` | storage bucket `avatars` | User folder | 2 MB and image MIME in the route | None | Bucket policy is public and the SQL error is swallowed |
| Python source | POST body | Worker or, only with the dev flag, a local script | Public when enabled | `pythonTypes` byte limits | `python.test.ts` | Host fallback no longer runs in production |
| Assembly source | POST body | In-memory session | Public | 64 KB after JSON parse | `asm.test.ts` | No body-size cap before parse |

User project files are not stored on the EC2 disk except as temp compile directories. Cloud files are Supabase rows.

Path traversal into the compile directory is rejected by `inspectSourceFiles` before `g++`. A regression test uses `../escape.cpp`.

No secret file was found in `public/`. `public/sw.js` and `public/design-spec.html` are static assets. `.env.example` contains placeholders only.
