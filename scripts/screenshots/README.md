# Automated documentation screenshots

Playwright scripts that log in, walk the Installtec app, and save organised
screenshots to **`docs/screenshots/`** for documentation.

These are **best-effort documentation crawlers**, not a test suite. Every
click/fill is wrapped so a failure in one step only skips that single
screenshot — the run keeps going. They run **headed** (a real Chromium
window opens) with **500 ms slow-motion** so you can watch.

---

## 1. Prerequisites

1. **The dev server must be running** in another terminal:

   ```bash
   npm run dev          # serves http://localhost:3000
   ```

   It must be connected to a real Supabase project (the screenshot scripts
   sign in through the live login form). Confirm `.env.local` has
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

2. **Install Playwright** (one-time — this is what adds `@playwright/test`
   to `devDependencies`):

   ```bash
   npm install -D @playwright/test
   npx playwright install chromium
   ```

---

## 2. Test accounts

Only the **super-admin** login is hard-coded as a default. The Manager and
Accountant logins are unknown, so by default the scripts fall back to the
super-admin account. To capture accurate, role-specific UI, set the real
accounts via environment variables before running.

**PowerShell (Windows):**

```powershell
$env:PW_MANAGER_EMAIL="manager@yourdomain"
$env:PW_MANAGER_PASSWORD="..."
$env:PW_ACCOUNTANT_EMAIL="subair@yourdomain"
$env:PW_ACCOUNTANT_PASSWORD="..."
npm run screenshots:lifecycle
```

**bash / git-bash:**

```bash
PW_MANAGER_EMAIL="manager@yourdomain" PW_MANAGER_PASSWORD="..." \
PW_ACCOUNTANT_EMAIL="subair@yourdomain" PW_ACCOUNTANT_PASSWORD="..." \
npm run screenshots:accountant
```

| Variable | Purpose | Default |
|---|---|---|
| `PW_SUPERADMIN_EMAIL` / `PW_SUPERADMIN_PASSWORD` | Super-admin login | `superadmin@sirahdigital.in` / `Sirahdigital@2025` |
| `PW_MANAGER_EMAIL` / `PW_MANAGER_PASSWORD` | Operations Manager (lifecycle flow) | falls back to super-admin |
| `PW_ACCOUNTANT_EMAIL` / `PW_ACCOUNTANT_PASSWORD` | Accountant (accountant flow) | falls back to super-admin |
| `PW_BASE_URL` | Dev server URL | `http://localhost:3000` |
| `PW_SLOWMO` | ms between actions | `500` |

---

## 3. How to run

| Command | What it does | Output folder |
|---|---|---|
| `npm run screenshots:lifecycle` | Desktop (1920×1080) project lifecycle (Sections A–I) | `docs/screenshots/lifecycle/` |
| `npm run screenshots:accountant` | Desktop (1920×1080) accountant module (Sections A–H) | `docs/screenshots/accountant/` |
| `npm run screenshots:mobile` | Both flows at 360×640 | `docs/screenshots/lifecycle-mobile/` and `…/accountant-mobile/` |

Run any **single** spec directly (handy when re-shooting one flow):

```bash
npx playwright test scripts/screenshots/lifecycle.spec.ts --headed
npx playwright test scripts/screenshots/accountant.spec.ts --headed
npx playwright test scripts/screenshots/lifecycle-mobile.spec.ts --project=mobile
npx playwright test scripts/screenshots/accountant-mobile.spec.ts --project=mobile
```

---

## 4. Where screenshots are saved

```
docs/screenshots/
├── lifecycle/            01_login.png, 02_dashboard.png, 03_projects_list.png, …
├── lifecycle-mobile/     same names, 360px layout
├── accountant/           01_login.png, 02_accountant_landing.png, …
└── accountant-mobile/    same names, 360px layout
```

Files are prefixed `01_`, `02_`, … in capture order so they sort correctly
in any file explorer. Re-running a flow **overwrites** that folder's files.

---

## 5. What gets captured

