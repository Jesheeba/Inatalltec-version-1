# INSTALLTEC BUILD PLAN

## Document Purpose

This document contains everything that still needs to be built in the Installtec application. It does NOT cover the Accountant Module, which is being built by a separate Claude Code session.

This document is for Claude Code to follow as a structured build guide. Implementation must proceed slice-by-slice, with explicit user verification between each slice.

---

# CRITICAL WORKING RULES

These rules apply to every slice. Violating them requires explicit user confirmation.

## Rule 1 — One Slice At A Time

After completing a slice:
- Run npx tsc --noEmit and confirm exit code 0
- Deliver a structured report (template below)
- Stop and wait for user verification
- Do NOT start the next slice until user explicitly approves

## Rule 2 — Report Template After Each Slice

Every slice report must include:
- Slice name and identifier
- Migration number used (if any)
- Files created (full paths)
- Files modified (summary of changes)
- Type-check status (must be exit 0)
- Smoke test status (existing app still works)
- Assumptions made without explicit specification
- Features deferred or skipped (with reasons)
- Verification checklist for user to run

## Rule 3 — Protected Files (DO NOT MODIFY)

Never modify these unless a slice explicitly requires it:

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

**Core Files:**
- lib/create.ts — only ADD new functions, never modify existing
- lib/db.ts — only ADD new collections and selectors
- lib/permissions.ts — only ADD new permission actions
- components/PhaseTracker.tsx — only extend gate logic where slice explicitly allows
- lib/types.ts — only ADD new interfaces

## Rule 4 — Migration Numbering

Current highest: 0044. Next migration must be 0045 or higher.
Check current state before each slice in case other sessions add migrations in parallel.

## Rule 5 — Storage Buckets

