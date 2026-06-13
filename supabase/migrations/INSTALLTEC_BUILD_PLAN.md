# INSTALLTEC BUILD PLAN

## Document Purpose

This document contains everything that still needs to be built in the Installtec application. It does NOT cover the Accountant Module, which is being built by a separate Claude Code session.

This document is for Claude Code to follow as a structured build guide. Implementation must proceed PHASE BY PHASE, with explicit user verification between each PHASE only.

---

# CRITICAL WORKING RULES

These rules apply to every phase. Violating them requires explicit user confirmation.

## Rule 1 — PHASE BY PHASE EXECUTION

Build ONE COMPLETE PHASE at a time. Do not stop within a phase.

When given a phase to build:
- Build ALL features of that phase end-to-end in a single delivery
- Schema + UI + data layer + integrations all together
- Type-check once at the end (npx tsc --noEmit returns exit 0)
- Apply migrations as one batch with smoke tests
- Deliver ONE structured report at the END of the phase only

Stop and report ONLY after the entire phase is complete. Wait for verification before starting the next phase.

DO NOT slice phases into smaller pieces. DO NOT stop midway through a phase. DO NOT pause for intermediate verification.

The ONLY pause point is between phases.

## Rule 2 — Report Template After Each Phase

Every phase report must include:
- Phase name and identifier
- Migration number(s) used
- Files created (full paths)
- Files modified (summary of changes)
- Type-check status (must be exit 0)
- Smoke test status (existing app still works)
- Assumptions made without explicit specification
- Features deferred or skipped (with reasons)
- Verification checklist for user to run (must include mobile verification at 360px, 414px, 768px)

## Rule 3 — Protected Files (DO NOT MODIFY)

Never modify these unless a phase explicitly requires it:

**v1.0.1 Modules:**
- AMC engine triggers and functions (migrations 0021, 0027)
- Worker time tracking (work_order_time_entries)
- Sub-contractor flow
- Reports module Projects and Sub-contractors tabs
- Calendar conflict detection (lib/conflicts.ts)
- Free Calls module
- Quotations module
- RLS helpers

**Phase 1 Design (migrations 0040-0044):**
- material_submittals tables
- shop_drawings tables
- project_jca and project_jca_history
- Design phase gate trigger
- components/modules/design/ folder
- app/(app)/projects/[id]/material-submittal/page.tsx
- app/(app)/projects/[id]/shop-drawing/page.tsx
- app/(app)/projects/[id]/jca/page.tsx

**Phase 2 Material Supply (migration 0201):**
- project_materials, project_material_history tables
- lib/projects/materialSupply.ts
- components/modules/supply/MaterialSupply.tsx

**Phase 3 Installation (migration 0202):**
- installation_tasks, installation_task_history, installation_task_photos tables
- lib/projects/installation.ts
- components/modules/install/Installation.tsx

**Notification System (migration 0200):**
- fn_notify and related notification triggers
- lib/app-context.tsx realtime subscription
- components/NotificationBell.tsx
- notifications table

**Core Files:**
- lib/create.ts — only ADD new functions, never modify existing
- lib/db.ts — only ADD new collections and selectors
- lib/permissions.ts — only ADD new permission actions
- components/PhaseTracker.tsx — only extend gate logic where phase explicitly allows
- lib/types.ts — only ADD new interfaces

**Accountant Module:**
- All tables and code from the parallel Accountant session
- migrations 0045-0199 are owned by that session
- READ allowed from purchase_orders, po_line_items, vendors if needed for integration
- Never modify Accountant tables, code, or migrations

## Rule 4 — Migration Numbering

Current highest in Installtec range: 0202.
Next migration must be 0203 or higher.
Range 0200+ belongs to Installtec session.
Range 0045-0199 belongs to Accountant session — do NOT use those numbers.

## Rule 5 — Storage Buckets

