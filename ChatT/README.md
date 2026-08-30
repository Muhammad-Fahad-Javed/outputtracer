# Private Chat

A private, real-time, WhatsApp-style messaging web app built for **exactly two
people**. No sign-up, no public directory, no groups — just one secured
conversation between two pre-authorized accounts.

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Supabase**
(Auth, Postgres, Realtime, Storage).

---

## Why this stack

Supabase was chosen because it provides Auth, a relational database with Row
Level Security, Realtime (both Postgres change feeds and a Presence
channel), and private object storage — all in one place, all governed by
the same authorization primitive (RLS policies tied to `auth.uid()`). That
lets the "only two users, ever" requirement be enforced **in the database**,
not just in the React code, which is the actual security boundary here.

---

## How authorization actually works (read this first)

There are three independent layers, and all three matter:

1. **`allowed_users` table** — a two-row allow-list. A trigger on
   `auth.users` refuses to create a profile for any email not in this
   table, and a trigger on `allowed_users` itself refuses to ever let it
   grow past 2 rows.
2. **Row Level Security policies** (`supabase/migrations/0002_policies.sql`)
   — every table (`profiles`, `conversations`, `messages`, `saved_photos`)
   and the storage bucket only return/accept rows where `auth.uid()` is a
   participant. This is enforced by Postgres itself, independent of the
   Next.js app, so it holds even if someone calls the Supabase REST/JS API
   directly or edits the frontend bundle.
3. **Next.js middleware** (`src/middleware.ts`) — redirects unauthenticated
   requests away from protected routes and, as defense-in-depth, double
   checks the signed-in email against `AUTHORIZED_USER_1_EMAIL` /
   `AUTHORIZED_USER_2_EMAIL` before letting a request through.

The frontend has no sign-up page and no code path that could create a third
account — but even if that code path existed, the database would still
reject it.

---

## Project structure

```
src/
  app/
    login/            Login page (no sign-up route exists anywhere)
    chat/              The single private conversation
    memories/          Saved Photos gallery
    settings/          Profile, theme, logout
    auth/callback/     OAuth/password-reset code exchange
  components/          ChatHeader, MessageBubble, MessageInput, etc.
  hooks/               useAuthUser, usePresence, useMessages
  lib/                 Supabase clients (browser/server/admin), photo upload, formatting
  types/               Database row types
  middleware.ts        Route protection + auth allow-list check

supabase/
  migrations/          Schema (0001) and RLS policies (0002)
  policies/            Storage bucket policies (run after creating the bucket)

scripts/
  seed-users.ts               One-time: create the two accounts + conversation
  create-storage-bucket.ts    One-time: create the private photo bucket
```

---

## 1. Installation

```bash
npm install
```

## 2. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and note:

- Project URL
- `anon` public API key
- `service_role` secret key (Project Settings → API)

## 3. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
AUTHORIZED_USER_1_EMAIL=you@example.com
AUTHORIZED_USER_2_EMAIL=partner@example.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` is only ever read on the server / in one-off
scripts (`src/lib/supabase-admin.ts` is marked `server-only`, so importing it
from a Client Component fails the build). It is never sent to the browser.

## 4. Database setup

Using the Supabase SQL editor (or the CLI: `supabase db push`), run, in order:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_policies.sql`

This creates the allow-list, profiles, conversations, messages, and
saved_photos tables, plus every RLS policy described above.

## 5. Storage setup

```bash
# Loads NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from .env.local
npx dotenv -e .env.local -- npx tsx scripts/create-storage-bucket.ts
```

This creates a **private** `chat-photos` bucket (public access disabled).
Then apply the storage policies:

- Open `supabase/policies/storage_policies.sql` in the SQL editor and run it.

## 6. Create the two authorized accounts

Set (in a local, untracked env — do not put real passwords in `.env.local`
if that file might ever be committed):

```
AUTHORIZED_USER_1_EMAIL=you@example.com
AUTHORIZED_USER_1_PASSWORD=choose-a-strong-password
AUTHORIZED_USER_1_NAME=Alex
AUTHORIZED_USER_2_EMAIL=partner@example.com
AUTHORIZED_USER_2_PASSWORD=choose-a-strong-password
AUTHORIZED_USER_2_NAME=Sam
```

Then run:

```bash
npx dotenv -e .env.seed -- npx tsx scripts/seed-users.ts
```

This adds both emails to the allow-list, creates their Supabase Auth
accounts, and creates the single conversation between them. Run this once;
it's safe to re-run (it skips work that's already done).

## 7. Authentication setup

In the Supabase Dashboard → Authentication → URL Configuration, set:

- **Site URL**: `http://localhost:3000` (or your production URL)
- **Redirect URLs**: add `http://localhost:3000/auth/callback` (and the
  production equivalent)

Disable "Enable email signups" under Authentication → Providers → Email,
since this app never uses self-service sign-up — accounts are created only
via the seed script.

## 8. Realtime setup

In the Supabase Dashboard → Database → Replication, ensure the `messages`
table has Realtime enabled (Realtime is used for both live message delivery
via Postgres Changes and online/offline presence via Realtime Presence
channels — no separate configuration is needed for Presence itself).

## 9. Local development

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with one of the two seeded accounts.
Open a second browser (or private window) and log in as the other account
to test real-time messaging and presence between the two.

## 10. Production deployment (Vercel + Supabase)

1. Push this repo to GitHub.
2. Import it into Vercel.
3. Add these environment variables in Vercel's Project Settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (only needed if you run seed scripts via a
     Vercel-hosted script/CI job — otherwise you can omit it from the
     deployed app entirely and only use it locally)
   - `AUTHORIZED_USER_1_EMAIL`
   - `AUTHORIZED_USER_2_EMAIL`
   - `NEXT_PUBLIC_SITE_URL` — set to your production URL
4. In Supabase → Authentication → URL Configuration, add your production
   URL and `https://your-domain.com/auth/callback` as an allowed redirect.
5. Deploy.

---

## Security checklist (matches the acceptance tests in the spec)

- [x] No `/register`, `/signup`, or `/create-account` route exists.
- [x] Login only works for the two seeded accounts — enforced by the
      `allowed_users` allow-list + triggers, not just the login form.
- [x] Unauthenticated visits to `/chat`, `/memories`, `/settings` redirect
      to `/login` (middleware).
- [x] A third authenticated account (if one somehow existed) is rejected by
      every RLS policy on `profiles`, `conversations`, `messages`, and
      `saved_photos`, and by the storage bucket policies.
- [x] Messages and photos persist in Postgres / Supabase Storage — nothing
      critical lives in `localStorage` (only the light/dark theme
      preference does).
- [x] The `chat-photos` bucket is private; photos are served via
      short-lived signed URLs, never permanent public links.
- [x] Presence is driven by an actual Realtime Presence channel (WebSocket
      heartbeat + join/leave events), not by "does a profile row exist."
- [x] No service-role key is ever imported into a Client Component
      (`server-only` enforces this at build time).

## What was intentionally left out

Per the spec's "do not overbuild" section, this app has no groups, no
public rooms, no user discovery/search, no friend requests, and no social
features beyond the single private conversation, its saved photos, and
basic profile/theme settings.