Create buckets in migration SQL:
```sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('bucket-name', 'bucket-name', false)
ON CONFLICT (id) DO NOTHING;

Never require manual bucket creation.

## Rule 6 — Type-Check Discipline

After ANY change: run npx tsc --noEmit and confirm exit code 0.
Do NOT report a slice as complete if type-check fails.

## Rule 7 — Honest Reporting

Every assumption made without explicit spec must be flagged in the slice report. Never silently make business decisions.

---

# BUILD ORDER

Section A → Section B → Section C in order, unless user explicitly requests reordering.

**Section A — Path B Boss Feedback (Build First)**
- Round 2: In-App Notifications
- Round 3: Mobile Responsive Worker Pages

**Section B — Main Contractor Phases 2 through 7**
- Phase 2: Material Supply
- Phase 3: Installation (pending client spec)
- Phase 4: T and C (pending client spec)
- Phase 5: Handover (pending client spec)
- Phase 6: DLP (pending client spec)
- Phase 7: Closed (pending client spec)

**Section C — Supporting Enhancements**
- Material Request Flow Completion
- Replacement Document Upload
- Quotation Auto-Generate

---

# SECTION A — PATH B BOSS FEEDBACK

## Round 2 — In-App Notifications

### Business Purpose

When a technician, driver, or lead technician is assigned to a Work Order, they must receive a notification in the application. Bell icon at top of page shows count. Clicking opens dropdown listing notifications. Each notification clicks through to the relevant work order.

This addresses boss feedback: "Workers do not know when they are assigned. They need to be told."

In-app only. Browser push and SMS are future enhancements.

---

### Slice 2.1 — Notification Schema and Bell Component

**Database (Migration 0045):**

Create table `notifications`:
- id (uuid, primary key)
- user_id (uuid, FK to users.id)
- type (enum: 'wo_assignment', 'wo_status_change', 'submittal_approved', 'amc_payment_received', 'phase_advanced', other)
- title (text)
- message (text)
- link_target (text — internal URL when clicked)
- entity_type (text — 'work_order', 'project', 'amc')
- entity_id (uuid — related record id)
- read_at (timestamp, nullable)
- created_at (timestamp)

**RLS Policies:**
- Each user can read only their own notifications
- Each user can update only their own notifications (to mark read)
- No delete policy (notifications permanent for audit)

**Indexes:**
- (user_id, read_at) for unread count queries
- (user_id, created_at DESC) for chronological listing

**Component:**

Create `components/NotificationBell.tsx`:
- Bell icon in top navigation bar
- Shows unread count badge if count > 0
- Click opens dropdown with recent 10 notifications
- Each notification shows title, snippet of message, relative time
- Clicking a notification: marks it read, navigates to link_target

**lib/db.ts additions:**
- notifications collection
- notificationsForUser(userId) selector
- unreadCountForUser(userId) selector

**lib/create.ts additions:**
- createNotification(userId, type, title, message, linkTarget, entityType, entityId)
- markNotificationRead(notificationId)
- markAllNotificationsRead(userId)

**Slice Deliverable:**
- Migration 0045
- NotificationBell component rendered in existing top nav
- Backend helpers
- Type check passes

**Verification Checklist:**
1. Apply migration 0045
2. Run SQL: SELECT count(*) FROM notifications — confirm table exists
3. Manually insert test notification via SQL for current user
4. Refresh app, confirm bell shows count of 1
5. Click bell, confirm dropdown shows test notification
6. Click the notification, confirm navigates to link_target and marks read
7. Confirm bell count drops to 0
8. Test with 0 notifications: bell shows no badge

---

### Slice 2.2 — Work Order Assignment Triggers

**Database (Migration 0046):**

Create trigger function `fn_notify_wo_assignment()`:
- Fires AFTER INSERT or UPDATE on work_orders
- When a worker is assigned (assigned_worker_id changes), create notification for that user
- When a lead technician is assigned (lead_tech_id changes), create notification
- When a driver is assigned (driver_id changes), create notification
- Notification title: "New Work Order Assigned"
- Notification message: includes project name, customer, scheduled date
- Link target: /work-orders/[id]

If work_orders uses a separate `work_order_assignments` table for multi-worker assignment, fire trigger on that table instead.

**Slice Deliverable:**
- Migration 0046 with trigger
- No frontend changes (bell from Slice 2.1 picks up automatically)

**Verification Checklist:**
1. Apply migration 0046
2. Sign in as Operations Manager
3. Create a Work Order, assign a specific worker
4. Sign out, sign in as that worker
5. Confirm bell shows new notification
6. Confirm notification message includes project name
7. Click notification, confirm navigates to work order
8. Test multiple workers assigned in one work order — each gets separate notification
9. Test lead technician assignment creates notification for new lead
10. Test driver assignment creates notification

---

### Slice 2.3 — Full Notifications Page

A full notifications page accessed via "View all" link in bell dropdown.

**Route:** /notifications

**Component:** `components/NotificationsPage.tsx`

**Features:**
- Full list of notifications, newest first
- Filter chips: All, Unread, By Type
- Mark all as read button
- Pagination at 20 per page
- Empty state when no notifications

**Slice Deliverable:**
- New route /notifications
- NotificationsPage component
- "View all" link added to bell dropdown

**Verification Checklist:**
1. Create 25+ test notifications via SQL
2. Click bell, click "View all"
3. Confirm /notifications page loads
4. Confirm 20 visible, pagination shows
5. Click page 2, confirm next batch loads
6. Test filter chip "Unread" — only unread shown
7. Test filter by type — filtered correctly
8. Click "Mark all as read" — all become read
9. Empty state appears when no notifications

---

## Round 3 — Mobile Responsive Worker Pages

### Business Purpose

Workers use the application on their phones in the field. Three specific pages must be mobile-friendly:
- Worker Dashboard
- Work Order Detail (Start/Done timer)
- Sign In Screen

Other pages remain desktop-recommended.

---

### Slice 3.1 — Worker Dashboard Mobile Layout

**Changes:**

Refactor Worker Dashboard CSS for viewports under 768px:
- Cards stack vertically (currently multi-column)
- Hide secondary metadata on mobile (full project description, internal notes)
- Larger touch targets for action buttons (minimum 44px height)
- Primary action button fixed at bottom of screen if applicable
- No horizontal scrolling

Use Tailwind breakpoints (sm, md, lg) consistently.

**Slice Deliverable:**
- Updated Worker Dashboard component CSS
- No new database tables
- No backend changes

**Verification Checklist:**
1. Open app in browser DevTools mobile mode at 360px width
2. Sign in as worker
3. Confirm Worker Dashboard shows assigned work orders stacked vertically
4. Confirm cards are touch-friendly
5. Confirm no horizontal scrolling
6. Test at 360px (small phone)
7. Test at 414px (large phone)
8. Test at 768px (tablet)
9. Confirm desktop view still works at 1024px+

---

### Slice 3.2 — Work Order Detail Mobile Layout

**Changes:**

Refactor Work Order Detail page for mobile:
- Header stacks vertically (project name, customer, address)
- Customer phone: tap to call (`tel:` link)
- Site address: tap to open maps (`https://maps.google.com/?q=` link with URL encoded address)
- Start/Done buttons large and prominent
- Materials list collapses to scrollable cards
- Photo upload uses phone camera (input type=file accept="image/*" capture="environment")

