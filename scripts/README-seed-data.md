# Demo seed data

SQL scripts that populate the Installtec database with one complete,
realistic project lifecycle plus its accounting data — so the Playwright
documentation screenshots (see [screenshots/README.md](screenshots/README.md))
capture real content instead of empty pages.

> ⚠️ **NOT for production.** This is documentation / demo data only. It is
> safe to add to a dev or staging database you control, and is fully
> reversible with the clean script.

---

## Files

| File | Purpose |
|---|---|
| [seed-demo-data.sql](seed-demo-data.sql) | Inserts all demo data. Idempotent, single transaction. |
| [clean-demo-data.sql](clean-demo-data.sql) | Removes all demo data (FK-safe order). |
| [../docs/sample-data/feb-2026-bank-statement.csv](../docs/sample-data/feb-2026-bank-statement.csv) | Bank statement to upload in the Bank Reconciliation tab. |

---

## How to run

1. Open your project in **Supabase → SQL Editor**.
2. Paste the entire contents of **`seed-demo-data.sql`** and click **Run**.
   - It runs as the service role, so RLS is bypassed and all triggers
     (auto-numbering, total roll-ups, audit history) fire normally.
   - It is wrapped in `BEGIN/COMMIT` — any error rolls everything back.
3. (Optional) paste the `POST-RUN VERIFICATION` queries at the bottom of the
   seed file to confirm the rows landed.

You can also run it from the CLI if you have `psql` access:

```bash
psql "$DATABASE_URL" -f scripts/seed-demo-data.sql
```

### Bank statement (item 13)

The CSV is **not** seeded into the database — bank statements are created by
uploading a file in the app. After seeding, go to **Accountant → Bank
Reconciliation → Import CSV** and upload
`docs/sample-data/feb-2026-bank-statement.csv`. Its rows match the seeded
invoice payment, the two POs, payroll and the DEWA/Etisalat expenses, so
auto-matching has something to find.

---

## What it creates

| # | Data | Notes |
|---|---|---|
| 1 | **Customer** "Marina Bay Office LLC" | tier *Key* |
| — | **Site** "Marina Bay Tower" | holds the contact (Ahmed Al-Mansoori, phone, email), address, and the customer TRN — see schema note below |
| 2 | **Project** `PRJ-2026-DEMO` | "Marina Bay Tower - CCTV & Access Control Installation", AED 285,000, status *In Progress*, phase *Design* |
| 3 | **Material Submittal** | 15 line items, Approved (rev 1) |
| 4 | **Shop Drawing** | Approved (rev 1); title/number stored in the revision description |
| 5 | **JCA** | materials 110k / manpower 35k / subcontractor 15k / other 21.5k / margin 20% |
| 6 | **Vendors** ×3 | Al Futtaim Technologies, Emirates Cable Industries, Pioneer ELV Services |
| 7 | **Purchase Orders** ×2 | PO→AFT (AED 24,675) and PO→ECI (AED 4,725), both Approved |
| 8–9 | **Invoice** + **payment** | 5 lines = AED 190,000 + 5% VAT = **199,500**; fully paid (payment trigger flips status to *Paid*) |
| 10 | **Employees** ×4 | Mohammed Saleem, Rajesh Kumar, Ahmed Mahmoud, Ali Rahman (probation), with UAE details |
| 11 | **Expenses** ×6 | Feb 2026 — 5 paid + 1 (Travel, AED 7,500) pending approval (above the 5,000 threshold). Plus 1 recurring template. |
| 12 | **Payroll run** | Feb 2026, *Draft*, 4 lines seeded; +500 OT (Mohammed), +1,000 bonus (Rajesh) |

### How the data interlocks

The bank statement, invoice payment, PO totals, payroll total and expenses
all reference the same amounts and February-2026 dates, so the lifecycle and
accountant screenshots tell one coherent story.

---

## Clean & reseed

To wipe the demo data and start fresh:

1. Paste **`clean-demo-data.sql`** into the SQL Editor and **Run**.
2. Paste **`seed-demo-data.sql`** again.

The seed is **idempotent** — running it twice without cleaning will not
create duplicates (each section is guarded by a natural key or a
`[demo-seed]` marker). Use the clean script when you want a truly fresh set
(e.g., after editing the seed amounts).

The clean script only deletes rows carrying the demo marker
(`notes like '%[demo-seed]%'`, the project `code = 'PRJ-2026-DEMO'`, or the
customer `demo-seed` tag), so it will not touch real records.

---

## Schema notes (brief vs. actual schema)

The seed maps the requested data onto the real schema. Where they differ:

- **Customer contact / address / TRN** — the `customers` table has no
  contact, phone, email, address or TRN columns. Those are stored on the
  project's **site** (which has `contact_name` / `contact_phone` /
  `contact_email` / `address_line_1`); the TRN is recorded in the site's
  `access_instructions`.
- **Material Submittal prices** — `material_items` stores description +
  model number + quantity only (no price). A submittal is a design-phase
  list; prices live on the PO / invoice / JCA.
- **Shop Drawing title / number** — `shop_drawings` has no title or
  drawing-number column; both are stored in the revision's `description`,
  and the note in `client_comments`.
- **JCA status** — `project_jca` is an internal budget with **no** approval
  status. The requested "Equipment rental" (5,000) and "Overheads" (16,500)
  are merged into `other_charges` (21,500); the requested "Total estimated
  cost" 181,500 = materials + manpower + subcontractor + other.
- **Totals are trigger-maintained** — invoice, PO and payroll-run totals are
  computed by database triggers from their line items, so the seed inserts
  the lines and lets the triggers roll up the headers.
- **Auto-numbered codes** — invoice numbers (`INV-…`), PO numbers (`PO-…`),
  material/shop-drawing codes (`MS-…` / `SD-…`), employee codes (`EMP-…`)
  and the payroll run code (`PR-2026-02`) are assigned by triggers, not by
  the seed.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `null value in column "created_by"` or actor is NULL | No `superadmin@sirahdigital.in` user and no admin/md user exists. Create an admin user first; `created_by` columns are nullable so the seed still completes, just without an actor. |
| Manager not set on the project | No active user whose name contains "Yusuf"; the seed falls back to the admin/super-admin actor. |
| Lead tech blank on the project | No active `lead_worker` user exists — that field is left NULL (valid). |
| `duplicate key` on re-run | Shouldn't happen (the seed is idempotent). If you edited natural keys, run the clean script first. |
| Expense insert error about receipt | The trigger requires a `receipt_path` to leave draft; the seed already sets a dummy path for each expense. |
| Can't delete an employee in clean script | That employee is referenced by a non-demo payroll run. Remove that reference first, then re-run clean. |