**Lifecycle (`lifecycle.spec.ts`)** — login, dashboard, projects list, the
New Project modal (empty + filled), then for a discovered project: each
phase page (Design → Material Submittal/Shop Drawing/JCA, Material Supply,
Installation, T&C, Handover, DLP, Closed), the phase-advance confirm modal,
and notifications (bell dropdown + page).

**Accountant (`accountant.spec.ts`)** — login, then each tab: Settings,
Monthly View (+ the print view and the Status / CNL / P&L / Cash Flow report
modals), Invoices, Vendors, Purchase Orders, Vendor Payables, Sub-contractor
Payments, Payroll (Employees + Payroll Runs + End of Service), Expenses
(list + Reports + Recurring), Bank Reconciliation — with the primary
create/upload modal opened on each.

> **Why "best-effort"?** Real phase advancement is gated (approvals,
> deliveries, an elapsed DLP window, etc.) and create forms need existing
> customers/vendors/employees, so the scripts don't force a project through
> every gate. They capture every **page** reliably and **attempt** each
> create/advance interaction. If your test data is rich enough, more of the
> interactive captures will succeed; if not, you still get the page shots.

---

## 6. Handling failures

The run never aborts on a single failure — it logs a line and continues:

```
▶  C · Invoices
  📸  accountant/12_invoices_list.png
  ·   "New invoice" not present — skipped
```

- **A few screenshots missing?** That interaction wasn't available (e.g.
  the button is hidden for the signed-in role, or required data is absent).
  Check the console log for the `·  … skipped` / `⚠️ …` line.
- **Re-shoot just one flow:** run the single spec command from §3 instead of
  the whole batch.
- **Re-shoot interactively to debug:** add `--debug` to step through, or
  `--ui` to use the Playwright UI runner:
  ```bash
  npx playwright test scripts/screenshots/accountant.spec.ts --debug
  ```

When reporting a failure to fix, copy the console log line(s) for the step
that failed — the label (`▶ C · Invoices`) and the `·`/`⚠️` message tell us
exactly which selector to adjust.

---

## 7. Common issues & fixes

| Symptom | Cause | Fix |
|---|---|---|
| Stuck on `01_login.png`, log says "still on /login" | Wrong credentials, or dev server not pointed at Supabase | Verify the account env vars (§2) and that `npm run dev` logs in manually in a browser |
| "Account not provisioned" screen captured | The login works but that auth user has no `users` row | Use an account that exists in the `users` table |
| Everything after login is blank/empty | Logged-in role can't see that data, or there's no seed data | Set the proper role account (§2); seed a project/customer/vendor |
| Phase Sections B–H skipped | No projects exist yet | Create at least one project first (the run tries, but needs a customer/lead-tech to exist) |
| Browser doesn't open | Ran without a display / headless override | These are meant to run on a desktop with a screen; keep headed mode |
| `playwright: command not found` | Playwright not installed | Run the §1 install commands |
| First screenshot per route is slow / times out | Next.js dev compiles each route on first hit | Re-run; warmed routes are fast. Increase `PW_SLOWMO` or the per-test timeout if needed |
| `networkidle` warnings in the log | Supabase realtime keeps a socket open | Harmless — the helper bounds the wait and screenshots anyway |

---

## 8. File layout

```
playwright.config.ts                 # desktop + mobile projects, headed, slowMo
scripts/screenshots/
├── helpers.ts                       # accounts, login, shot(), forgiving click/fill/modal helpers
├── lifecycle.flow.ts                # the lifecycle walk-through (shared by desktop + mobile)
├── accountant.flow.ts               # the accountant walk-through (shared by desktop + mobile)
├── lifecycle.spec.ts                # desktop entry
├── lifecycle-mobile.spec.ts         # mobile entry  (--project=mobile)
├── accountant.spec.ts               # desktop entry
├── accountant-mobile.spec.ts        # mobile entry  (--project=mobile)
└── README.md                        # this file
```

To tweak which screens are captured, edit `*.flow.ts`. To change viewport /
slow-motion / base URL, edit `playwright.config.ts`.
