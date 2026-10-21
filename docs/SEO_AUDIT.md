# OutputTracer — SEO Audit (pre-implementation)

Audited on branch `feature/integrate-classroom-security` (HEAD `b4fd157`), served
locally at `http://127.0.0.1:3000`. Production (`https://outputtracer.com`) was
also sampled read-only for comparison; it runs an older build.

## Route inventory

| URL | Language / tool | Indexable? | Current canonical | Issue |
| --- | --- | --- | --- | --- |
| `/` | C++ compiler IDE (multi-language shell; C++ default) | Yes | `https://outputtracer.com` | No server-rendered `<h1>`; body is a client-only (`ssr:false`) IDE. |
| `/assembly` | 8086 / DOS NASM assembly lab | Yes | `https://outputtracer.com` **(wrong)** | Canonical points at the homepage; no own canonical; no `openGraph`/`twitter` (inherits the C++ homepage ones); no `<h1>`; not in the sitemap. |
| `/python` | Python 3 trace & execution lab | Yes | `https://outputtracer.com` **(wrong)** | Same as `/assembly`. |
| `/practice` | C++ output-prediction practice index | Yes | `/practice` ✅ | Fine. |
| `/practice/[topic]` | Practice topic (10 topics) | Yes | `/practice/[topic]` ✅ | Fine; has `BreadcrumbList` JSON-LD. |
| `/practice/[topic]/[id]` | Practice question (220 total) | Yes | `/practice/[topic]/[id]` ✅ | Fine; `BreadcrumbList` JSON-LD has no visible breadcrumb trail. |
| `/examples` | C++ example programs | Yes | `/examples` ✅ (via `layout.tsx`) | Fine. |
| `/learn` | Visual CS course catalog | Yes | `/learn` ✅ | Fine. |
| `/learn/courses/[courseSlug]` | Course landing | Yes | `https://outputtracer.com` **(wrong)** | `generateMetadata` sets title/description only. |
| `/learn/courses/[courseSlug]/[lessonSlug]` | Lesson | Yes | `https://outputtracer.com` **(wrong)** | Same as above. |
| `/about` | About / product explanation | Yes | `/about` ✅ | Contains a stale, now-inaccurate product claim. |
| `/classroom` | Classroom hub (auth-gated dashboard) | Unclear | `https://outputtracer.com` **(wrong)** | Client component; cannot export `metadata`. Needs a decision. |
| `/login`, `/login/*` | Authentication | No | `https://outputtracer.com` **(wrong)** | Indexable and not blocked by `robots.txt`. |
| `/signup` | Authentication | No | `https://outputtracer.com` **(wrong)** | Indexable and not blocked by `robots.txt`. |
| `/profile`, `/admin`, `/projects`, `/groups`, `/p/[id]`, `/learn/dashboard`, `/classroom/[classId]/*` | Private dashboards / user content | No | `https://outputtracer.com` **(wrong)** | Already `Disallow`ed in `robots.txt`; no `noindex` meta. |
| `/auth/callback` | OAuth callback | No | — | Route handler; already `Disallow`ed. |
| `/api/*` | API route handlers | No | — | Already `Disallow`ed. |

### Root cause of the wrong canonicals

`src/app/layout.tsx` set `alternates: { canonical: "/" }`. Next.js **shallowly
merges** metadata, so `alternates` is **inherited** by every route that does not
declare its own. A relative canonical resolves against `metadataBase`, not the
current route — so `/assembly`, `/python`, `/classroom`, `/login`, `/signup`,
`/projects` and the `/learn/courses/*` pages all emitted:

```html
<link rel="canonical" href="https://outputtracer.com">
```

That tells Google those pages are duplicates of the homepage and should not be
indexed — including the Python and Assembly compiler pages.

## Sitemap (`/sitemap.xml`, 235 URLs)

- Static: `/`, `/practice`, `/examples`, `/learn`, `/about`.
- Dynamic: 10 practice topics + 220 practice questions.
- **Missing `/assembly` and `/python`.**
- Every entry used `lastModified: new Date()`, so `lastmod` changed on every
  request (a "this page always changed" signal that Google learns to ignore).
- No stale static `public/sitemap.xml` or `public/robots.txt` exists — nothing to
  remove; only `src/app/sitemap.ts` / `src/app/robots.ts` are in play.

## robots.txt

- `Allow: /` with `Disallow` for `/api/`, `/auth/`, `/projects/`, `/groups/`,
  `/p/`, plus (uncommitted local edit) `/admin/`, `/profile/`,
  `/classroom/*/manage/`, `/classroom/*/messages/`, `/learn/dashboard/`.