**Slice Deliverable:**
- Refactored Work Order Detail component
- Native phone integration links
- Photo upload mobile-optimized

**Verification Checklist:**
1. Open work order on phone (or DevTools mobile mode)
2. Confirm header shows project, customer, address clearly
3. Tap phone number — phone dialer opens
4. Tap address — maps app opens
5. Tap Start — time tracking begins
6. Tap Done — time tracking ends
7. Tap photo upload — phone camera opens (on real device)
8. Confirm no horizontal scrolling
9. Confirm landscape orientation works

---

### Slice 3.3 — Sign In Screen Mobile Layout

**Changes:**
- Single column layout
- Email and password inputs minimum 48px height
- Submit button full-width on mobile, minimum 56px height
- Larger forgot password link
- Proper keyboard hints (type="email" for email field)

**Slice Deliverable:**
- Refactored Sign In screen

**Verification Checklist:**
1. Open sign-in on phone
2. Confirm inputs are large
3. Confirm keyboard appears with email layout
4. Confirm submit button is large and centered
5. Confirm autofill works for saved credentials
6. Test landscape orientation
7. Test portrait orientation

---

# SECTION B — MAIN CONTRACTOR PHASES

## Phase 2 — Material Supply (Procurement Tracking)

### Business Purpose

After Phase 1 Design completes, project enters Phase 2. The approved material list from Phase 1 must be procured from suppliers. Phase 2 tracks each material from "Not Ordered" through "Delivered" with full audit trail.

When all materials are delivered, project can advance to Installation.

---

### Slice 2A — Material Supply Schema and Auto-Seed

**Database (Migration 0047):**

Create table `material_supply_items`:
- id (uuid)
- project_id (uuid, FK to projects)
- material_item_id (uuid, FK to material_items from approved submittal, nullable for mid-phase additions)
- description (text)
- model_number (text)
- ordered_quantity (int)
- delivered_quantity (int, default 0)
- status (enum: 'not_ordered', 'ordered', 'in_transit', 'delivered', 'partially_delivered', 'issue', 'cancelled', 'added_mid_phase')
- supplier_name (text, nullable)
- po_number (text, nullable)
- expected_delivery_date (date, nullable)
- actual_delivery_date (date, nullable)
- unit_price (numeric(12,2), nullable)
- total_cost (computed numeric — generated column)
- notes (text)
- created_by (uuid), updated_by (uuid)
- created_at, updated_at (timestamps)

Create table `material_supply_history` (append-only audit):
- id (uuid)
- material_supply_item_id (uuid, FK)
- old_status, new_status (enum)
- changed_by (uuid)
- changed_at (timestamp)
- change_summary (text)

Mirror project_jca_history pattern: read + insert policies only, no update or delete.

**Auto-Seed Trigger:**

Create trigger `fn_seed_material_supply_on_phase_advance`:
- Fires AFTER UPDATE on projects when current_phase changes from 'design' to 'material_supply'
- Loops through material_items in the latest approved material_submittal_revision
- Inserts one material_supply_items row per material
- Only fires once per project (check if any material_supply_items already exist before seeding)

**RLS Policies:**
- View: admin, md, manager, accounts, lead_worker
- Edit supplier/PO/dates: admin, md, manager
- Status update: admin, md, manager, lead_worker

**Slice Deliverable:**
- Migration 0047 with tables, RLS, auto-seed trigger
- lib/types.ts MaterialSupplyItem and MaterialSupplyHistory interfaces
- lib/db.ts collections and selectors (materialSupplyForProject, historyForItem)

