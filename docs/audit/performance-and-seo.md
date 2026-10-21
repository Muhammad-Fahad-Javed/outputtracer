# Performance and SEO

## Measurements that exist

| Check | Result |
| --- | --- |
| `npm run build` (Next.js 16.3.1 Turbopack) | Success in about 20 seconds. TypeScript pass. 276 static pages generated |
| Homepage TTFB | `curl` reported about 0.41 s for the header request on 21 October 2026. One sample, not a lab score |
| Lighthouse, LCP, INP, CLS | Not run. No score is claimed |
| Bundle analyzer | Not run |

The production build compiles. It was not started with `npm start` against a Supabase project, so this is not a deploy smoke test.

## SEO

- Canonical host in source is `https://outputtracer.com` (`metadataBase`, `canonicalHost.ts`).
- Live `www` is 308 to the apex. Live HTTP is 301 to HTTPS.
- Sitemap includes `/`, practice, examples, learn, python, assembly, about, and the practice questions. It does not list learn course URLs. `lastModified` is omitted on purpose (`sitemap.ts`).
- Root layout does not set a canonical, so child routes do not inherit the homepage URL. Indexable routes set their own.
- Classroom layout is `noindex`. Login and signup are `noindex`.
- Live `robots.txt` disallows `/projects/` (with a slash). That does not match the URL `/projects`. This branch disallows the prefix `/projects` and the same for admin, profile, groups, and the learn dashboard. `/p/` is unchanged so `/practice` and `/python` stay allowed. A unit test locks that in.
- Private layouts for admin, projects, groups, profile, and `/p` now send `noindex`.
- Open Graph image is `/brand/logo-tile.svg`.
- `SeoContent.tsx` is not mounted.
- `/dashboard` and `/compiler` are 404. The compiler is `/`.

## Headers

The homepage response did not include a Content-Security-Policy. `x-powered-by: Next.js` is present. Adding a CSP that still allows Monaco, Turnstile, and Supabase needs a separate change and a browser check. It was not added in this branch.

## Accessibility notes from source, not a screen reader pass

- Manage-class labels are not wired with `htmlFor`.
- The IDE close-tab control has an empty `onClick` (`UnifiedShell`).
- Header account menu button has no `aria-expanded`.
- Three different nav bars (`UnifiedShell`, `Header`, `WorkspaceHeader`).
- Contrast and keyboard focus were not measured. WCAG was not certified.