- `Sitemap:` points at `https://outputtracer.com/sitemap.xml` — correct.
- Gaps: `/login`, `/signup`, `/classroom`, `/classroom/student`,
  `/classroom/teacher` are crawlable.

## Structured data

- Root layout emits `WebSite`, `Organization`, `WebApplication` on every page.
- `WebApplication` declared `offers: { price: "0", priceCurrency: "USD" }` — an
  unverified pricing claim.
- `src/components/SeoContent.tsx` is **dead code** (imported nowhere). It holds a
  `FAQPage` JSON-LD whose questions do not match any visible FAQ, plus "free"
  claims. It never renders, so it has no current SEO effect.
- Practice pages emit `BreadcrumbList` with no visible breadcrumb trail.

## Other findings

- Open Graph / Twitter images use `/brand/logo-tile.svg`. Social platforms do not
  render SVG OG images, so the share preview is effectively blank.
- `metadataBase` is already `https://outputtracer.com` and consistent with the
  canonical-domain migration; no alternate-domain URLs exist in the codebase.
- `about/page.tsx` still says predictions use "representative example logic
  rather than a full C++ execution engine" — no longer true (real `g++`
  compile/run, GDB tracing).
- Two Google verification tokens exist: a meta tag in `layout.tsx` and
  `public/google9744c0a569ccf3ff.html`. Harmless, but worth consolidating.
- `/assembly` and `/python` return **404 on production** — they exist only on this
  branch, so they must not be advertised as live URLs until deployed.

---

# Implementation (applied)

## Canonicals

- Removed the root-layout `alternates.canonical`. Every indexable route now
  declares its own self-referencing canonical:
  `/`, `/assembly`, `/python`, `/practice`, `/practice/[topic]`,
  `/practice/[topic]/[id]`, `/examples`, `/learn`,
  `/learn/courses/[courseSlug]`, `/learn/courses/[courseSlug]/[lessonSlug]`,
  `/about`.
- `/login`, `/signup`, and the private routes are intentionally not given a
  canonical (they are noindex or `Disallow`ed).

## Social metadata

- Removed `title`/`description` from the root `twitter` object. Next.js then
  derives `twitter:title` / `twitter:description` from each page's own
  `openGraph`, which fixed every page in one change instead of six.
- Added the missing `og:image`, `og:site_name`, `og:type` to every page that
  overrides `openGraph` (setting `openGraph` replaces the parent object
  wholesale, so those fields had been silently dropped).

## Headings

- Added exactly one `<h1>` to `/`, `/assembly`, `/python`. The IDE and both labs
  are client-rendered, so these pages previously shipped with no `<h1>` at all.
  The headings use `sr-only` so the UI is byte-for-byte visually unchanged;
  `sr-only` is confirmed present in the generated CSS (absolute, 1px, no layout
  impact).

## Sitemap

- Added `/python` and `/assembly`.
- Dropped `lastModified: new Date()` from every entry (it changed on every
  request and was therefore meaningless).
- All 237 URLs verified to return HTTP 200.

## robots.txt

- Added `Disallow: /classroom/student/` and `/classroom/teacher/` (private
  dashboards that were crawlable). Existing entries untouched.

## Structured data

- Removed the `offers` / `price: "0"` claim from the root `WebApplication`
  schema: pricing is not verified anywhere in the repository.
- No per-language `SoftwareApplication` schema added — the languages are parts of
  one product, not separate products.
- `WebSite`, `Organization`, `WebApplication`, and `BreadcrumbList` all parse as
  valid JSON on every sampled page.

## Content

- `about/page.tsx`: replaced the stale "representative example logic rather than
  a full C++ execution engine" paragraph with an accurate description of the
  current compiler/tracer.

## Not changed (needs a decision)

- `src/components/SeoContent.tsx` is dead code containing a `FAQPage` whose
  questions do not match any visible FAQ, plus "free" claims. Not rendered
  anywhere; left in place.
- OG images still point at an SVG (`/brand/logo-tile.svg`). Social platforms do
  not render SVG previews; a PNG/JPG (or `opengraph-image.tsx`) is needed.
- `/classroom` (hub) remains indexable with no canonical and inherits the root
  `<title>`; it is a client component so it cannot export metadata directly.
- `/practice/*` `BreadcrumbList` has no visible breadcrumb trail.
- The homepage IDE is client-only (`ssr:false`), so its crawlable HTML is a
  loading state plus the metadata.