**Verification Checklist:**
1. Apply migration 0047
2. Run SELECT count(*) on both new tables — both exist
3. Take a Phase 1 complete project and advance it to Material Supply
4. Run SELECT * FROM material_supply_items WHERE project_id = [your project]
5. Confirm one row per material from approved submittal
6. Confirm descriptions, models, quantities match the approved submittal
7. Confirm all rows have status = 'not_ordered'
8. Re-advancing should NOT duplicate rows (trigger fires once only)

---

### Slice 2B — Material Supply Card and Page

**Frontend:**

Add summary card on project detail page (below Design cards):
- Title: "Material Supply"
- Status badge based on overall progress:
  - Gray "Not Started" when all rows are not_ordered
  - Yellow "In Progress" when any rows are ordered/in_transit
  - Green "Complete" when all delivered
- Counts: X of Y delivered

Create new route: `/projects/[id]/material-supply`

Create `components/modules/supply/MaterialSupply.tsx`:
- Progress bar at top (percent delivered)
- Summary tiles: Not Ordered, Ordered, In Transit, Delivered, Issues
- Materials table with columns: Description, Model, Qty, Status, Supplier, PO, Expected Delivery, Actions
- Each row has an Update button

**Permissions:**
- View card and page: admin, md, manager, accounts, lead_worker
- Edit through update modal: covered in Slice 2C

**Slice Deliverable:**
- Material Supply summary card on project detail
- New route and page component
- Read-only data view (update modal in Slice 2C)

**Verification Checklist:**
1. Open a project past Design phase
2. Material Supply card visible below Design cards
3. Card shows correct progress percentage and counts
4. Click card — page opens
5. Materials table shows all seeded materials
6. Progress bar and summary tiles show correct numbers
7. Sign in as different roles, confirm visibility matches matrix
8. Accounts can see the page; Worker cannot

---

### Slice 2C — Single-Row Status Update

**Frontend:**

Update button on each material row opens modal.

Modal shows current row data + status dropdown.

Available next statuses depend on current status:
- not_ordered → ordered, cancelled
- ordered → in_transit, delivered, partially_delivered, issue, cancelled
- in_transit → delivered, partially_delivered, issue
- partially_delivered → in_transit (for remaining), delivered (when complete)
- issue → ordered, cancelled
- delivered → (no transitions; complete)
- cancelled → (no transitions; complete)

Conditional fields based on selected status:
- ordered: supplier name (text), PO number (text), expected delivery date (date), unit price (numeric optional)
- in_transit: tracking notes (text), updated expected delivery (date optional)
- delivered: actual delivery date (date, default today), delivery note photo (file upload)
- issue: issue type (dropdown: Wrong Model, Damaged, Missing, Quality, Other), description (text), photos (multi-file)
- cancelled: reason (text)

Photo uploads use storage bucket `material-supply-docs` (created in migration).

**Backend (Migration 0048 if storage bucket needed):**

