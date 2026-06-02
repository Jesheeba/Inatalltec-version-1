# Deployment — Vercel + Supabase

Installtec OS is a Next.js 14 (App Router) app with Supabase as the data/auth backend. This is the production deployment guide.

## 1. Supabase (one-time)

Your project already exists at `shiptvhusbnrzdwpldkz.supabase.co`. If you're starting fresh:

1. Create a new project at https://supabase.com/dashboard.
2. In the SQL Editor, run, in order:
   - `supabase/setup.sql` — schema, roles, RLS policies
   - `supabase/migrations/*.sql` — apply each migration in filename order
   - `supabase/seed.sql` — only if you want demo data
3. From **Project Settings → API**, copy:
   - `Project URL` → goes into `NEXT_PUBLIC_SUPABASE_URL`
   - `anon / publishable key` → goes into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `service_role / secret key` → goes into `SUPABASE_SECRET_KEY` (server-only — never expose)
4. **Authentication → URL Configuration**:
   - Site URL: `https://<your-vercel-domain>.vercel.app` (or custom domain)
   - Redirect URLs: add the same URL plus any preview URLs you care about

## 2. Vercel — first deploy

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. https://vercel.com → **Add New → Project** → import the repo.
3. Framework preset auto-detects **Next.js**. Leave defaults:
   - Build command: `next build`
   - Output: `.next`
   - Install: `npm install`
   - Node version: 20.x
4. **Environment Variables** — add the four below to **Production** *and* **Preview**:

   | Variable | Value | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase dashboard | Exposed to browser |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | anon/publishable key | Exposed to browser, RLS-gated |
   | `SUPABASE_SECRET_KEY` | service-role key | **Server-only.** Bypasses RLS |
   | `NEXT_PUBLIC_USE_MOCK_DATA` | `false` | Must be false in prod |
   | `NEXT_PUBLIC_ROLE_SWITCHER` | `false` | Must be false in prod |

5. Click **Deploy**. First build takes ~2 min.

## 3. Post-deploy sanity checks

After the first deploy, hit the live URL and verify:

- [ ] `/` redirects to `/dashboard` → which redirects to `/login` (unauthenticated)
- [ ] Login with a real Supabase user lands on `/dashboard`
- [ ] Topbar **does not** show a role switcher
- [ ] Creating a user via Admin works (proves `SUPABASE_SECRET_KEY` is wired)
- [ ] Hard refresh on any protected page keeps you signed in (cookie/SSR session works)

If `/login?config=missing` appears, the Supabase env vars didn't reach the build — re-check Vercel env settings and redeploy.

## 4. Custom domain (optional)

Vercel → Project → **Settings → Domains** → add your domain → follow DNS instructions. Then go back to Supabase **Auth → URL Configuration** and update Site URL + Redirect URLs to the new domain.

## 5. Ongoing

- Every push to `main` → production deploy.
- Every PR → preview deploy with its own URL (env vars inherited from Preview scope).
- Roll back instantly via Vercel → Deployments → **Promote** an older build.
- Supabase schema changes: write a new `supabase/migrations/NNNN_*.sql` and run it in the Supabase SQL Editor (or via `supabase db push` if you set up the CLI).

## What's NOT going to Render

Nothing. This project has no separate backend service — Supabase is the backend (managed Postgres + Auth + Storage). All server-side code (API routes, middleware, server components) lives inside the Next.js app and deploys to Vercel as serverless/edge functions.
