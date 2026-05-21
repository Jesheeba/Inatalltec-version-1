# Installtec OS - CRM & Operations

Next.js 14 (App Router) + TypeScript + Tailwind + Supabase implementation of the Installtec design prototype.

The visual design, component hierarchy, and route map are ported **verbatim** from the prototype handoff bundle in [prototype/installtec/](prototype/installtec/). All colors, spacing, typography, card styles, shadows, radii, and iconography come from the prototype's `tokens.css` (now [app/globals.css](app/globals.css)).

## Quick start

```bash
npm install
cp .env.example .env.local        # leave NEXT_PUBLIC_USE_MOCK_DATA=true for first run
npm run dev
```

Open http://localhost:3000 - it redirects to `/dashboard`. Use the **role switcher** in the top-right of the topbar to preview every role's dashboard (Admin, MD, Manager, Sales, Estimator, Lead Worker, Worker, Driver, Subcontractor, Service Support, Accounts). All 14 routes are wired against the bundled seed data so the UI is fully clickable without a Supabase project.

## Toggling to live Supabase

1. Create a Supabase project. Note its URL + publishable (anon) key + secret (service-role) key.
2. Fill `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=…
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
   SUPABASE_SECRET_KEY=…
   NEXT_PUBLIC_USE_MOCK_DATA=false
   ```
3. Apply the schema + seed:
   ```bash
   supabase link --project-ref <ref>
   supabase db reset                 # applies migrations + seed.sql
   ```
4. Create real auth users in Supabase Studio, then back-fill `users.auth_id` so the RLS helper `fn_me()` resolves them.
5. Restart `npm run dev`. The middleware will now gate all routes behind `/login`.

## Architecture

```
app/
  (auth)/login/          email-password + magic-link sign-in
  (app)/                 authenticated shell (sidebar + topbar + bottom nav)
    dashboard, workorders, feed, scheduling, approvals,
    projects, projects/[id], amc, amc/[id], repair,
    inventory, logistics, customers, customers/[id],
    team, reports, admin
  layout.tsx             html + font preloads + globals.css
  page.tsx               → /dashboard
  globals.css            ported verbatim from prototype/tokens.css

components/
  AppShell.tsx           wraps content in shell + overlay portals
  Shell.tsx              Sidebar, Topbar (with role switcher), BottomNav
  Overlays.tsx           CommandPalette, NotifDrawer, Toast, WoSlideover, ApprovalSlideover, ReactivationModal
  shared.tsx             KPI, WoCard, FeedItem, ApprovalCard, ApprovalChain, SlideOver, Modal, FilterBar, StatusBadge, PageHeader, EmptyState, CardHead
  Icon.tsx               Lucide-style icon registry (50+ icons inlined)
  modules/
    Dashboard.tsx        role-aware (Manager / Field / MD / Admin / Support / Accounts / Sales)
    WorkOrders.tsx       list + table/cards toggle
    Amc.tsx              list + detail + reactivation banner
    Approvals.tsx        queue + chain config view
    Customers.tsx        list + detail (sites, projects, AMC, timeline)
    Misc.tsx             Scheduling, Projects (list+detail), Repair, Inventory, Logistics, Team, Reports, LiveFeed, Admin

lib/
  types.ts               TS types mirroring the prototype data shapes
  db.ts                  seed data (same content as prototype/data.jsx)
  app-context.tsx        AppProvider, useApp() - drives navigation, slideovers, modals, notifications, toast
  supabase/
    client.ts            browser client (uses publishable key)
    server.ts            server client (cookie-based) + service-role admin client

middleware.ts            session refresh + auth gate (skipped when NEXT_PUBLIC_USE_MOCK_DATA=true)

supabase/
  config.toml            local-dev Supabase config
  migrations/0001_init.sql   schema, indexes, RLS, AMC reactivation trigger, fn_resolve_approver, fn_me, storage buckets
  seed.sql                   deterministic-UUID inserts mirroring lib/db.ts
```

## What's wired vs. stubbed

| Area | Status |
|---|---|
| All 14 routes + role-aware dashboards | ✅ Pixel-faithful to prototype |
| Sidebar / Topbar / Bottom nav / Command palette (⌘K) / Notification drawer / Toast | ✅ |
| Work order slideover (Overview / Tasks / Materials / Thread / Audit) | ✅ |
| Approval slideover with chain visualization | ✅ |
| AMC reactivation 3-stage modal | ✅ |
| Role switcher (dev) | ✅ |
| Mobile (< 720px) - bottom nav, table-as-card, hidden columns | ✅ |
| Tablet (721–1024px) - collapsed sidebar | ✅ |
| Desktop (1025px+) - full sidebar + main grid | ✅ |
| Supabase schema + scope-aware RLS + storage buckets | ✅ DDL in `supabase/migrations/0001_init.sql` |
| AMC payment-arrival → reactivation trigger | ✅ `fn_amc_payment_received` |
| Approver resolution function | ✅ Phase-1 stub `fn_resolve_approver` (extend per §2) |
| Audit log on user / chain mutations | ✅ `fn_admin_audit` |
| Supabase Auth UI (email/password + magic link) | ✅ `app/(auth)/login/page.tsx` |
| **Replacing seed reads with Supabase queries** | ⏭️  Each module currently reads from `lib/db.ts`. To go live: replace those reads with `supabase.from('…').select()` calls (RLS will handle scoping). Helpers in `lib/supabase/{client,server}.ts`. |
| Realtime subscriptions (live feed) | ⏭️  Schema-ready; subscribe via `supabase.channel('feed_events')` in `components/modules/Misc.tsx::LiveFeed`. |
| WhatsApp / Resend / Twilio notification fanout | ⏭️  Backend out of scope for Phase 1 UI. |

## Responsive behavior

Same breakpoints as the prototype:

- **≤ 720px** - mobile: sidebar hidden, bottom nav appears, topbar collapses, tables convert to cards, slideovers go full-screen.
- **721–1024px** - tablet: sidebar collapses to icon rail.
- **≥ 1025px** - desktop: full 240px sidebar.

## Reference

- Business / workflow spec: [MASTER_PROMPT (1).md](MASTER_PROMPT%20%281%29.md)
- Source prototype: [prototype/installtec/](prototype/installtec/) (HTML/JSX/CSS exported from Claude Design)