If bucket doesn't already exist, add to existing migration or new one:
```sql

INSERT INTO storage.buckets (id, name, public)
VALUES ('material-supply-docs', 'material-supply-docs', false)
ON CONFLICT (id) DO NOTHING;


Add RLS policies on storage.objects for this bucket matching the same role pattern.

**lib/create.ts additions:**
- updateMaterialSupplyStatus(itemId, newStatus, fields)
- uploadMaterialSupplyDoc(itemId, file, kind)

**Slice Deliverable:**
- Update modal component
- Status transition logic and validation
- File upload support
- History entries on every status change
- Notifications fired on status changes (use existing fn_notify pattern)

**Verification Checklist:**
1. Click Update on a not_ordered material
2. Change to Ordered — fill supplier, PO, expected delivery, unit price
3. Save, confirm row updates
4. Summary tiles update
5. Confirm history row created in material_supply_history
6. Click Update again, change to In Transit
7. Click Update again, change to Delivered — upload delivery photo
8. Confirm photo viewable via signed URL
9. Confirm Lead Tech assigned to project receives notification on status changes
10. Try invalid transition (delivered → ordered) — confirm rejected

---

### Slice 2D — Bulk Update and Partial Delivery

**Bulk Update:**

Add checkboxes to material rows. When 2+ selected, show bulk action bar:
- "Bulk Update Status" button opens modal
- Modal shows selected rows
- Same status and details apply to all
- Confirm individual rows' allowed transitions before applying

**Partial Delivery:**

When marking Delivered and quantity received < ordered_quantity:
- Modal prompts: "Quantity received less than ordered. Split row?"
- If yes: original row updates to delivered with delivered_quantity = received amount
- New row created with status = in_transit, ordered_quantity = remaining, expected_delivery = new date prompted from user

**Issue Handling Enhancement:**

When marking Issue with High severity, fire immediate notifications to:
- Operations Manager (already exists)
- MD
- Lead Technician on project

**Slice Deliverable:**
- Bulk update modal
- Partial delivery split logic in lib/create.ts
- High-severity notification trigger

**Verification Checklist:**
1. Select 3 materials with checkbox
2. Click Bulk Update Status — confirm modal lists all 3
3. Set status Ordered with same supplier, PO, expected delivery
4. Confirm all 3 update
5. Take one material, mark as Delivered with quantity 30 (ordered 50)
6. Confirm row splits: original at 30/50 delivered, new row for 20 in_transit
7. Mark one material as Issue with High severity
8. Confirm immediate notifications to OM, MD, Lead Tech
9. Confirm photos uploaded with issue

---

### Slice 2E — Phase Gate and Lock

**Database (Migration 0049):**

Create trigger `trg_check_material_supply_gate`:
- BEFORE UPDATE OF current_phase on projects
- When transitioning material_supply → installation:
  - Check every material_supply_items row for this project
  - Confirm status = 'delivered' OR status = 'cancelled'
  - For delivered rows: confirm delivered_quantity = ordered_quantity (no partial pending)
  - If any row fails check: raise exception with details of incomplete items

Mirror migration 0044 pattern.

**Frontend (PhaseTracker.tsx extension):**

Extend the AdvancePhaseButton logic:
- When currentPhase = 'material_supply' and next is 'installation':
  - Call new selector materialSupplyReadiness(projectId)
  - If not ready, disable button + show tooltip with incomplete items
  - If ready, enable button — confirmation modal includes lock warning

Add new component MaterialSupplyGateHint similar to DesignGateHint:
- Renders below phase tracker when phase = material_supply and not ready
- Lists incomplete items

**Read-Only Lock:**

Apply phaseLocked pattern to Material Supply page:
- When phaseIndex(currentPhase) > phaseIndex('material_supply'), page becomes read-only
- All Update buttons disabled
- Bulk select disabled
- Visible "Material Supply locked" banner at top

**Slice Deliverable:**
- Migration 0049 with database trigger
- PhaseTracker.tsx extended (allowed per Rule 3)
- MaterialSupplyGateHint component
- Read-only lock on Material Supply page

**Verification Checklist:**
1. Apply migration 0049
2. Create test project at Material Supply phase with incomplete deliveries
3. Confirm "Move to Installation" button disabled
4. Confirm hint panel below phase tracker lists incomplete items
5. Hover button, tooltip shows same list
6. Mark all materials as Delivered with full quantities
7. Confirm button enables and hint disappears
8. Click button — confirmation modal with lock warning
9. Confirm — project advances, Material Supply page locks
10. Try direct SQL: UPDATE projects SET current_phase = 'installation' WHERE id = [incomplete project]
11. Confirm trigger raises exception

---

## Phase 3 — Installation

### Status: SPECIFICATION REQUIRED FROM CLIENT BEFORE BUILDING

The Installation phase has not been described in detail by the client. The following is a working draft based on industry standards. Do NOT build this phase until the client confirms the workflow.

### Proposed Workflow

- Installation Tracker showing percent complete
- Per-area or per-room installation tracking (linked to shop drawing zones)
- Daily progress logs with photos
- Snag list for items needing rework
- Site safety incident log
- Material consumption tracking against supplied materials

### Open Questions for Client

1. How is installation progress tracked? Per camera, per room, per floor, or percentage?
2. Are daily progress logs required or optional?
3. Is the snag list separate from defects or integrated with them?
4. What safety incidents must be logged?
5. Are photos mandatory for each progress entry?
6. Who closes the snag list items?

### Proposed Slice Plan (Draft)

- Slice 3A: Installation tracker schema and per-area tracking
- Slice 3B: Daily progress logs
- Slice 3C: Snag list management
- Slice 3D: Material consumption tracking
- Slice 3E: Phase gate to T and C

**Build NOT to start until client confirms.**

---

## Phase 4 — Testing and Commissioning (T and C)

### Status: SPECIFICATION REQUIRED FROM CLIENT

### Proposed Workflow

- T and C checklist per system (CCTV, Access Control, Fire Alarm, etc.)
- Test result recording (Pass, Fail, Rework Required)
- Test certificates generation
- Client witness sign-off
- Re-test cycle for failed items

### Open Questions for Client

1. What is the standard T and C checklist content per system?
2. Who witnesses the testing — client, consultant, third party?
3. What is the test certificate format and signature requirements?
4. How many test passes are typically required before sign-off?

### Proposed Slice Plan (Draft)

- Slice 4A: T and C checklist schema
- Slice 4B: Test execution workflow
- Slice 4C: Certificate generation
- Slice 4D: Client sign-off
- Slice 4E: Phase gate to Handover

**Build NOT to start until client confirms.**

---

## Phase 5 — Handover

### Status: SPECIFICATION REQUIRED FROM CLIENT

### Proposed Workflow

- Handover document checklist (drawings, manuals, certificates, warranty)
- Document collection and upload
- Client signature recording
- Project handover certificate generation
- Asset registration if applicable

### Open Questions for Client

1. What is the standard handover document checklist?
2. Is digital signature acceptable or must it be physical?
3. What is the handover certificate template?
4. Is the client portal needed for handover acceptance?

### Proposed Slice Plan (Draft)

- Slice 5A: Handover document schema and checklist
- Slice 5B: Document upload and collection
- Slice 5C: Client signature
- Slice 5D: Handover certificate generation
- Slice 5E: Phase gate to DLP

**Build NOT to start until client confirms.**

---

## Phase 6 — DLP (Defects Liability Period)

### Status: SPECIFICATION REQUIRED FROM CLIENT

### Proposed Workflow

- DLP start date (typically 12 months from handover)
- Defect tickets within DLP period (no charge to client)
- Tracking which defects are warranty vs paid service
- DLP expiration notification
- Optional conversion to AMC contract at DLP end

### Open Questions for Client

1. What is the standard DLP duration? Typically 12 months but may vary
2. Does the DLP auto-convert to AMC contract at end, or manual decision?
3. What reporting is required during DLP?
4. How are warranty defects different from paid service in the system?

### Proposed Slice Plan (Draft)

- Slice 6A: DLP tracking schema
- Slice 6B: Defect ticket workflow within DLP
- Slice 6C: DLP expiry alerts
- Slice 6D: Conversion to AMC at DLP end

**Build NOT to start until client confirms.**

---

## Phase 7 — Closed

### Status: SPECIFICATION REQUIRED FROM CLIENT

### Proposed Workflow

- Project closure checklist
- Final invoice settled confirmation
- Final retention release
- Documentation archive
- Read-only archive view

### Open Questions for Client

1. What is the final retention release process?
2. How long should closed projects be retained in active view before archiving?
3. Can a closed project be reopened? If yes, by whom?

### Proposed Slice Plan (Draft)

- Slice 7A: Closure checklist
- Slice 7B: Final settlements verification
- Slice 7C: Archive flag and read-only conversion

**Build NOT to start until client confirms.**

---

# SECTION C — SUPPORTING ENHANCEMENTS

These can be built between phases based on user priority.

## Enhancement C1 — Material Request Flow

### Business Purpose

Technicians on site may need additional materials not in the original submittal. They submit a Material Request. Operations Manager approves or rejects. If approved, the material is added to procurement.

### Slice C1.1 — Material Request Form

**Database (next sequential migration):**

Create table `material_requests`:
- id, project_id (FK), requested_by (FK to users)
- description, model_number, quantity, urgency (low/medium/high)
- status (enum: 'pending', 'approved', 'rejected', 'fulfilled')
- approval_notes, rejection_reason
- approved_by, approved_at
- created_at, updated_at

Create table `material_request_history` (append-only).

**Frontend:**
- New route /material-requests
- Submit form for technicians
- List view with status filters

**Verification:**
- Submit request as technician
- Notification fires to Operations Manager
- Manager sees request in their queue

### Slice C1.2 — Approval Workflow

**Backend:**
- approveRequest(id, notes), rejectRequest(id, reason)
- Notification triggers on status changes

**Frontend:**
- Approval queue for Operations Manager
- Approval/rejection modal

**Verification:**
- Approve a pending request
- Requester gets notification
- Rejected requests show reason to requester

### Slice C1.3 — Approved Request Flows to Material Supply

When approved, automatically add row to material_supply_items with status = 'added_mid_phase'.

Display added_mid_phase rows distinctly in the Material Supply page.

**Verification:**
- Approve a material request
- Confirm new row appears in Material Supply page
- Confirm row flagged as added mid-phase

---

## Enhancement C2 — Replacement Document Upload

### Business Purpose

When a service ticket requires replacing a part, the technician must document the replacement. Two upload requirements:
- General document/photo upload
- Mandatory "Photo of refundable item" (for warranty/return tracking)

### Slice C2.1 — General Document Upload on Service Tickets

Add document upload to existing service ticket / replacement ticket pages.
Reuse replacement_documents pattern from migration 0039.

### Slice C2.2 — Refundable Item Photo

Make this upload mandatory when replacement is flagged as "Refundable item involved".
Block ticket closure until photo is uploaded.

---

## Enhancement C3 — Quotation Auto-Generate

### Business Purpose

When creating a quotation from a project lead, pre-fill standard placeholders instead of typing from scratch.

### Slice C3.1 — Quotation Templates

Add quotation_templates table with placeholder fields.

### Slice C3.2 — Auto-Generate from Project

"Generate from project" button on quotation create form. Pre-fills:
- Customer name and address
- Standard scope text
- Standard terms and conditions
- Default validity period

### Slice C3.3 — PDF Download

Download button on quotation detail. Generates PDF using existing PDF library or browser print stylesheet.

---

# OPEN QUESTIONS REQUIRING CLIENT INPUT

These questions should be raised with the client before related slices begin.

**For Phase 2 Material Supply:**
1. Should unit prices be required or optional when marking as Ordered?
2. How much variance between expected and actual delivery date triggers a flag?
3. Who can mark a material as Cancelled — Operations Manager only or also Lead Tech?

**For Phase 3 Installation:**
1. How is installation progress tracked? Per camera, per room, per floor, or percentage?
2. Are daily progress logs required or optional?
3. Snag list separate or integrated with defects?

**For Phase 4 T and C:**
1. Standard T and C checklist per system
2. Who witnesses the testing?
3. Test certificate format

**For Phase 5 Handover:**
1. Standard handover document checklist
2. Digital or physical signature
3. Handover certificate template

**For Phase 6 DLP:**
1. DLP duration (default 12 months — confirm)
2. Auto-convert to AMC contract or manual?
3. Reporting requirements during DLP

**For Phase 7 Closed:**
1. Final retention release process
2. Archive duration before deep archiving
3. Reopening allowed?

**For Enhancement C1 (Material Requests):**
1. Who approves material requests — Operations Manager only or also MD?
2. Are there cost thresholds requiring escalation?

**For Enhancement C2 (Replacement Documents):**
1. What categories of replacements exist?
2. How is the refundable item later verified?

---

# VERIFICATION PATTERN

For every slice, the user follows this pattern:

1. User applies migration in Supabase SQL Editor
2. User confirms smoke test passes (looks for ─── XXXX applied ─── message)
3. User runs through slice's verification checklist in the application
4. User reports results to Claude Code
5. If passing: Claude Code proceeds to next slice
6. If failing: Claude Code provides targeted hotfix

Do NOT assume verification has happened. Wait for explicit user confirmation.

---

# FINAL NOTES FOR CLAUDE CODE

- Build only what user explicitly approves
- Do NOT skip ahead to future slices
- Do NOT combine slices
- Do NOT assume specifications for phases marked "pending client confirmation"
- When in doubt, ASK the user rather than assume
- Every slice ends with a stop-and-report, never autonomous continuation
- Type-check must pass after every slice

End of build plan.