Create buckets in migration SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('bucket-name', 'bucket-name', false)
ON CONFLICT (id) DO NOTHING;
```

Never require manual bucket creation.

## Rule 6 — Type-Check Discipline

After completing a phase: run npx tsc --noEmit and confirm exit code 0.
Do NOT report a phase as complete if type-check fails.

## Rule 7 — Honest Reporting

Every assumption made without explicit spec must be flagged in the phase report. Never silently make business decisions.

## Rule 8 — MOBILE RESPONSIVE REQUIREMENT

All UI must be fully mobile-responsive:
- Works on viewport widths from 360px to 1920px
- No horizontal scrolling at any viewport width
- Tables collapse to card layout below 720px
- Forms stack vertically on mobile
- Buttons have minimum 44px touch targets
- Modals become full-screen bottom sheets on mobile
- Text minimum 14px body text
- No hover-only interactions

Field workers heavily use phones in the field. Mobile experience is critical, especially for:
- Installation task management
- Photo uploads
- Status updates
- Notification interaction

Every phase verification checklist must include explicit mobile testing at 360px, 414px, and 768px viewports.

---

# BUILD ORDER

Phases below are listed in recommended execution order. The user controls the actual order.

**Section A — Path B Boss Feedback**
- Round 1: Worker Hours Filter (COMPLETED)
- Round 2: In-App Notifications (COMPLETED — Migration 0200)
- Round 3: Mobile Responsive Worker Pages

**Section B — Main Contractor Phases**
- Phase 1: Design (COMPLETED — migrations 0040-0044)
- Phase 2: Material Supply (COMPLETED — migration 0201)
- Phase 3: Installation (COMPLETED — migration 0202)
- Phase 4: Testing and Commissioning (T&C)
- Phase 5: Handover
- Phase 6: DLP (Defects Liability Period)
- Phase 7: Closed

**Section C — Supporting Enhancements**
- Material Request Flow Completion
- Replacement Document Upload
- Quotation Auto-Generate

---

# SECTION A — PATH B BOSS FEEDBACK

## Round 1 — Worker Hours Filter (COMPLETED)

Worker hours table now supports date chips and project filtering.

## Round 2 — In-App Notifications (COMPLETED)

Notification system end-to-end:
- 6 assignment triggers (Migration 0200)
- Realtime subscription with JWT auth (Slice N1)
- Bell badge live updates
- Cross-tab sync
- Mobile responsive

## Round 3 — Mobile Responsive Worker Pages

### Business Purpose

Workers use the application on phones in the field. Comprehensive responsive audit across the entire application.

### Phase Scope

Build all of the following in ONE delivery:

**Worker Dashboard mobile layout:**
- Cards stack vertically below 768px
- Hide secondary metadata on mobile
- Larger touch targets for action buttons (min 44px)
- Primary action button fixed at bottom of screen if applicable
- No horizontal scrolling

**Work Order Detail mobile layout:**
- Header stacks vertically (project, customer, address)
- Customer phone: tap to call (tel: link)
- Site address: tap to open maps (https://maps.google.com/?q= link)
- Start/Done buttons large and prominent
- Materials list collapses to scrollable cards
- Photo upload uses phone camera (input type=file accept="image/*" capture="environment")

**Sign In Screen mobile layout:**
- Single column layout
- Email and password inputs minimum 48px height
- Submit button full-width on mobile, minimum 56px height
- Larger forgot password link
- Proper keyboard hints (type="email")

**Comprehensive responsive audit:**
- Walk every major route at 360px viewport
- Document and fix critical horizontal scroll issues
- Document and fix hover-only interaction issues
- Document and fix touch target issues below 44px
- Verify all modals open as bottom sheets on mobile

### Verification Checklist

1. Test Worker Dashboard at 360px, 414px, 768px
2. Test Work Order Detail with native phone integrations (tel:, maps)
3. Test Sign In Screen on mobile and tablet
4. Test photo upload uses camera on real device
5. No horizontal scrolling on any page at any tested width
6. All buttons have 44px minimum touch targets
7. Existing desktop view still works at 1024px+

---

# SECTION B — MAIN CONTRACTOR PHASES

## Phase 1 — Design (COMPLETED)

Material Submittal, Shop Drawing, JCA, Phase Gate, Lock pattern.

## Phase 2 — Material Supply (COMPLETED)

Procurement tracking from approved BOM through delivery.

## Phase 3 — Installation (COMPLETED)

Zone-grouped task checklist, manual creation, photos, defects via blocked status.

## Phase 4 — Testing and Commissioning (T&C)

### Business Purpose

After Installation completes, the customer walks through the work site, signs off on each zone/area, and reports defects in a snagging list. Final acceptance certificate produced when all zones signed and no open snagging items.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- snagging_items table (zone, description, status, photos, assigned_to, completed_by, completed_at)
- zone_acceptances table (zone, customer_name, signed_at, signed_by, notes)
- acceptance_certificates table (project, generated_at, issued_to, scope_summary)
- Append-only history tables for audit
- Migration 0203
- Phase gate trigger: cannot advance to Handover until all zones signed AND no open snagging items

**UI Layer:**
- T&C summary card on project detail when project is in tc phase
- Sub-route /projects/[id]/tc with full management
- Snagging list with status workflow (open → in_progress → fixed → verified)
- Zone acceptance recording (per-zone customer sign-off)
- Acceptance certificate generation
- Audit history feed
- Mobile responsive throughout

**Phase Advancement:**
- "Advance to Handover" button
- Disabled until all zones signed and no open snagging
- Confirmation modal
- Notification fires via existing trg_project_phase_notify

**Data Layer:**
- lib/projects/tc.ts with mutators, helpers, computed values
- isReadyForHandover helper
- pendingItemsForGate helper

**Integration:**
- Update lib/hydrate.ts to fetch tc tables
- Update lib/app-context.tsx to populate mirrors
- Update lib/db.ts with collections and selectors
- Add VIEW_TC and MANAGE_TC to lib/permissions.ts
- Update lib/create.ts with mutators
- Mount summary card in Misc.tsx

### Open Questions for Client (Build With Defaults, Flag in Report)

1. Standard T&C checklist content per system (CCTV, Access Control, Fire Alarm, etc.) — build with generic placeholder, confirm with client
2. Who witnesses the testing — assumed customer for v1, document this assumption
3. Test certificate format and signature requirements — generate as PDF with text-based sign-off, defer digital signature to future

### Verification Checklist

1. Apply migration 0203
2. Open completed Installation project, advance to tc phase
3. T&C card appears on project detail
4. Add snagging items, change statuses through workflow
5. Record customer zone acceptance for each zone
6. Generate acceptance certificate
7. Try to advance to Handover before all zones signed — should be blocked
8. Sign all zones, clear all snagging — advance button enables
9. Advance to Handover — notification fires to lead tech
10. Mobile test at 360px, 414px, 768px
11. All workflows accessible at all widths

---

## Phase 5 — Handover

### Business Purpose

Final delivery of project to client. Document checklist, drawings, manuals, certificates, warranty information transferred to client.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- handover_documents table (category, file path, uploaded_at, uploaded_by, signed_off)
- handover_certificates table (project, generated_at, signed_at, signed_by)
- Append-only history table
- Migration 0204
- Phase gate trigger: cannot advance to DLP until handover certificate signed

**UI Layer:**
- Handover summary card on project detail when project is in handover phase
- Sub-route /projects/[id]/handover with document management
- Document upload by category (drawings, manuals, certificates, warranty)
- Client sign-off recording
- Handover certificate generation
- Audit history feed
- Mobile responsive

**Phase Advancement:**
- "Advance to DLP" button
- Disabled until handover certificate signed
- Notification fires automatically

**Integration:**
- All standard files (hydrate, app-context, db, create, permissions)
- Permissions: VIEW_HANDOVER, MANAGE_HANDOVER

### Open Questions for Client

1. Standard handover document checklist — build with placeholder categories
2. Digital or physical signature — assumed digital text-based for v1
3. Handover certificate template — generate with project summary

### Verification Checklist

1. Apply migration 0204
2. Open T&C complete project, advance to handover
3. Upload documents in different categories
4. Record client sign-off
5. Generate handover certificate
6. Try to advance to DLP before signing — blocked
7. Sign certificate — advance enables
8. Mobile test 360px, 414px, 768px

---

## Phase 6 — DLP (Defects Liability Period)

### Business Purpose

Post-handover warranty period (typically 12 months). Defects during DLP are repaired at no charge under warranty.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- dlp_tickets table (project, reported_at, description, status, resolution, resolved_at)
- dlp_periods table (project, start_date, end_date, duration_months)
- Append-only history table
- Migration 0205
- Phase gate trigger: cannot advance to Closed until DLP period expires
- DLP expiry alerts (using existing notification system)

**UI Layer:**
- DLP summary card on project detail when project is in dlp phase
- Sub-route /projects/[id]/dlp with ticket management
- Ticket creation, assignment, resolution
- DLP period countdown display
- Audit history feed
- Mobile responsive

**Phase Advancement:**
- "Advance to Closed" button enabled only when DLP period expired
- Optional conversion to AMC contract at end

**Integration:**
- All standard files
- Permissions: VIEW_DLP, MANAGE_DLP

### Open Questions for Client

1. Standard DLP duration — default 12 months, configurable per project
2. Auto-convert to AMC or manual? — default manual
3. Reporting required during DLP — monthly summary

### Verification Checklist

1. Apply migration 0205
2. Open handed-over project, confirm DLP period set
3. Create DLP tickets, assign, resolve
4. Confirm advance blocked until period expires
5. Mock DLP expiry via SQL date manipulation
6. Confirm advance enables
7. Mobile test

---

## Phase 7 — Closed

### Business Purpose

Project archived. Read-only view. Final retention released, documentation archived.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- Closure checklist columns added to projects table
- Migration 0206
- Read-only conversion when phase = 'closed'

**UI Layer:**
- Closed summary card showing key metrics (total cost, total invoiced, profit margin if available)
- Read-only access to all project sub-pages
- Archive flag and date display
- Mobile responsive

**Phase Advancement:**
- "Reopen Project" option for admin/md only
- Confirmation modal required

**Integration:**
- Apply read-only state across all sub-pages
- Permissions: REOPEN_CLOSED_PROJECT (admin/md only)

### Open Questions for Client

1. Can closed projects be reopened? — assumed yes, admin/md only
2. Archive duration — default permanent, configurable

### Verification Checklist

1. Apply migration 0206
2. Take DLP-complete project, advance to closed
3. All sub-pages render read-only
4. Archive summary card shows
5. Try to edit anything — blocked
6. As admin, click Reopen — confirmation modal
7. Confirm reopen — project returns to previous phase
8. Mobile test

---

# SECTION C — SUPPORTING ENHANCEMENTS

These can be built between phases based on user priority. Each enhancement is delivered as ONE complete phase.

## Enhancement C1 — Material Request Flow

### Business Purpose

Technicians on site may need additional materials not in original submittal. Submit request, OM approves/rejects, approved requests flow into Material Supply tracking.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- material_requests table (project, requested_by, description, model, quantity, urgency, status, approval_notes, approved_by, approved_at)
- material_request_history append-only audit
- Migration 0207

**UI Layer:**
- /material-requests route
- Submit form for technicians
- Approval queue for Operations Manager
- Status filters and list view
- Mobile responsive

**Integration:**
- Approved requests auto-create rows in project_materials with status = added_mid_phase
- Notification triggers on submit and status changes
- All standard files

### Verification Checklist

1. Apply migration 0207
2. Submit request as technician
3. OM gets notification
4. Approve request → notification to requester
5. Material appears in Material Supply with added_mid_phase flag
6. Mobile test

---

## Enhancement C2 — Replacement Document Upload

### Business Purpose

When service ticket requires replacing a part, technician documents replacement with photos. "Photo of refundable item" is mandatory for warranty/return tracking.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- Reuse existing replacement_documents pattern from migration 0039
- Add refundable_item_photo_required flag
- Migration 0208

**UI Layer:**
- General document/photo upload on service ticket pages
- Mandatory upload when "Refundable item involved" flagged
- Block ticket closure until photo uploaded
- Mobile photo capture (camera access)

### Verification Checklist

1. Apply migration 0208
2. Create service ticket with refundable item flag
3. Try to close — blocked, photo required
4. Upload photo from mobile camera
5. Close ticket — succeeds

---

## Enhancement C3 — Quotation Auto-Generate

### Business Purpose

Pre-fill standard placeholders when creating quotation from project lead instead of typing from scratch.

### Phase Scope

Build all of the following in ONE delivery:

**Data Model:**
- quotation_templates table with placeholder fields
- Migration 0209

**UI Layer:**
- "Generate from project" button on quotation create form
- Pre-fills customer info, scope text, T&C, validity period
- Template management for admin/MD
- PDF download for quotations
- Mobile responsive

### Verification Checklist

1. Apply migration 0209
2. Create quotation, click Generate from Project
3. Confirm pre-fills correct
4. Edit and save quotation
5. Download PDF
6. Mobile test

---

# OPEN QUESTIONS REQUIRING CLIENT INPUT

These questions should be raised with the client. Build with defaults and flag in reports.

**For Phase 4 T&C:**
- Standard T&C checklist per system
- Who witnesses testing
- Test certificate format

**For Phase 5 Handover:**
- Standard handover document checklist
- Digital or physical signature
- Handover certificate template

**For Phase 6 DLP:**
- DLP duration (default 12 months)
- Auto-convert to AMC or manual
- Reporting during DLP

**For Phase 7 Closed:**
- Final retention release process
- Reopening allowed and by whom

**For Enhancement C1:**
- Who approves material requests
- Cost thresholds for escalation

**For Enhancement C2:**
- Categories of replacements
- Refundable item verification process

---

# VERIFICATION PATTERN

For every phase, the user follows this pattern:

1. User applies migration in Supabase SQL Editor
2. User confirms smoke test passes (looks for ─── XXXX applied ─── message)
3. User runs through phase's verification checklist in the application
4. User tests mobile responsiveness at 360px, 414px, 768px
5. User reports results to Claude Code
6. If passing: Claude Code proceeds to next phase
7. If failing: Claude Code provides targeted hotfix

Do NOT assume verification has happened. Wait for explicit user confirmation.

---

# FINAL NOTES FOR CLAUDE CODE

- Build only what user explicitly approves
- Do NOT skip ahead to future phases
- Do NOT slice phases into sub-pieces
- Do NOT pause within a phase
- Do NOT assume specifications without flagging in report
- When in doubt, ASK the user rather than assume
- Every phase ends with a stop-and-report
- Type-check must pass after every phase
- Mobile responsive at 360px to 1920px is non-negotiable
- The ONLY pause point is between phases

End of build plan.