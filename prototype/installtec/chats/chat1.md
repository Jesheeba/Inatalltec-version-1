# Operations Manager Dashboard

_Started 2026-05-16 07:26 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Installtec"
Current date is now May 16, 2026
</system-info>

<pasted_text name="Pasted text (159 lines)">
Design a complete design system for a modern mobile-first CRM & Operations Management Platform for an electromechanical, field-service, AMC, and project operations company.

The visual direction should combine:
- soft pastel enterprise UI
- premium SaaS aesthetics
- operational command center feel
- modern minimal dashboard design
- calm and non-stressful interface
- rounded cards
- spacious layouts
- soft shadows
- clean typography
- elegant pastel gradients
- subtle industrial feel

The design inspiration is a blend of:
- luxury pastel admin dashboards
- modern soft enterprise SaaS
- calm productivity systems
- operational management platforms
- field service management dashboards

Avoid:
- dark cyberpunk UI
- overly corporate blue dashboards
- harsh contrast
- neon colors
- cluttered analytics-heavy layouts

DESIGN LANGUAGE:
- premium
- soft
- airy
- operational
- modern
- intelligent
- calm enterprise
- elegant workflow system

COLOR SYSTEM

Primary Background:
#F3F1EC

Secondary Background:
#FAF9F6

Primary Accent:
#7C9276 (sage green)

Secondary Accent:
#06B6D4 (soft cyan)

Neutral Borders:
#D8D4CC

Primary Text:
#2C2C2C

Secondary Text:
#6B7280

Soft Success:
#DDE8DF

Warning:
#D9B97A

Danger:
#C97B63

Use:
- soft pastel gradients
- glassmorphism very lightly
- soft shadows only
- large border radius (18px–28px)
- floating cards
- minimal borders
- elegant spacing

TYPOGRAPHY:
- modern geometric sans-serif
- clean readability
- medium-large headings
- soft hierarchy
- minimal bold usage

COMPONENT STYLE:
- rounded cards
- floating panels
- soft shadows
- subtle hover animations
- clean KPI cards
- elegant charts
- timeline widgets
- activity feed
- operational status cards
- modern tables
- soft buttons
- segmented controls
- floating navigation sidebar

LAYOUT STYLE:
- mobile-first
- highly breathable spacing
- modular dashboard cards
- asymmetric but balanced layouts
- operational feed layout
- command center widgets
- calendar + Kanban hybrid feeling

DESIGN THE FOLLOWING SYSTEMS:
- Operations Manager Dashboard
- Technician Mobile Workflow
- Work Order / Job Card Screens
- AMC Management Dashboard
- Repair Ticket Management
- Scheduling & Dispatch System
- Resource Planning Dashboard
- Inventory & Materials Module
- Live Operations Feed
- Approval Workflow Screens
- Customer Timeline
- Analytics & Reporting
- Notifications Center
- Internal Team Collaboration Threads

MOBILE UX REQUIREMENTS:
- one-handed usability
- large touch targets
- minimal typing
- big action buttons
- quick workflow completion
- fast operational scanning
- outdoor readability

DESIGN SYSTEM REQUIREMENTS:
- full color palette
- typography scale
- spacing system
- shadows
- iconography direction
- button variants
- card variants
- input styles
- status badges
- chart styles
- table styles
- modal styles
- sidebar/navigation system
- mobile navigation patterns
- responsive behavior

The final UI should feel like:
“Luxury operational intelligence platform”
instead of:
“generic CRM admin panel”.

The UI must look unique, premium, operational, modern, and highly scalable for enterprise workflows.
</pasted_text>

<pasted_text name="Pasted text (1246 lines)">
Master Build Prompt v4: Installtec CRM & Operations Management System
This is the complete, consolidated build specification - all architecture, operational systems, the Admin-driven user management model, and refinements integrated into a single source of truth for the development team.

PART 1 - PROJECT BRIEF
About the Client
Installtec Electromechanical LLC is a Dubai-based system integrator and electromechanical company with 14+ years of experience, 25+ technical staff, 100+ completed projects, and 220+ satisfied customers across 6 countries (UAE, Saudi Arabia, Ethiopia, Uganda, India, and growing). They operate from ASCON House, Deira, Dubai, with a secondary office in Madurai, India.
The company is a SIRA-registered CCTV installation contractor specializing in Extra-Low Voltage (ELV) systems across three core pillars: IT Infrastructure, Physical Security Systems, and Automation. They serve commercial buildings, residential complexes, educational institutions, medical buildings, industrial sites, hospitality venues, and government facilities. Notable past clients include MAG Group, DAMAC Properties, Azizi Developments, Manipal University Dubai, Canadian Specialist Hospital, NMC Hospital, and projects at Burj Khalifa, DIFC, Business Bay, and Dubai South.
What We're Building
A mobile-responsive Progressive Web App (PWA) CRM and Operations Management System that unifies three distinct business operations into one platform:

Contractor Projects - multi-month installation projects with milestones, manpower planning, BOQs, and stakeholder coordination
Repair Agency Work - fast-turnaround repair tickets for own products and third-party supplier products
Annual Maintenance Contracts (AMC) - quarterly recurring services with payment-gated execution and free-call tracking

All field activity flows through a unified Work Order / Job Card system. All user accounts and role permissions are controlled by an Admin role. Every user role - from Admin to field worker - must have full feature parity on phone, tablet, and desktop.
The Three Business Realities Driving This Build

The Operations Manager is the bottleneck today. All project assignments, technician allocations, AMC scheduling, and client coordination flow through one person. The CRM's #1 job is to make those decisions visible, reversible, and delegable so the company can scale past any single individual.
AMC is the strategic gold mine, not contractor projects. With 220+ existing customers and 100+ completed projects, Installtec is sitting on a massive recurring revenue opportunity that's currently unmanaged.
Phone-first for everyone. Every workflow must work one-handed on a 6-inch Android screen, for every role.


PART 2 - ADMIN-DRIVEN USER MANAGEMENT MODEL (CRITICAL FOUNDATION)
Core Philosophy
The system has one bootstrap role: Admin. From there, the Admin builds out the organization inside the CRM. The system makes no assumptions about who works where, who reports to whom, or how many people occupy any role. Everything is configured by the Admin at runtime.
The Admin Role
The Admin is the highest-privilege user in the system. There can be one or more Admin users. Initial Admin is created during system setup. Admin responsibilities:

User creation - create any number of users in any role
Role assignment - assign each user one of the system roles
Scope assignment - define what each user can manage (specific projects, customers, sites, AMCs, regions, teams)
Approval chain configuration - define who approves what for every approval type
Permission management - grant or revoke specific capabilities within a role
Manager assignment - link workers to their respective managers
Team formation - create teams with assigned manager + workers
Deactivation - disable users without deleting their history

The Admin role itself is created at system setup (database seed). Additional Admins can be created by existing Admins.
System Roles (Configurable Per User)
These are the role templates the Admin can assign. Admin can create unlimited users in any role.
RoleDescriptionPhone-ResponsiveAdminFull system control, user management, configurationYesManaging DirectorStrategic view, top-tier approvalsYesManagerOperational oversight of assigned scope (projects, customers, AMCs, teams)YesSalesQuotations, pipeline, AMC renewalsYesPre-Sales / EstimatorBOQ building, costing, estimationsYesLead WorkerCrew supervisor, work order assignment within teamYesWorker / TechnicianField execution of work ordersYesDriverMaterial delivery work ordersYesSubcontractorLimited scope, assigned work orders onlyYesService SupportRepair ticket intake, customer communicationYesAccountsInvoicing, payments, financial approvalsYesCustomer (Phase 3)Self-service portalYes
Important: these are role templates, not fixed positions. The Admin can:

Create 5 Managers, each managing different scopes
Create 20 Workers under 3 different Lead Workers
Promote a Worker to Lead Worker
Assign one user to multiple roles (rare, but possible)

User Creation Flow
Admin opens "User Management"
         │
         ▼
[+ Create New User]
         │
         ▼
Step 1: Basic Info
  - Full name
  - Email / phone (login credential)
  - Profile photo
  - Employee ID (optional)
  - Office location (Dubai / Madurai / etc.)
         │
         ▼
Step 2: Role Selection
  - Pick role from dropdown
  - System loads default permissions for that role
         │
         ▼
Step 3: Permission Customization (optional)
  - Toggle granular permissions on/off
  - Examples: "Can approve invoices up to AED X",
    "Can view all projects" vs. "only assigned projects"
         │
         ▼
Step 4: Scope Assignment
  - Manager: assign which projects/customers/AMCs they manage
  - Worker: assign to which Lead Worker / team
  - Sales: assign which customers/regions
  - Accounts: assign which financial scope
         │
         ▼
Step 5: Manager Assignment (if applicable)
  - Who is this user's direct manager?
  - This drives default approval routing
         │
         ▼
Step 6: Notification Preferences
  - Default channels (Email / WhatsApp / SMS / Push)
  - Configurable later by user
         │
         ▼
Step 7: Send Invite
  - User receives magic link via email + WhatsApp
  - First login prompts password setup + 2FA (for sensitive roles)
Dynamic Dashboard Rendering
When any user logs in, the system performs the following at login time:

Read the user's role field
Read the user's permissions array (granular toggles)
Read the user's scope definition (what they can access)
Read the user's manager_id (for approval routing)
Load the dashboard template for that role
Filter all data queries through their scope via Supabase RLS

Result: every user sees a dashboard built specifically for their role and scope, with only the menu items, sections, and data they have permission to see. The same React component (<RoleDashboard />) renders completely different UIs based on the logged-in user's role.
Dashboard Templates by Role
Each role has a default dashboard template that loads on login. The Admin can customize sections later via a future Phase 3 feature ("Dashboard Builder"). For Phase 1, the templates are:
Admin Dashboard

User Management (create/edit/disable users)
Role & Permission Management
Approval Chain Configuration
System Configuration (SLA targets, escalation timers, notification rules)
Audit Logs
All operational dashboards (read access to everything)

Managing Director Dashboard

Strategic KPIs (revenue, margin, AMC base, DSO)
Top-tier escalations
High-value approval queue
Country/region revenue split
Compliance alerts (SIRA, trade license)

Manager Dashboard (Central Operations Feed)

Live field activity for assigned scope
Today's schedule
Escalations
Pending approvals
SLA watch
Customer sign-offs pending
Material requests
Forecasted risks
Delayed items
Repeat-failure assets

Sales Dashboard

Pipeline (assigned customers/regions)
Open quotations
AMC renewal queue (assigned scope)
Lead aging
Communication timeline access

Pre-Sales / Estimator Dashboard

Open quotation requests
BOQ templates
Rate card
Historical project costing references

Lead Worker Dashboard

My crew (assigned workers)
My assigned work orders today
Crew status
Material requests from my team
My pending approvals
My escalations

Worker / Technician Dashboard

My Day (today's work orders)
Upcoming work orders
Leave requests
My approval requests
Communication mentions

Driver Dashboard

Today's delivery work orders
Vehicle stock
Pickup tasks
Route view

Subcontractor Dashboard

My assigned scope-bounded work orders
Completion submissions

Service Support Dashboard

Open repair tickets (with SLA timers)
Customer callbacks pending
Escalations
Customer Communication Timeline

Accounts Dashboard

Invoices to raise
Payments received
AMC due-for-billing
Outstanding aging
Free-call-to-invoice pending
Invoice approval queue

Customer Dashboard (Phase 3)

My active services
My AMC schedule
My communication timeline
Self-service ticket creation
Sign-off pending items

Permission Granularity
Within each role, the Admin can toggle granular permissions:
Example: Manager Role Permissions

Can approve quotations up to AED [configurable amount]
Can approve material requests up to AED [configurable amount]
Can override AMC payment blocks (true/false)
Can approve AMC reactivations (true/false)
Can reassign work orders across teams (true/false)
Can view financial data for assigned projects (true/false)
Can view all customer data vs. only assigned customers
Can create new customers (true/false)
Can edit BOQs (true/false)
Can approve subcontractor payments (true/false)

Example: Worker Role Permissions

Can request leave (default: true)
Can request reassignment (default: true)
Can view team schedule (default: false)
Can post in internal threads (default: true)
Can request materials (default: true)
Can access asset history (default: true)

Example: Sales Role Permissions

Can view all customers vs. assigned customers
Can create AMC contracts (true/false)
Can edit quotations after sending (true/false)
Can offer discounts up to [X]% without approval
Can access pricing history (true/false)

All permissions are stored in the database as a JSONB field on the user record and enforced via Supabase RLS policies and frontend conditional rendering.
Scope Assignment Model
Beyond role and permissions, every user has a scope that defines what data they can access. Scope is multi-dimensional:
Manager Scope

Assigned customers (list of customer IDs)
Assigned projects (list of project IDs)
Assigned AMCs (list of AMC contract IDs)
Assigned teams (list of team IDs - managers of teams)
Assigned regions (UAE / KSA / Ethiopia / etc.)

Worker Scope

Assigned to team (single team_id)
Reports to (single user_id = Lead Worker or Manager)

Sales Scope

Assigned customers
Assigned regions

Accounts Scope

Usually full company financial scope, but can be partitioned by region

Service Support Scope

All repair tickets, but can be filtered by region or customer tier

Team Concept
The Admin can create Teams to group workers under Lead Workers:
Team "ELV Installation Team Alpha"
  Lead Worker: [user_id]
  Members: [worker_id, worker_id, worker_id]
  Manager: [user_id]
  Skills: [CCTV, ACS, SCS, Fiber]
  Region: UAE
Teams enable:

Mass assignment of work orders to a team (auto-distributes to free members)
Team-level capacity planning
Lead Worker sees their team's schedule
Manager sees all their teams

Approval Chain Configuration (Admin-Controlled)
The Approval Workflow Engine no longer has hardcoded chains. The Admin configures every approval type:
Admin opens "Approval Configuration"
For each approval type, Admin defines:
Approval TypeConditionsApprover 1Approver 2Approver 3QuotationValue < AED 50KSales Manager--QuotationValue AED 50K–200KSales ManagerOperations Manager-QuotationValue > AED 200KSales ManagerOperations ManagerManaging DirectorAMC ReactivationAnyManager (assigned to AMC)--AMC Block OverrideAnyManaging Director--Material RequestValue < AED 5KLead Worker--Material RequestValue > AED 5KLead WorkerManager-Overtime RequestAnyLead WorkerManager-Subcontractor PaymentAnyManagerAccountsManaging DirectorVariation OrderAnyManagerManaging Director-Invoice ApprovalAnyAccountsManager-Leave RequestAnyLead WorkerManager-Work Order ReassignmentSame teamLead Worker--Work Order ReassignmentCross teamLead WorkerManager-
Critical: when an approval type fires, the system looks up the actual user in that role within the requester's scope. If a Worker requests leave, the system finds that Worker's Lead Worker (from the team assignment), not a generic Lead Worker. This is what makes the model truly admin-driven.
Approver Resolution Logic
When an approval is needed, the system resolves the approver dynamically:
1. Identify approval type → look up configured chain
2. For each step in the chain:
   a. Identify the role required (e.g., "Manager")
   b. Within the requester's scope, find the user with that role:
      - For Worker → Lead Worker → look up team.lead_worker_id
      - For Lead Worker → Manager → look up team.manager_id
      - For Manager → Managing Director → look up user where role=MD
   c. If multiple users match (e.g., 3 Managers all assigned to the project),
      route to ALL of them in parallel (any one can approve)
3. Create approval entry pointing to resolved user(s)
This logic lives in a Postgres function fn_resolve_approver(approval_type, requester_id, context_jsonb) that returns the correct user_id(s) for each step.
Audit & History
Every Admin action is logged:

User created (who, when, role assigned)
Permission changed (who changed, before/after values)
Scope reassigned (before/after)
User deactivated
Approval chain modified
Role permission template modified

Full audit log accessible to Admin only, exportable for compliance.

PART 3 - BUSINESS WORKFLOW RULES (NON-NEGOTIABLE)
Project Workflow
Manager assigns projects/sites to Lead Workers (or directly to teams) → Lead Workers create work orders assigning team members → Driver handles material logistics via material delivery work orders → Subcontractors are hired only when additional manpower is needed and receive scoped work orders.
AMC Rules

Quarterly service model: exactly 4 services per year, auto-scheduled at contract signing
Payment must complete within 30 days of AMC signing
If payment is delayed, the next service work order is blocked automatically (with override approval routed per Admin-configured chain - typically Managing Director)
When delayed payment is received, the system automatically detects it, auto-reactivates the contract, restores the next-due service work order to visible/pending state, and routes a reactivation approval to the Manager assigned to that AMC. Service proceeds only after Manager approval.
AMC includes free support/service calls
If a damaged product is replaced during a free call, a separate additional invoice is auto-generated

AMC Contract Lifecycle:
DRAFT
  │
  ▼
SIGNED (awaiting payment)
  │
  ├─► Payment received within 30 days
  │         │
  │         ▼
  │      ACTIVE ◄────────────────────────────┐
  │         │                                │
  │         ├─► Quarterly services execute   │
  │         │   via work orders              │
  │         │                                │
  │         └─► Approaching renewal          │
  │                                          │
  └─► Payment NOT received within 30 days    │
            │                                │
            ▼                                │
         BLOCKED                             │
            │                                │
            ├─► Override approved            │
            │   (services continue)          │
            │                                │
            └─► Payment received late        │
                      │                      │
                      ▼                      │
                PENDING_REACTIVATION         │
                      │                      │
                      ├─► Manager approves ──┘
                      │
                      └─► Manager rejects → BLOCKED (with note)
Repair Workflow

Tracks both own-product repairs and third-party supplier repairs
Each repair generates one or more work orders (one per visit)
First visit forces capture of: symptom, root cause, parts needed, estimate
Free-call vs. chargeable classification at ticket creation

Subcontractor Handling
Track only: name, phone, email, working days/hours, skill, rate. No full employee management. Payment-gated by work order completion verification via the Approval Workflow Engine.
3-Month Operational Planning
Forward visibility for projects, manpower, technician allocation, schedules, targets, activities, calendar, pending tasks, and updates.
Desired hierarchy: All Projects → Activities → Targets → Calendar → Updates

PART 4 - HIDDEN PAIN POINTS THE CRM MUST SOLVE

"Where's my technician?" problem - no real-time visibility of field staff
Double-booked technicians - conflicts surface on-site
Material pilferage / ghost inventory - material is 40-60% of project cost, currently untracked
Free-call trap - clients abuse "free" support calls, replacements don't always convert to invoices
AMC payment-service deadlock - services delivered against unpaid contracts AND services delayed even after payment arrives
Repair visit spiral - one repair becomes three visits because parts weren't documented after visit 1
No man-hour truth - quotations based on gut feel, not historical data
Subcontractor black box - paid without scope-verification
Document chaos - drawings, T&C reports, As-Builts scattered across email/WhatsApp/Google Drive
Quotation bottleneck - pre-sales engineer rebuilds estimates from scratch every time
Approval bottleneck - every decision routes through one person via WhatsApp, no audit trail
No escalation discipline - issues fester until customers complain to the MD directly
Asset history loss - replaced a camera at Bay Gate Tower in 2022? Nobody remembers
Customer communication silos - what was promised on WhatsApp last Tuesday lives only on someone's phone
No SLA tracking - promises made in proposals never measured against actual delivery
Reactive resourcing - manpower crunches discovered the day they happen
Onboarding friction - bringing new staff onto WhatsApp groups and Excel sheets is chaotic; Admin needs to onboard a new Manager in 5 minutes


PART 5 - TECHNICAL ARCHITECTURE
High-Level Architecture
┌─────────────────────────────────────────────────────────────────┐
│        MOBILE-RESPONSIVE PWA (React + Vite + Tailwind)          │
│     Installable on phones, tablets, and desktops as PWA         │
│       Offline-first via Service Worker + IndexedDB              │
│        Full feature parity on phone for ALL user roles          │
│   Dashboard rendered dynamically based on logged-in user role   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                │     Supabase JS SDK         │
                │ (auth, queries, realtime)   │
                └──────────────┬──────────────┘
                               │
        ┌──────────────────────┴───────────────────────┐
        │                                              │
┌───────▼────────┐                            ┌────────▼────────┐
│   SUPABASE     │                            │  NODE.JS API    │
│  (Data Layer)  │                            │   (Logic Layer) │
│                │                            │                 │
│ • PostgreSQL   │  ◄─── direct queries       │ • NestJS        │
│ • Auth         │       via SDK              │ • TypeScript    │
│ • Storage      │                            │ • Heavy logic   │
│ • Realtime     │  ◄─── service-key ops      │ • PDF gen       │
│ • RLS policies │                            │ • WhatsApp API  │
│ • pg_cron      │                            │ • Schedulers    │
│ • Triggers     │                            │ • Escalations   │
│ • Views        │                            │ • SLA monitor   │
│ • Approver     │                            │ • Forecasting   │
│   resolution   │                            │ • User invites  │
└────────────────┘                            └─────────────────┘
                                                       │
                                ┌──────────────────────┴────────────┐
                                │       EXTERNAL SERVICES           │
                                │                                   │
                                │ • WhatsApp Business API (Meta)    │
                                │ • Resend (Email)                  │
                                │ • Twilio (SMS)                    │
                                │ • Tally/Zoho (future)             │
                                └───────────────────────────────────┘
Tech Stack
Frontend (Mobile-Responsive PWA)

React 18+ with Vite
Tailwind CSS + shadcn/ui components
Zustand for state management
React Router with role-based route guards
Workbox for PWA capabilities
Dexie.js for IndexedDB (offline storage)
SignaturePad.js for customer signatures
browser-image-compression for photo handling
Supabase JS Client SDK
Recharts for dashboard visualizations
React DnD (desktop) + tap-to-select fallback (mobile)
FullCalendar for calendar views

Backend (Node.js)

Node.js 20 LTS
NestJS framework with TypeScript
Supabase JS Client (service role key) for privileged operations
BullMQ + Redis for job queues
node-cron for scheduled tasks
Puppeteer for PDF generation
Axios for third-party API calls
Pino for structured logging
Zod for input validation
Jest for testing

Data & Storage Platform (Supabase)

PostgreSQL 15+
Supabase Auth (email/password + magic link + 2FA)
Supabase Storage
Supabase Realtime
Row-Level Security on every table
pg_cron for scheduled DB jobs
Postgres triggers and functions

External Integrations

WhatsApp Business API (Meta)
Resend or SendGrid (email)
Twilio (SMS)
Future: Tally / Zoho Books, SIRA portal

Hosting & Infrastructure

Supabase: AWS Mumbai or Singapore
Frontend: Vercel
Node.js backend: Railway / Render / DigitalOcean App Platform
Redis: Upstash
CDN: Cloudflare
Domain: crm.installtecuae.com

Estimated infrastructure cost: $80–150/month at full operations.

PART 6 - THE THREE-ENGINE SYSTEM ARCHITECTURE
              ┌─────────────────────────────────────┐
              │      INTEGRATED CRM PLATFORM        │
              │   (Admin-controlled user model)     │
              └─────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
  ┌─────▼─────┐         ┌─────▼─────┐         ┌─────▼─────┐
  │  PROJECT  │         │   REPAIR  │         │    AMC    │
  │  ENGINE   │         │   ENGINE  │         │  ENGINE   │
  └─────┬─────┘         └─────┬─────┘         └─────┬─────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                ┌─────────────▼─────────────┐
                │   WORK ORDER / JOB CARD   │
                │  (Universal execution     │
                │   layer)                  │
                └─────────────┬─────────────┘
                              │
              ┌───────────────▼───────────────┐
              │   SHARED RESOURCE LAYER       │
              │                               │
              │ • Customers & Sites           │
              │ • Users & Teams (Admin-       │
              │   controlled)                 │
              │ • Inventory & BOQ            │
              │ • Vehicles & Drivers         │
              │ • Subcontractors             │
              │ • Documents & Compliance     │
              │ • Calendar & Scheduling      │
              │ • Finance (Invoices/PO)      │
              │ • Asset Registry             │
              └───────────────────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │   OPERATIONAL INTELLIGENCE    │
              │                               │
              │ • Central Operations Feed     │
              │ • Approval Workflow Engine    │
              │   (Admin-configured chains)   │
              │ • Escalation Matrix           │
              │ • SLA Engine                  │
              │ • Costing & Profitability     │
              │ • Resource Forecasting        │
              │ • Customer Comm Timeline      │
              │ • Reports & Analytics         │
              │ • Admin Configuration         │
              └───────────────────────────────┘

PART 7 - COMPLETE MODULE LIST
Module 1 - Admin & User Management ⭐ FOUNDATION MODULE

User creation, editing, deactivation
Role assignment and switching
Granular permission toggles
Scope assignment (projects, customers, AMCs, regions, teams)
Team creation and management
Manager-Worker linking
Approval chain configuration
System configuration (SLA targets, escalation timers, notification rules)
Audit logs (full)
User invite flow (magic link via email + WhatsApp)

Module 2 - Customer & Site Management

Customer profile (classification)
Multi-site under one customer
Site geo-coordinates, access instructions, security clearance
Stakeholder contacts per site
Linked projects/repairs/AMCs history
Linked installed assets
Customer Communication Timeline

Module 3 - Project Engine

Full lifecycle from Lead → DLP → AMC handoff
BOQ builder with rate-card auto-population
Milestone planner with UAE-standard payment terms
Versioned drawings repository
SIRA submission tracker
T&C checklist per system type
As-Built drawing handover gate
Variation order management
Spawns work orders for all field execution

Module 4 - Repair Engine

Multi-channel ticket intake
Own-product vs. third-party classification
Warranty / chargeable / AMC-free-call classification
First-visit forced-capture checklist
Multi-visit chain via linked work orders
Free-call to chargeable conversion workflow
SLA-tracked response and closure times

Module 5 - AMC Engine

Contract creation
Auto-generation of 4 quarterly service schedules
Payment-status gate (block + override)
Automatic payment-arrival detection and reactivation workflow
Free-call counter per contract
Replacement billing auto-triggered invoices
Renewal pipeline with 60/30-day alerts
Digital AMC service report templates
Linked to Asset Registry

Module 6 - Work Order / Job Card System
The universal execution layer. Every field activity runs through a work order.
Module 7 - Workforce & Manpower

User profile with skill tags (Admin-managed)
Availability calendar
Capacity heatmap
Subcontractor lite-profile
Leave Request & Smart Reassignment system

Module 8 - Scheduling & Dispatch

Unified calendar
Drag-drop (desktop) / tap-to-select (mobile)
Conflict detection
Geo-aware routing suggestions
3-month forward visibility

Module 9 - Inventory & Materials

Central / vehicle / site stock
BOQ reconciliation per project
Material requests routed through Approval Workflow Engine
Low-stock alerts
Serial number tracking (feeds Asset Registry)

Module 10 - Driver & Logistics

Material delivery work orders
Vehicle stock tracking
Pickup-from-site jobs
Daily route plans

Module 11 - Documents & Compliance

Auto-generated per-project document folder structure
SIRA renewal calendar
Insurance / trade license / visa expiry tracking
Customer-signed PODs and service reports

Module 12 - Finance (Lightweight)

Quotation → Proforma → Invoice flow
AMC invoice scheduling
Free-call replacement invoice auto-trigger
Payment status sync
Outstanding aging
Costing & Profitability Engine

Module 13 - Asset Registry
Tracks every installed device - serial numbers, warranty, repair history, AMC history, replacement history.
Module 14 - Approval Workflow Engine ⭐ ADMIN-CONFIGURED
Universal approval router with admin-defined chains and dynamic approver resolution.
Module 15 - Escalation Matrix
Auto-escalation of delayed/stuck issues. Escalation paths follow Admin-configured manager hierarchies.
Module 16 - SLA Engine
Tracks promised response and closure times against actuals.
Module 17 - Customer Communication Timeline
Unified per-customer history across all channels.
Module 18 - Resource Forecasting
Rule-based forward-looking capacity prediction.
Module 19 - Central Operations Feed
Live command center - primary screen for Managers.
Module 20 - Internal Communication Threads
Project/work-order/ticket-level discussion threads.
Module 21 - Reports & Analytics
Project, technician, customer, and operational reporting.
Module 22 - Mobile Field Workflow (PWA)
Mobile-first execution of work orders, check-ins, service reports, leave requests.

PART 8 - MODULE DEEP-DIVES
MODULE 1 - Admin & User Management
User Entity Schema
sqlusers (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  profile_photo_url TEXT,
  employee_id TEXT,
  office_location TEXT,
  role TEXT NOT NULL,           -- e.g., 'admin', 'manager', 'worker'
  permissions JSONB DEFAULT '{}',-- granular toggles
  scope JSONB DEFAULT '{}',     -- assigned projects/customers/AMCs/regions
  manager_id UUID REFERENCES users(id),  -- direct manager
  team_id UUID REFERENCES teams(id),     -- assigned team (for workers)
  is_active BOOLEAN DEFAULT true,
  notification_preferences JSONB DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  last_login_at TIMESTAMP,
  deactivated_at TIMESTAMP,
  deactivation_reason TEXT
)

teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  lead_worker_id UUID REFERENCES users(id),
  manager_id UUID REFERENCES users(id),
  skills TEXT[],
  region TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now()
)

role_permission_templates (
  role TEXT PRIMARY KEY,
  default_permissions JSONB NOT NULL,
  description TEXT
)

approval_chain_config (
  id UUID PRIMARY KEY,
  approval_type TEXT NOT NULL,    -- e.g., 'quotation', 'amc_reactivation'
  conditions JSONB DEFAULT '{}',  -- e.g., {value_min: 0, value_max: 50000}
  chain JSONB NOT NULL,           -- [{role: 'manager'}, {role: 'md'}]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
)

admin_audit_log (
  id UUID PRIMARY KEY,
  admin_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  before_value JSONB,
  after_value JSONB,
  ip_address TEXT,
  timestamp TIMESTAMP DEFAULT now()
)
Admin UI Screens (All Phone-Responsive)

User List - searchable, filterable by role/region/team/status
User Detail / Edit - full profile management
Create User Wizard - 7-step flow described above
Team Management - create teams, assign lead + members
Role Templates - view/edit default permissions per role
Approval Chain Builder - visual configuration of approval flows
System Configuration - SLA targets, escalation timers, notification settings
Audit Logs - searchable, exportable

Admin Mobile Considerations

User creation wizard works as multi-step mobile flow
Approval chain builder uses card-based UI on mobile (drag-drop on desktop, tap-to-reorder on mobile)
Permission toggles are clean checkbox lists on mobile

MODULE 6 - Work Order / Job Card System
Core principle: every field activity is a Work Order.
Work Order Entity

WO Number (auto-generated)
Type: PROJECT / REPAIR / AMC / MATERIAL_DELIVERY / SITE_SURVEY / EMERGENCY
Linked source (project_id / repair_ticket_id / amc_schedule_id)
Customer + Site
Scheduled date/time window
Assigned users (one or more, lead designated)
Required skills (auto-derived)
Materials allocated
Tools/equipment required
Estimated duration
Priority
SLA target
Current status
Created by / assigned by

Work Order Lifecycle
Created → Assigned → Accepted → In Transit → Checked In → Working
                                                              │
                                            ┌─────────────────┼─────────────────┐
                                            ▼                                   ▼
                                    Waiting For Material           Waiting For Customer
                                            │                                   │
                                            └─────────────────┬─────────────────┘
                                                              ▼
                                                         Completed
                                                              │
                                                              ▼
                                                    Customer Approved
                                                              │
                                                              ▼
                                                           Closed
Mobile Work Order Card (universal across roles)

Status badge prominent
"Next Action" CTA dominant
Map navigation, check-in/out, photo upload, signature pad, materials list, notes thread
All functions work offline; sync on reconnect

MODULE 13 - Asset Registry
Every device installed becomes a tracked asset with serial number, warranty, full event history. Scan barcode to view history on-site. Repeat-failure flag (3+ faults in 6 months) auto-alerts assigned Manager.
MODULE 14 - Approval Workflow Engine (Admin-Configured)
Critical change from earlier versions: there are no hardcoded approval chains. The Admin configures every approval type.
Engine Flow
1. Trigger event (e.g., user submits quotation)
2. System identifies approval_type and context (value, scope, etc.)
3. Postgres function fn_resolve_approval_chain() executes:
   a. Find matching approval_chain_config row based on conditions
   b. Walk each step in the chain
   c. For each step, find the actual user(s) via fn_resolve_approver():
      - Use requester's team/manager hierarchy
      - Use scope-based matching (which Manager owns this customer/project/AMC?)
      - Use role-based matching (find user where role='md')
4. Create approval record with resolved approver(s)
5. Notify approver(s) via configured channels
6. On approval: advance to next step OR finalize
7. On rejection: terminate and notify requester
Mobile Approval Card

Title, requester, timestamp
Context summary
Expand for full details
Comment field
[Approve] [Reject] [Request More Info] - large tap targets
Audit log shown inline

Special Approval: AMC Reactivation
When a delayed payment arrives for a blocked AMC:

Postgres trigger detects payment clears outstanding
Contract status → PENDING_REACTIVATION
Next-due service WO restored to visible state, flagged requires_reactivation_approval
Approval entry created with type amc_reactivation
fn_resolve_approver finds the Manager assigned to this AMC's scope
Manager receives approval notification
Manager approves → contract becomes ACTIVE, service proceeds

MODULE 15 - Escalation Matrix
Escalation paths follow the Admin-configured manager hierarchy:
User experiencing delay
         │
         ▼ (after configured time)
User's direct manager (from manager_id field)
         │
         ▼ (after configured time)
Manager's manager (manager_id of the manager)
         │
         ▼ (eventually reaches Managing Director)
Admin configures escalation timers per trigger type.
MODULE 16 - SLA Engine
SLA targets are Admin-configurable per category, with optional per-customer overrides. Real-time countdowns visible on all relevant screens. Breaches auto-trigger Escalation Matrix.
MODULE 17 - Customer Communication Timeline
Unified chronological view of every customer interaction. Auto-aggregates WhatsApp, email, site visits, quotations, invoices, payments, approvals, complaints, AMC services, asset events, internal notes.
MODULE 18 - Smart Resource Forecasting
Rule-based forecasting:

Technician Overload (3-week rolling)
Manpower Shortage by skill (8-week rolling)
Material Shortage (4-week rolling)
AMC Peak Workload (12-month rolling)
Scheduling Conflicts (live)

Runs nightly via Node.js job. Critical alerts surface immediately in Central Operations Feed.
MODULE 19 - Central Operations Feed
The live command center, primary screen for Managers. Must be perfect on phone.
Sections (Real-Time)

Live Field Activity
Today's Schedule
Escalations
Pending Approvals (including AMC Reactivations)
SLA Watch
Customer Sign-Offs Pending
Material Requests
Forecasted Risks
Delayed Items
Repeat-Failure Assets

Scope-filtered: each Manager sees only their assigned scope.
MODULE 20 - Internal Communication Threads
Every project, work order, repair ticket, and AMC service has its own thread. Members auto-added by involvement. Activity timeline auto-generated alongside.
MODULE 7 (EXTENDED) - Leave Request & Smart Reassignment
Worker requests leave → system detects conflicting work orders → suggests replacements based on skill/availability/workload/proximity → Lead Worker approves replacement → Approval Workflow routes leave request → Manager approves → calendar updated.

PART 9 - ROLE-BASED DASHBOARDS
All dashboards must function fully on a 360px phone screen.
(See Part 2 for full Dashboard Templates by Role - Admin, MD, Manager, Sales, Pre-Sales, Lead Worker, Worker, Driver, Subcontractor, Service Support, Accounts, Customer)
Every dashboard is rendered dynamically based on:

The logged-in user's role
Their permissions JSONB
Their scope definition
Their team_id and manager_id

The same React component (<RoleDashboard />) renders completely different layouts based on these values. RLS policies ensure users only ever see data within their scope.

PART 10 - DATABASE / ENTITY MODEL
User ──┬── Team_Membership (1:1 - for workers)
       ├── Created_Users (1:many - Admin tracking)
       ├── Approval_Action (1:many)
       ├── Notification_Preference (1)
       ├── Audit_Log_Entry (1:many)
       └── Manager_Of (1:many)

Team ──┬── Lead_Worker (1)
       ├── Manager (1)
       ├── Members (1:many)
       └── Assigned_Work_Order (1:many)

Customer ──┬── Site (1:many)
           ├── Project (1:many)
           ├── AMC_Contract (1:many)
           ├── Repair_Ticket (1:many)
           ├── Asset (1:many)
           └── Communication_Timeline_Entry (1:many)

Project ──┬── BOQ_Item (1:many)
          ├── Milestone (1:many)
          ├── Work_Order (1:many)
          ├── Material_Issue (1:many)
          ├── Document (1:many)
          ├── Variation_Order (1:many)
          ├── Invoice (1:many)
          ├── Communication_Thread (1)
          ├── Assigned_Manager (1)
          └── Approval (1:many)

AMC_Contract ──┬── Service_Schedule (1:4)
               │      └── Work_Order (1:1)
               ├── Free_Call (1:many)
               ├── Replacement_Invoice (1:many)
               ├── Payment_Record (1:many)
               ├── Reactivation_Approval (0:many)
               ├── Assigned_Manager (1)
               └── Covered_Asset (many:many)

Repair_Ticket ──┬── Work_Order (1:many)
                ├── Parts_Used (1:many)
                ├── Invoice (0 or 1)
                └── SLA_Tracker (1)

Work_Order ──┬── Status_History (1:many)
             ├── Assigned_Users (many:many)
             ├── Material_Consumption (1:many)
             ├── Photo (1:many)
             ├── Customer_Signature (0 or 1)
             ├── Communication_Thread (1)
             ├── Activity_Log (1:many)
             ├── SLA_Tracker (1)
             ├── Approval (0:many)
             └── Asset_Event (0:many)

Asset ──┬── Asset_History_Event (1:many)
        ├── Linked_Project_Install (1)
        ├── Linked_AMC_Coverage (0:many)
        └── Warranty_Detail (1)

Approval_Chain_Config ──┬── Approval_Type
                        ├── Conditions
                        └── Chain (ordered roles)

Approval ──┬── Approval_Step (1:many)
           ├── Approval_History (1:many)
           ├── Resolved_Approver(s) (many:many)
           └── Linked_Entity (polymorphic)

Communication_Thread ──┬── Message (1:many)
                       ├── Member (1:many)
                       └── Activity_Event (1:many)

Escalation ──┬── Linked_Entity (polymorphic)
             ├── Escalation_Level_History (1:many)
             └── Resolution_Note (0 or 1)

SLA_Tracker ──┬── Target_Definition (1)
              ├── Status_Snapshot (1:many)
              └── Breach_Event (0:many)

Material ──┬── Stock_Location (central/vehicle/site)
           ├── Movement_Log
           └── Serial_Number ──► Asset (where applicable)

Subcontractor ── Assignment_to_Work_Order (scope-bound)

Costing_Record ──┬── Linked_Project / Linked_Work_Order
                 ├── Manpower_Cost
                 ├── Material_Cost
                 ├── Subcontractor_Cost
                 ├── Transport_Cost
                 ├── Overtime_Cost
                 └── Profitability_Snapshot

PART 11 - COSTING & PROFITABILITY ENGINE
Captured cost layers: manpower (WO hours × cost rate), subcontractor, material, transportation, overtime, equipment depreciation (Phase 3).
Profitability per Project, per Work Order, per Customer, per User. Real-time margin tiles, margin alerts, end-of-project post-mortem.

PART 12 - AUTOMATION & BUSINESS RULES
AMC: auto-scheduling of 4 quarterly services, payment-gated activation, automatic payment-arrival reactivation, renewal pipeline 60 days pre-expiry.
SIRA & Compliance: renewal alerts at 90/60/30/15 days, trade license/insurance/visa expiry alerts.
Work Orders: status validation, auto-status from check-in/out, ETA recalculation, auto-creation of multi-visit chains.
Materials: free-call-to-invoice conversion, low-stock auto-reorder requests, consumption reconciliation alerts.
Scheduling: double-booking prevention (Postgres exclusion constraint), smart reassignment, nightly forecasting.
SLA & Escalation: real-time countdowns, breach detection, auto-escalation level advancement.
Approvals: dynamic chain resolution, queue routing, stale approval auto-escalation.
Notifications: daily morning brief at 7:30am to all Managers, end-of-day timesheet auto-compile, payment reminders at 30/45/60 days.
Asset Registry: repeat-failure detection, warranty expiry alerts.

PART 13 - NOTIFICATION STRATEGY
Three channels (in-app push, WhatsApp, email, SMS fallback), smart batching, role-aware. Configurable per user via notification preferences. Immediate fires for: escalations, no-shows, SLA breaches, MD-level approvals, customer complaints, AMC reactivations.

PART 14 - KPIs
Strategic (MD): Revenue by stream, AMC renewal rate, average margin, DSO, CLV, escalation rate, SLA compliance.
Operational (Manager): Utilization, FCR, repair TAT, milestone-on-time, material wastage, AMC service-on-schedule, AMC reactivation TAT, SLA breach count, approval cycle time.
Field (Lead Worker): Hours vs. estimate, rework rate, customer sign-off score, WO completion rate.
Individual (Worker): Utilization, SLA compliance, customer rating, repeat-visit ratio.
Customer: Touch frequency, customer-specific SLA, AMC renewal probability, outstanding balance.
Admin-Specific: Active users by role, approval bottlenecks per role, system configuration changes per month.

PART 15 - MOBILE PWA WORKER WORKFLOW
LOGIN → MY DAY (today's work orders)
              │
              ▼
       OPEN WORK ORDER (single card)
              │
              ▼
       [NAVIGATE] [ACCEPT]
              │
              ▼
       [CHECK-IN] (geo-stamped, photo)
              │
              ▼
       WORK CHECKLIST
              │
              ├─► [ADD PHOTO]
              ├─► [SCAN ASSET BARCODE]
              ├─► [LOG MATERIAL USED]
              ├─► [VOICE NOTE]
              ├─► [REQUEST MATERIAL] → approval
              ├─► [REPORT BLOCKER] → Waiting status
              └─► [POST TO THREAD]
              │
              ▼
       [MARK COMPLETED] → SERVICE REPORT
              │
              ▼
       [CUSTOMER SIGNATURE] → Customer Approved
              │
              ▼
       WO Closes
Additional: leave requests, reassignment requests, approval queue, mentions, upcoming WOs, one-tap help.

PART 16 - AI & SMART AUTOMATION (PHASE 3+)

Intelligent technician recommendation
Repair pattern recognition
AMC renewal probability score
Quotation cost-AI
Anomaly detection on BOQ consumption
Voice-to-report generation
OCR for supplier delivery notes
WhatsApp customer bot
Predictive maintenance


PART 17 - PHASED ROADMAP
Phase 1 (Months 1–4) - Foundation

Admin & User Management (full)
Approval Chain Configuration UI
Dynamic dashboard rendering by role
Customer & Site master
Project module (basic)
AMC module with payment-gated services + reactivation flow
Work Order / Job Card System (full lifecycle)
Approval Workflow Engine (core, admin-configured)
Mobile PWA (work order execution)
Manager Central Operations Feed (Phase 1)
All role dashboards phone-responsive
Basic notifications
Asset Registry (basic)

Phase 2 (Months 5–8) - Operational Intelligence

Repair module
SLA Engine
Escalation Matrix
Leave Request & Smart Reassignment
Internal Communication Threads
Inventory & material reconciliation
SIRA compliance tracker
Subcontractor lite
Document repository
Reporting v1
Customer WhatsApp notifications

Phase 3 (Months 9–12) - Forecasting + Strategic

Costing & Profitability Engine (full)
Customer Communication Timeline (unified)
Resource Forecasting (rule-based)
Central Operations Feed v2
Advanced reports
AMC renewal pipeline
Customer portal v1
NPS feedback

Phase 4 (Months 13+) - Platform & AI

Multi-country/multi-currency
Vendor portal
AI features
Voice-first MD interface
Predictive maintenance
External integrations (Tally/Zoho/SIRA)


PART 18 - NON-FUNCTIONAL REQUIREMENTS
Performance: PWA load <3s on 4G, dashboard data <1s, realtime updates <2s, Central Ops Feed handles 500+ live work orders.
Security:

Supabase RLS on every table from day one
All RLS policies scope-aware (a Manager sees only their assigned scope)
JWT auth with refresh tokens
Storage policies mirror DB RLS
Server-side validation regardless of RLS
Full audit log on all modifications including all Admin actions
2FA mandatory for Admin, optional but recommended for MD/Manager/Accounts

Offline (Field PWA): Full offline work order execution, IndexedDB queuing, optimistic UI, server-wins conflict resolution.
Localization: Phase 1 English, Phase 2 Arabic (RTL), Phase 3 Hindi/Tamil/Urdu.
Responsive Breakpoints (Universal):

360–480px (primary design target, all roles)
481–768px
769–1024px
1025px+

Mobile-First Design Rules (Universal): every screen drafted at 360px first; no desktop-only features; tables become cards; drag-drop has mobile fallback; minimum 44×44px tap targets; PWA installable for all roles.
Browser Support: Chrome 90+, Safari 14+, Edge 90+, Firefox 90+.

PART 19 - DEVELOPMENT PRINCIPLES

Admin role bootstraps the system - first user created during setup, all subsequent users created by Admin
Role-based everything - UI, data access, approvals, escalations all driven by user's role + permissions + scope
Supabase RLS from day one - scope-aware policies
Business logic split sensibly: Postgres triggers/functions for data-bound; Node.js for orchestration
PostgreSQL views power dashboards - scope-filtered automatically
Proper indexing: user_id, role, team_id, manager_id, scope fields
Two environments: staging and production
Migrations via Supabase CLI
Audit log everything - especially Admin actions, approvals, escalations, status changes, AMC reactivations
API-first, Mobile-first, Real-time where it matters
Configurable, not hard-coded - approval chains, escalation timers, SLA targets all admin-editable
The Admin's UI deserves the same design quality as the field worker's UI


PART 20 - SUPABASE STORAGE STRUCTURE
admin/
  user-profile-photos/
  audit-exports/

project-documents/{project_id}/
  drawings/ boq/ sira/ photos/ service-reports/ handover/

amc-documents/{amc_contract_id}/
  contracts/ service-reports/ invoices/ reactivation-approvals/

repair-tickets/{ticket_id}/
  photos/ reports/

work-orders/{wo_id}/
  photos/ signatures/ voice-notes/ documents/

asset-registry/{asset_id}/
  install-photos/ service-photos/ docs/

communication/{thread_id}/
  attachments/

approvals/{approval_id}/
  supporting-docs/

compliance/
  sira-certificates/ trade-license/ insurance/ visas/

customer-comms/{customer_id}/
  attachments/

PART 21 - DEFINITION OF DONE

RLS policies (scope-aware) written, tested, reviewed
Database migration committed and applied to staging
Frontend works on 360px phone for every role
Tablet and desktop layouts verified
Offline behavior tested
Realtime updates verified
Audit log entries confirmed
Notifications fire correctly
SLA tracking integrated
Escalation triggers tested
Approval workflow tested with dynamic approver resolution
Admin can create users, assign roles, configure approval chains, set permissions
Login as different roles renders correct dashboards
Edge cases tested
Seed data realistic
User guides per role with phone + desktop screenshots


PART 22 - DELIVERABLES EXPECTED

Database schema - complete DDL, indexes, scope-aware RLS, triggers (including AMC reactivation), views, functions (including fn_resolve_approver)
Node.js API service with OpenAPI documentation
React PWA frontend with dynamic role-based rendering
Admin Management UI - full user/role/permission/approval-chain control
Mobile PWA installable for all roles
Central Operations Feed demonstrating scope-filtered live updates
Work Order lifecycle with audit trail
Approval Workflow Engine with admin-configured chains and dynamic resolution
AMC payment reactivation flow end-to-end
Escalation Matrix with manager-hierarchy-aware paths
SLA Engine with real-time countdowns
Smart Reassignment with skill/availability matching
Customer Communication Timeline unified across channels
Resource Forecasting with 4 forecast types
Asset Registry with serial-number scan
Costing & Profitability dashboard
Internal Communication Threads on every major entity
Notification system WhatsApp + Email + SMS + Push
Role-based access verified for all configured roles
Phone-responsive parity screenshots for every role
Offline mode end-to-end
Seed data including Admin user, sample users in each role, sample scope assignments
User documentation per role with phone screenshots
Admin operations guide for ongoing user/permission/configuration management
Migration plan for existing data


PART 23 - THE THREE TRUTHS TO INTERNALIZE

The Admin is the system's foundation. Every user, every permission, every approval chain flows from Admin configuration. Build the Admin UI first, and build it as carefully as the field worker UI.
AMC is the strategic future. Build the funnel into the workflow. Reactivation must be as smooth as activation.
Phone-first for everyone, not just the field. Every role, every screen, every workflow must work on a 6-inch screen with one hand.


PART 24 - EXPLICIT EXCLUSIONS

Knowledge Base / SOP Module
Full HR/payroll system
Full inventory ERP
Customer marketing automation
Heavy financial reporting (Tally/Zoho handles this)
E-commerce or product catalog

The system's focus is: operational visibility, workforce coordination, scheduling, execution tracking, proactive issue management, and converting field activity into measurable, billable, profitable work - all controlled by a flexible Admin-driven user model that lets Installtec grow without touching the code.

Build this system. Build it well. Build it Admin-first, so Installtec can scale; phone-first, so it gets used; and AMC-aware, so revenue compounds.Opus 4.7Claude is 
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context - they define how you work. Use them. -->
<attached-skill name="Hi-fi design">
Create a high-fidelity, polished design. Follow the instructions about design in your system prompt, particularly the 'How to do design work' section. Use the design_canvas starter component, or make a full-bleed prototype and offer options via Tweaks.
</attached-skill>

<attached-skill name="Interactive prototype">
Create a fully interactive prototype with realistic state management and transitions. Use React useState/useEffect for dynamic behavior. Include hover states, click interactions, form validation, animated transitions, and multi-step navigation flows. It should feel like a real working app, not a static mockup.
</attached-skill>

<attached-skill name="Design System (design system)">
[Design System] This project uses the **Design System** design system. This is a binding choice for visual style - every visual must follow it. Don't invent colors, type, spacing, or components not grounded here.

Scope: the design system is a visual style reference only. Its guide may describe example products, brands, or people that are unrelated to the user and unrelated to the subject of this conversation. Never treat anything in the design system as a fact about the user, their work, or the topic they asked about.

    Explore it to find what you need:
    - Always copy out the fonts and colors you need
    - For prototypes and designs, always copy out any relevant components
    - If the design system contains existing mocks of products, and you were asked to design or prototype something similar, copy and fork those mocks to start your design. This helps you make high-quality designs.
    
    Explore it quickly to find relevant UI kits (e.g. mocks of existing products you can copy and fork)

Full system at `/projects/ce96470e-616e-4f9c-ac2a-878474df02e1/`. Before producing any visuals, explore it: call `list_files("/projects/ce96470e-616e-4f9c-ac2a-878474df02e1/")` to see the structure, then `read_file` the README/base.md or whatever index file it has. Don't guess at the design system's contents.

CSS tokens: the guide may describe tokens in prose, but the exact `--*` names are defined in the design system's stylesheet(s). Before writing any `var(--*)`, look up the real name in the design system's `.css` files (`list_files` + `read_file` under `/projects/ce96470e-616e-4f9c-ac2a-878474df02e1/`). Never guess a token name - an unresolved `var()` silently falls back to the browser default.

For assets and UI kits beyond the guide: `read_file("/projects/ce96470e-616e-4f9c-ac2a-878474df02e1/<path>")` and `copy_files` to bring them into the current project.
</attached-skill>

<attached-skill name="Frontend design">
Use this guidance when designing frontend/UI work that is NOT governed by an existing brand or design system. Create distinctive HTML with exceptional attention to aesthetic details and creative choices.

### Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. Use these for inspiration but design one that is true to the aesthetic direction.
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

### Aesthetics Guidelines

- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt for distinctive, characterful choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, grain overlays.

Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on the same choices across generations.

Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate animations and effects. Minimalist designs need restraint, precision, and careful attention to spacing and subtle details.
</attached-skill>

<attached-skill name="Interactive prototype">
Create a fully interactive prototype with realistic state management and transitions. Use React useState/useEffect for dynamic behavior. Include hover states, click interactions, form validation, animated transitions, and multi-step navigation flows. It should feel like a real working app, not a static mockup.
</attached-skill>

## Assistant

_[tool: list_files]_

_[tool: questions_v2]_

## User

Questions answered:
- hero_screens: Operations Manager Dashboard (command center)
- form_factor: Both equally - mobile and desktop side-by-side per screen
- interactivity: Fully interactive prototype with multi-step flows
- type: General Sans (refined geometric)
- personality: A balanced blend
- icons: Lucide (clean line, 1.5px stroke)
- imagery: Yes - use the named clients/sites from the brief (DAMAC, MAG Group, Burj Khalifa area, etc.)
- tweaks: Accent color (sage / cyan / alt), Density (comfortable / compact), Radius scale (soft / softer / softest), Surface mode (flat / floating cards)
- scope: Foundations + 4-5 hero screens (focused, deep)

## Assistant

_[tool: copy_starter_component]_

_[tool: read_file]_

_[tool: update_todos]_

Good - let me plan and start building. I'll commit to:
- **Foundations** card (palette, type, components)
- **Operations Manager Dashboard** (desktop + mobile)
- **Technician Mobile Workflow** (multi-step: My Day → Work Order → check-in → service report)
- **AMC Management + Reactivation flow** (desktop + mobile)
- **Approval Workflow** (mobile + desktop)
- Tweaks: accent, density, radius, surface

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: copy_starter_component]_

_[tool: grep]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_html]_

_[tool: done]_

_[tool: update_todos]_

_[tool: fork_verifier_agent]_

Built **Installtec** - a calm, premium operational design system for the CRM brief.

**What's in the canvas** (pan with trackpad/middle-drag, ⊕/⊖ to zoom, click any header to focus an artboard fullscreen with ← → keys):

- **01 - Foundations** · palette, type scale, components, radii, shadows, icon set
- **02 - Operations Manager Dashboard** · mobile + desktop side-by-side · KPI strip, live ops feed (filterable), pending approvals, forecast risks, schedule timeline
- **03 - Technician Mobile Workflow** · a fully clickable multi-step flow: My Day → Work Order → Check-in (locating + geo-confirm) → Work checklist → Service report → Customer signature pad → Complete
- **04 - AMC Management** · the strategic gold mine · desktop with renewal funnel + contracts table, mobile list, and the **payment-driven reactivation modal** approve/reject end-to-end

**Tweaks panel** (bottom-right): accent (sage / cyan / amber / blush), density, radius scale, surface mode (floating / flat).

Notes:
- Approval Workflow surfaces inside both Ops Dashboard (approvals tab) and AMC (reactivation modal) - happy to spin it out as its own dedicated screen if you want a deeper view (chain configuration, escalation matrix, audit trail).
- Data is real Installtec from the brief (DAMAC, MAG 318, Manipal Dubai, NMC, CSH Deira, Burj Vista, Azizi Riviera).Canvas is live with all four hero sections plus foundations - pan, zoom, and click any artboard header to focus it fullscreen. The Technician flow is fully clickable through to a signed-off WO; the AMC reactivation modal walks through approve → reactivated. Let me know what to push further.

## User

<system-info comment="Only acknowledge these if relevant">
User is viewing file: index.html
</system-info>

<pasted_text name="Pasted text (278 lines)">
You are NOT building isolated pages, disconnected sections, demo dashboards, or separate module prototypes.

You are building ONE unified enterprise-grade application with shared architecture, shared state management, shared routing, shared permissions, shared layouts, shared APIs, shared database structure, and shared design system.

This must behave like a real production SaaS platform, not a collection of independent UI screens.

IMPORTANT:

Do NOT build module-by-module as standalone apps.

Everything must be connected into ONE integrated CRM + FSM + Operations platform.

The application must have:

* one global app shell
* one sidebar/navigation system
* one authentication system
* one role-based access system
* one centralized routing structure
* one unified design system
* one shared component architecture
* one global state management structure
* one notification system
* one activity/event architecture
* one database architecture
* one work-order-driven operational flow

The application architecture must feel like:

Salesforce
+
ServiceTitan
+
Zoho FSM
+
Monday.com
+
Field service ERP

inside one cohesive product.

CRITICAL DEVELOPMENT RULES:

1. DO NOT create isolated pages that are not connected to workflows.

Every module must connect operationally.

Example:

Customer
→ Project
→ Work Order
→ Technician
→ Approval
→ Invoice
→ Activity Feed
→ Asset History

Everything must interconnect.

2. Build using a CENTRAL APP SHELL.

Structure:

* Left sidebar
* Top navigation
* Dynamic role-aware content area
* Global command/search
* Notification center
* Realtime activity feed support
* Mobile bottom navigation fallback

3. Use ONE unified design system across the entire application.

Design direction:

* Soft pastel enterprise UI
* Modern glassmorphism-lite
* Rounded cards
* Calm operational dashboard feel
* Minimal visual noise
* Spacious layout
* Mobile-first responsive system
* Enterprise-grade UX

Color palette inspiration:

Background:
#F8FAFC

Cards:
#FFFFFF

Primary:
#5BAE9C

Secondary:
#A78BFA

Accent:
#F4B8A4

Text:
#1E293B

Borders:
#E2E8F0

Hover:
soft translucent elevation

The UI must feel premium, modern, operational, and calming - not corporate dark mode.

4. Build the COMPLETE APPLICATION STRUCTURE FIRST before deep module implementation.

First establish:

* folder architecture
* route architecture
* layout system
* auth flow
* role system
* permission system
* database models
* app shell
* navigation
* shared UI primitives
* event architecture
* API structure
* mobile responsiveness
* design tokens

THEN connect modules into the unified system.

5. Every dashboard must use SHARED COMPONENTS.

Example shared components:

* KPI cards
* Activity timelines
* Approval cards
* Work-order cards
* Calendar widgets
* Status badges
* Notification drawers
* Slide-over panels
* Mobile action sheets
* Reusable data tables
* Reusable filters
* Shared forms
* Shared modals

Do NOT redesign components separately for each module.

6. The Work Order system is the HEART of the platform.

Projects, Repairs, AMC, Deliveries, Surveys all flow through:

Work Orders / Job Cards.

This is the central execution engine.

All workflows must connect into this system.

7. Build the backend architecture properly.

Use:

Frontend:

* React + Vite
* Tailwind
* shadcn/ui
* Zustand
* React Router

Backend:

* Supabase
* PostgreSQL
* RLS
* Realtime
* Storage

Optional logic layer:

* NestJS

8. IMPORTANT:

DO NOT generate fake placeholder architecture.

Generate REAL scalable production architecture.

Include:

* actual folder structures
* actual route structures
* actual reusable layout systems
* actual role architecture
* actual state management patterns
* actual API organization
* actual schema planning
* actual event system planning

9. PRIORITY ORDER:

FIRST:

* unified architecture
* app shell
* routing
* auth
* permissions
* role rendering
* shared layouts
* responsive system

SECOND:

* work-order system
* customer/project structure
* scheduling
* technician workflows

THIRD:

* AMC
* approvals
* notifications
* SLA
* escalations

FOURTH:

* forecasting
* analytics
* profitability
* intelligence

10. VERY IMPORTANT:

This must feel like ONE cohesive operational platform.

NOT:

* a dashboard collection
* template sections
* unrelated screens
* separate mini apps

Everything must feel operationally connected.

11. Mobile-first is mandatory.

Every screen must work perfectly on:

* 360px phones
* tablets
* desktop

No desktop-only workflows allowed.

12. Build with enterprise scalability in mind.

The architecture must support:

* multiple countries
* multiple teams
* multiple managers
* large datasets
* realtime operations
* future AI features

without requiring major rewrites.

Now rebuild the system as ONE integrated enterprise application architecture and UI system instead of isolated sections.

</pasted_text>

## Assistant

_[tool: update_todos]_

Right - pivoting hard from "design system canvas" to "one cohesive enterprise SaaS platform." Let me set up the new architecture.

_[tool: delete_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

_[tool: update_todos]_

Rebuilt as **one cohesive enterprise platform**, not a collection of pages. Everything runs in a single app shell with shared sidebar, topbar, routing, state, and design system.

**Architecture**
- **One shell** - sidebar + topbar + responsive content area, collapses on tablet, switches to bottom-nav on mobile
- **One context** - `AppProvider` owns user/role, route, slide-over, modal, notifications, toasts
- **One route map** - `app.jsx` ROUTES table
- **One data model** - `data.jsx` is fully relational (`DB.byCustomer(id)`, `DB.byProject(id)`, `DB.byAmc(id)`)
- **One design system** - cool slate ink, mint primary, violet/peach accents, all CSS variables

**14 connected modules**
- **Dashboard** - role-aware: Manager (live feed + approvals + risks), MD (revenue charts + compliance), Field (My Day with live WO), Support, Accounts, Sales, Admin
- **Work Orders** - list + table view + slide-over detail with tabs (Overview / Tasks / Materials / Thread / Audit) and live SLA
- **AMC** - list + detail with quarterly service schedule + **payment-driven reactivation modal** (review → approve → contract unlocked)
- **Approvals** - queue + chain visualization + dedicated chain-configuration view (admin-controlled)
- **Customers** - list + detail with linked Projects / AMC / Comms timeline
- **Projects** - list + detail with milestone timeline + linked WOs
- **Scheduling** - per-lead day-view timeline with click-through to WO
- **Repair, Inventory, Logistics, Team, Reports, Admin, Live Feed**

**Operational connectivity** - clicking any entity (WO from feed, customer from sidebar in WO, AMC from approval, etc.) navigates correctly. AMC reactivation approval routes back to the AMC modal.

**Try these**
- **⌘K** opens command palette - search WOs, customers, AMCs, pages
- **Bell** opens notification drawer
- **Role pill** in topbar - switch between 11 roles to see different dashboards (Manager → MD → Worker → Admin)
- AMC tab → reactivation banner → approve flow
- Resize browser narrow to see mobile bottom nav

_[tool: fork_verifier_agent]_

Platform is live - open the sidebar to explore. Let me know which module to deepen first or what to add (a real auth screen, the technician mobile workflow, profitability dashboard, etc.).

## User

Verifier agent check completed

## Assistant

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: done]_

Fixed - `.show-mobile` / `.hide-mobile` utilities now use `!important` so they win against component display rules. The duplicate "Review" button on the AMC banner is gone at desktop widths.

## User

Please export the complete codebase you've built. I need to take it into Antigravity IDE and continue building with Claude Code.
Give me:

The exact folder structure (tree view) so I know where each file goes
The full contents of every file - one file at a time, with the file path clearly labeled above each code block
A package.json with all dependencies you've used
A README.md at the root explaining: what this is, what's built so far, what's mock vs real, how to run it locally, known limitations
A SETUP.md with step-by-step instructions on how to install and run it on a fresh machine
A NEXT_STEPS.md describing what work remains to turn this prototype into the production system per the master prompt - backend integration, Supabase setup, real auth, database schema, etc.

Do not summarize or shorten any file. I need the complete, copy-pasteable code. Output everything as plain markdown with proper code blocks tagged by language (html, css, js, jsx, etc.).
If the output is too long for one message, split it into parts and tell me "Part 1 of N" at the top of each, then continue when I say "next."

## Assistant

I'll split this into 6 parts. Here's Part 1 - the project metadata, structure, docs, and entry HTML.

# Part 1 of 6 - Project docs, structure, and entry

## Folder structure

```
installtec-os/
├── README.md
├── SETUP.md
├── NEXT_STEPS.md
├── package.json
├── index.html
├── tokens.css
├── data.jsx
├── icons.jsx
├── components.jsx
├── shell.jsx
├── app.jsx
└── modules/
    ├── dashboard.jsx
    ├── workorders.jsx
    ├── amc.jsx
    ├── approvals.jsx
    ├── customers.jsx
    └── misc.jsx
```

13 source files, 4 docs. ~220 KB of code total. Built as a **CDN-loaded React + Babel prototype** - no build step required to view, but designed for migration to a Vite + Supabase production app (see `NEXT_STEPS.md`).

---

## `README.md`

````markdown
# Installtec OS

A unified mobile-responsive CRM + Field Service Management (FSM) + Operations
prototype for **Installtec Electromechanical LLC** - Dubai-based ELV system
integrator (CCTV, ACS, SCS, fiber, automation) operating across UAE, KSA,
Ethiopia, Uganda, and India.

Built against the **Master Build Prompt v4** (Admin-driven user model,
Work-Order-centric execution layer, AMC reactivation flow, Approval Workflow
Engine, mobile-first PWA for every role).

---

## What this is

A **clickable, role-aware front-end prototype** of the entire platform -
one cohesive app shell with 14 connected modules, shared components, and a
relational mock data model. The architecture is production-shaped: drop in
a real backend (Supabase + NestJS) and the UI continues to work.

---

## What's built

### Architecture (one cohesive platform - not isolated pages)

- **One app shell** - fixed sidebar + topbar on desktop, collapses to icon-only
  at ≤1024 px, switches to bottom-nav at ≤720 px
- **One state context** - `AppProvider` owns: current user, role, route,
  slide-over, modal stack, notifications, toasts
- **One route table** - `app.jsx` `ROUTES` maps to 14 modules
- **One relational data model** - `data.jsx` has helpers
  `DB.byCustomer(id)`, `DB.byProject(id)`, `DB.byAmc(id)` so navigation
  between linked entities is one click
- **One design system** - `tokens.css` defines every color, type step,
  shadow, radius, and component primitive
- **One Command Palette** - Cmd/Ctrl-K opens it, searches every entity
- **One Notification Drawer** - bell icon in topbar
- **One Role Switcher** - pill in topbar previews any of 11 roles
- **Mobile-first responsive** - tables collapse to cards, hide-mobile /
  show-mobile utilities, fixed bottom nav with FAB

### Modules

| Module | What's in it |
|---|---|
| **Dashboard** | Role-aware - Manager (live feed + approvals + risks + schedule), MD (revenue chart + country split + compliance), Field worker (My Day + live WO card), Support, Accounts, Sales, Admin |
| **Work orders** | List + table + card view, filter bar, search, slide-over detail with tabs (Overview / Tasks / Materials / Thread / Audit), live SLA progress |
| **AMC contracts** | List + detail with quarterly service schedule + the **payment-driven reactivation modal** (review → approve → contract unlocked) |
| **Approvals** | Queue with chain visualization preview + slide-over detail with full chain + admin chain-configuration view |
| **Customers** | List + detail with tabs (Overview / Projects / AMC / Comms timeline) and linked-entity navigation |
| **Projects** | List + detail with milestone timeline + linked WOs |
| **Scheduling** | Per-lead day-view timeline with click-through to WO detail |
| **Repair** | SLA-tracked ticket list with classification, repeat-failure flags |
| **Inventory** | Central / vehicle / site stock with low-stock alerts |
| **Logistics** | Delivery WOs |
| **Team** | Member cards with skills, live-status badges |
| **Reports** | Revenue trend, margin by stream |
| **Admin · Users** | User table with roles, manager hierarchy |
| **Live feed** | Full-page activity log with click-through to source entity |

### Workflow connections

- **Customer** → linked Projects / AMCs / Repairs / WOs / Comms
- **Project** → linked WOs + milestone payments
- **AMC** → 4 quarterly services → each spawns a WO; payment triggers reactivation approval
- **WO** → source (project/AMC/repair), assigned crew, materials, audit
- **Approval** → linked entity (clickable), chain with resolved approvers
- **Feed item** → click follows to source entity

### Design

- Soft pastel enterprise palette: slate ink `#1E293B`, mint primary `#5BAE9C`,
  violet `#A78BFA`, peach `#F4B8A4`, on `#F8FAFC` background
- General Sans (display) + Inter (UI) + JetBrains Mono (numerics) from CDN
- Lucide-style 1.5 px stroke icon set
- Soft shadows, 14-26 px radius, glassmorphism-lite on overlays

---

## What's mock vs. real

| Layer | Status |
|---|---|
| **UI components** | Real - production-quality React/CSS |
| **Routing, navigation, state** | Real |
| **Role-aware rendering** | Real - flip the topbar role switcher, the whole dashboard changes |
| **Data** | **Mock** - `data.jsx` is in-memory only. No persistence, no API. |
| **Authentication** | **Mock** - role switcher is a preview, not login |
| **Permissions / RLS** | **Mock** - only nav visibility filters by role. No data scoping. |
| **Realtime** | **Mock** - feed is static |
| **WhatsApp / Email / SMS** | **Not wired** - UI affordances only |
| **Offline / PWA** | **Not wired** - needs service worker + IndexedDB |

---

## How to run locally

No build step required. The prototype loads React + Babel from CDN.

```bash
# from the project root
npx serve .
# or
python3 -m http.server 5173
```

Then open `http://localhost:5173` (or whatever port `serve` reports).

See `SETUP.md` for fresh-machine instructions.

---

## Known limitations

1. **Babel-in-browser is slow** - first page load takes 1–3 s while Babel
   transpiles all the JSX files. Acceptable for a prototype, unacceptable
   for production. Migration to Vite removes this entirely.
2. **No data persistence** - refreshing the page resets everything.
3. **No authentication** - role switcher is a preview tool, anyone can
   become Admin.
4. **No RLS or scope enforcement** - a worker can theoretically see all
   data. Sidebar nav hides irrelevant modules per role, but that's UI sugar.
5. **Mobile responsive but not touch-optimized for every screen** -
   designed mobile-first but some desktop-heavy views (Scheduling timeline,
   Reports charts) compress aggressively on a 360 px phone.
6. **Some modules are deliberately shallow** - Inventory, Logistics,
   Reports, Team are functional but not production-deep. The hero modules
   (Dashboard, Work orders, AMC, Approvals, Customers) are full.

---

## Tech stack (current prototype)

- React 18.3.1 (UMD via unpkg)
- ReactDOM 18.3.1 (UMD via unpkg)
- Babel Standalone 7.29.0 (browser transpilation)
- Pure CSS variables (no Tailwind in the prototype - migrating to Tailwind
  is the recommended first step in `NEXT_STEPS.md`)
- Google Fonts (Inter, JetBrains Mono) + Fontshare (General Sans)

## Tech stack (target production - see `NEXT_STEPS.md`)

- React 18 + Vite
- Tailwind CSS + shadcn/ui
- Zustand for global state
- React Router
- Supabase (PostgreSQL + Auth + Storage + Realtime + RLS)
- NestJS for orchestration logic
- BullMQ + Redis for job queues
- Workbox / Dexie.js for PWA + offline

````

---

## `SETUP.md`

````markdown
# Setup - fresh machine

The prototype is a static HTML + JSX bundle that loads React and Babel from
CDN. No npm install, no build step, no node version pinning required to run
it as-is.

## Option A - quickest (zero install)

If you have any modern HTTP server already (Python, PHP, Caddy, nginx,
etc.), serve the project root.

```bash
# Python
cd installtec-os
python3 -m http.server 5173

# PHP
php -S localhost:5173

# Caddy
caddy file-server --listen :5173
```

Then open `http://localhost:5173`.

## Option B - Node (recommended for Antigravity IDE)

```bash
cd installtec-os
npm install        # only installs the `serve` dev dependency
npm run dev        # starts a static server on port 5173
```

## Option C - open the file directly (works, but limited)

You can double-click `index.html` and it will load in your browser via
`file://`. Babel transpilation works, fonts load, but **some browsers**
(Chrome since v117) restrict `<script src="./foo.jsx">` cross-origin checks
under `file://`. If you see "failed to fetch" in the console, use Option A
or B instead.

## Browser support

- Chrome 90+
- Safari 14+
- Edge 90+
- Firefox 90+

## Troubleshooting

| Symptom | Fix |
|---|---|
| Blank page, console error about `Cannot read properties of undefined (reading 'createElement')` | Babel hasn't finished transpiling yet - wait 1–2 s and refresh once. If it persists, your network is blocking unpkg.com. |
| Fonts look wrong (system serif everywhere) | Fontshare or Google Fonts blocked. Check network tab. The app still functions, just with system fonts. |
| Layout broken on mobile | Confirm your browser viewport is actually <720 px wide (or use devtools device toolbar). |
| "Failed to fetch" on a `.jsx` file | Don't open via `file://` - use Option A or B. |

## Project structure

```
installtec-os/
├── README.md
├── SETUP.md
├── NEXT_STEPS.md
├── package.json          ← minimal: only the `serve` dev dependency
├── index.html            ← entry point - loads React, Babel, then every .jsx
├── tokens.css            ← design tokens + every CSS primitive
├── data.jsx              ← relational mock data + helper functions
├── icons.jsx             ← Lucide-style icon set as one component
├── components.jsx        ← shared UI primitives (KPI, WoCard, FeedItem, SlideOver, Modal, FilterBar, StatusBadge, ApprovalCard, ApprovalChain…)
├── shell.jsx             ← AppProvider, Sidebar, Topbar, BottomNav, CommandPalette, NotifDrawer, Toast
├── app.jsx               ← root component + ROUTES table
└── modules/
    ├── dashboard.jsx     ← role-aware dashboard (7 variants)
    ├── workorders.jsx    ← WO list + slide-over detail (the heart)
    ├── amc.jsx           ← AMC list + detail + reactivation modal
    ├── approvals.jsx     ← queue + chain viz + chain config
    ├── customers.jsx     ← list + detail with linked entities
    └── misc.jsx          ← scheduling, projects, repair, inventory, logistics, team, reports, admin, feed
```

## Editing files

All `.jsx` files use the **window-globals pattern** - each one writes its
exports onto `window` so other files can read them without a module system:

```javascript
// at the end of each file:
Object.assign(window, { Sidebar, Topbar, AppProvider, useApp });
```

This is a CDN-prototype convention only. Migration to Vite (see
`NEXT_STEPS.md`) replaces it with proper ES module imports.

## Running tests

There are no tests in the prototype. Adding Jest/Vitest is part of the
migration to Vite - see `NEXT_STEPS.md`.

````

---

## `NEXT_STEPS.md`

````markdown
# Next steps - prototype → production

This file maps the gap between the current clickable prototype and the
production system specified in the Master Build Prompt v4.

## Phase 0 - Migrate to Vite (1–2 days)

The single highest-leverage change. Removes browser Babel, adds real module
imports, unlocks the entire JavaScript tooling ecosystem.

### 0.1 Scaffold

```bash
npm create vite@latest installtec-os -- --template react
cd installtec-os
npm install
```

### 0.2 Move files

```
src/
├── main.jsx                  ← was app.jsx (root + ROUTES)
├── App.jsx                   ← new - wraps Shell in AppProvider, exports ROUTES
├── index.css                 ← was tokens.css
├── icons/Icon.jsx            ← was icons.jsx
├── lib/data.js               ← was data.jsx (rename to .js, it's pure data)
├── components/
│   ├── KPI.jsx
│   ├── WoCard.jsx
│   ├── FeedItem.jsx
│   ├── ApprovalCard.jsx
│   ├── ApprovalChain.jsx
│   ├── SlideOver.jsx
│   ├── Modal.jsx
│   ├── FilterBar.jsx
│   ├── StatusBadge.jsx
│   ├── PageHeader.jsx
│   ├── CardHead.jsx
│   └── EmptyState.jsx
├── shell/
│   ├── AppProvider.jsx
│   ├── Sidebar.jsx
│   ├── Topbar.jsx
│   ├── BottomNav.jsx
│   ├── CommandPalette.jsx
│   ├── NotifDrawer.jsx
│   └── Toast.jsx
└── modules/
    ├── dashboard/
    │   ├── ManagerDashboard.jsx
    │   ├── FieldDashboard.jsx
    │   ├── MdDashboard.jsx
    │   ├── AdminDashboard.jsx
    │   ├── SupportDashboard.jsx
    │   ├── AccountsDashboard.jsx
    │   └── SalesDashboard.jsx
    ├── workorders/
    │   ├── WorkOrders.jsx     (list)
    │   └── WoSlideover.jsx
    ├── amc/
    │   ├── AmcModule.jsx
    │   ├── AmcDetail.jsx
    │   └── ReactivationModal.jsx
    ├── approvals/
    │   ├── Approvals.jsx
    │   ├── ApprovalSlideover.jsx
    │   └── ChainConfig.jsx
    └── …
```

### 0.3 Replace window globals with imports

Find/replace `window.useApp()` → `useApp()` plus an explicit
`import { useApp } from '@/shell/AppProvider'` at the top of each consumer.
Same for `window.DB` → `import { DB } from '@/lib/data'`. Drop every
`Object.assign(window, {...})` block.

### 0.4 Add path alias

`vite.config.js`:

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
});
```

### 0.5 Add React Router

```bash
npm install react-router-dom
```

Replace the `route` state in `AppProvider` with router hooks. Each
`ROUTES` entry becomes a `<Route>`. Detail pages (`amc/:id`,
`customers/:id`, `projects/:id`) get real URLs and the back button
works.

---

## Phase 1 - Tailwind + shadcn/ui (2–3 days)

The current CSS is hand-rolled CSS variables. Production-ready, but
shadcn/ui is the team's stated choice in the build prompt.

### 1.1 Install

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn-ui@latest init
```

### 1.2 Port tokens

Map the variables in `tokens.css` to the Tailwind `theme.extend` config:

```javascript
// tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1E293B', soft: '#475569', mute: '#64748B', quiet: '#94A3B8' },
        primary: { 50: '#ECF7F4', 100: '#D7EFE9', 500: '#5BAE9C', 700: '#3A7363' },
        secondary: { 100: '#EBE3FD', 500: '#A78BFA', 700: '#6A52BF' },
        accent: { 100: '#FBE2D7', 500: '#F4B8A4', 700: '#A5664F' },
        // …status colors
      },
      borderRadius: { xs: '8px', sm: '10px', md: '14px', lg: '18px', xl: '24px' },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['General Sans', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
};
```

### 1.3 Replace primitive components

shadcn replacements for what we built:

| Hand-rolled | shadcn/ui |
|---|---|
| `.btn`, `.btn-primary` | `<Button variant="default">` |
| `.input`, `.textarea` | `<Input>`, `<Textarea>` |
| `.modal-back`, `.modal` | `<Dialog>` |
| `.slideover-back`, `.slideover` | `<Sheet>` |
| `.cmdk-*` | `<Command>` from cmdk |
| `.table` | `<Table>` |
| `.badge` | `<Badge>` |
| `.seg` | `<Tabs>` or `<ToggleGroup>` |

Keep the custom `KPI`, `WoCard`, `FeedItem`, `ApprovalCard`,
`ApprovalChain`, `StatusBadge` - they're domain-specific.

---

## Phase 2 - Supabase backend (1 week)

### 2.1 Provision

```bash
npm install @supabase/supabase-js
```

Create a Supabase project (Mumbai or Singapore region per spec).

### 2.2 Schema

The mock data in `data.jsx` already maps cleanly to the Master Build Prompt
schema (Part 10). Translate:

```sql
-- See PART 10 (Database / Entity Model) in the master build prompt
-- for the complete schema. Key tables:

create type user_role as enum (
  'admin','md','manager','sales','estimator',
  'lead_worker','worker','driver','subcontractor',
  'service_support','accounts'
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  phone text,
  full_name text not null,
  profile_photo_url text,
  employee_id text,
  office_location text,
  role user_role not null,
  permissions jsonb default '{}',
  scope jsonb default '{}',
  manager_id uuid references users(id),
  team_id uuid references teams(id),
  is_active boolean default true,
  notification_preferences jsonb default '{}',
  created_by uuid references users(id),
  created_at timestamptz default now(),
  last_login_at timestamptz,
  deactivated_at timestamptz,
  deactivation_reason text
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lead_worker_id uuid references users(id),
  manager_id uuid references users(id),
  skills text[],
  region text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text check (tier in ('Strategic','Key','Standard')),
  region text,
  sector text,
  owner_id uuid references users(id),
  tags text[],
  since date,
  created_at timestamptz default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  name text not null,
  area text,
  geo geography(point),
  access_notes text
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  manager_id uuid references users(id),
  team_id uuid references teams(id),
  status text,
  stage text,
  progress int default 0,
  value numeric,
  started_at date,
  due_at date,
  milestones jsonb default '[]'
);

create type amc_state as enum (
  'DRAFT','SIGNED','ACTIVE','BLOCKED',
  'PENDING_REACTIVATION','RENEWAL_DUE','EXPIRED'
);

create table amc_contracts (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  manager_id uuid references users(id),
  state amc_state not null default 'DRAFT',
  value numeric,
  services_done int default 0,
  services_total int default 4,
  next_due date,
  overdue_days int default 0,
  free_calls_used int default 0,
  free_calls_included int default 10,
  signed_at timestamptz,
  paid_at timestamptz,
  expires_at date
);

create type wo_type as enum (
  'AMC','PROJECT','REPAIR','DELIVERY','SURVEY','EMERGENCY'
);
create type wo_status as enum (
  'Created','Assigned','Accepted','In Transit','Checked In',
  'In Progress','Waiting For Material','Waiting For Customer',
  'Completed','Customer Approved','Closed'
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  type wo_type not null,
  title text not null,
  source_kind text,  -- 'amc' | 'project' | 'repair'
  source_id uuid,
  customer_id uuid not null references customers(id),
  site_id uuid references sites(id),
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  status wo_status not null default 'Created',
  assigned_lead_id uuid references users(id),
  assigned_ids uuid[],
  priority text,
  sla_minutes int,
  flagged text,
  tasks jsonb default '[]',
  materials jsonb default '[]',
  created_at timestamptz default now()
);

create table approval_chain_config (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null,
  conditions jsonb default '{}',
  chain jsonb not null,
  is_active boolean default true
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  kind text not null,
  amount numeric,
  context text,
  requester_id uuid references users(id),
  target_kind text,
  target_id uuid,
  priority text,
  chain jsonb default '[]',
  state text default 'pending',
  opened_at timestamptz default now(),
  closed_at timestamptz,
  notes text
);

-- repeat for repairs, comms, notifications, audit_log,
-- inventory_items, stock_movements, assets, asset_events…
```

### 2.3 RLS policies (CRITICAL)

Every table needs scope-aware RLS from day one. The pattern:

```sql
alter table work_orders enable row level security;

create policy "users see WOs within their scope" on work_orders
for select using (
  -- admin / md / accounts see everything
  (select role from users where id = auth.uid()) in ('admin','md','accounts')
  -- everyone else: WOs they're assigned to OR their scope owns
  or auth.uid() = any(assigned_ids)
  or customer_id in (
    select unnest(coalesce((scope->>'customers')::uuid[], array[]::uuid[]))
    from users where id = auth.uid()
  )
);
```

Test each role on every table. Add `audit_log` triggers on every modify.

### 2.4 Real-time

The live feed module is ready for Supabase Realtime:

```javascript
const channel = supabase
  .channel('feed')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' },
      payload => setFeed(prev => [payload.new, ...prev]))
  .subscribe();
```

### 2.5 Replace mock data

Swap `data.jsx` consumers to query Supabase. `DB.byCustomer(id)` becomes:

```javascript
export async function byCustomer(id) {
  const [{ data: projects }, { data: amcs }, { data: repairs }] = await Promise.all([
    supabase.from('projects').select('*').eq('customer_id', id),
    supabase.from('amc_contracts').select('*').eq('customer_id', id),
    supabase.from('repair_tickets').select('*').eq('customer_id', id),
  ]);
  return { projects, amcs, repairs };
}
```

Wrap in React Query / TanStack Query for caching.

---

## Phase 3 - Authentication (2 days)

### 3.1 Supabase Auth

```javascript
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(URL, ANON_KEY);

// Magic link
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://crm.installtecuae.com/auth/callback' } });

// Password
await supabase.auth.signInWithPassword({ email, password });
```

### 3.2 2FA for sensitive roles

Admin and MD must enroll. Use TOTP via `supabase.auth.mfa.enroll`.

### 3.3 Replace role switcher

Today's role-switcher pill stays as a **dev tool** behind a feature flag,
but the user's real role comes from the `users` table joined to
`auth.uid()`.

```javascript
// AppProvider
const { data: me } = useQuery(['me'], async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return supabase.from('users').select('*').eq('auth_id', user.id).single();
});
```

### 3.4 Route guards

```jsx
<Route element={<RequireRole roles={['admin']} />}>
  <Route path="admin" element={<Admin />} />
</Route>
```

---

## Phase 4 - NestJS orchestration layer (1 week)

Direct Supabase queries cover ~70% of UI needs. The rest needs server-side
logic:

| Job | Why server-side |
|---|---|
| Approval chain resolution (`fn_resolve_approver`) | Walks team + manager hierarchy, must be transactional |
| AMC reactivation pipeline | Detect payment, trigger contract state machine, create approval, notify |
| WhatsApp / Email / SMS sending | API keys can't live in browser |
| PDF generation (service reports, quotations) | Puppeteer |
| Scheduled jobs (renewal alerts, SLA tickers, daily brief) | `node-cron` + BullMQ |
| Forecasting (capacity, material, AMC clusters) | Heavy queries, nightly |

Scaffold:

```bash
npm i -g @nestjs/cli
nest new installtec-api
cd installtec-api
npm install @supabase/supabase-js bullmq ioredis puppeteer pino zod
```

Module structure:

```
src/
├── approvals/
│   ├── approval-chain.service.ts    ← fn_resolve_approver equivalent
│   └── approvals.controller.ts
├── amc/
│   ├── reactivation.processor.ts    ← BullMQ worker
│   └── amc.controller.ts
├── notifications/
│   ├── whatsapp.service.ts
│   ├── email.service.ts
│   └── sms.service.ts
├── pdf/
│   └── service-report.service.ts
├── jobs/
│   ├── daily-brief.job.ts
│   ├── renewal-alerts.job.ts
│   └── sla-monitor.job.ts
└── forecast/
    └── forecast.service.ts
```

---

## Phase 5 - PWA + offline (3 days)

The field worker workflow has to work without signal.

### 5.1 Workbox

```bash
npm install -D vite-plugin-pwa workbox-window
```

```javascript
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa';

export default {
  plugins: [react(), VitePWA({
    registerType: 'autoUpdate',
    manifest: {
      name: 'Installtec OS',
      short_name: 'Installtec',
      theme_color: '#5BAE9C',
      icons: [/* … */],
    },
  })],
};
```

### 5.2 Dexie.js for queued mutations

```javascript
import Dexie from 'dexie';
const db = new Dexie('installtec');
db.version(1).stores({
  pending: '++id, kind, payload, createdAt',
  workOrders: 'id, customer_id, status',
});

// On WO complete with no signal:
await db.pending.add({ kind: 'wo.complete', payload: woData, createdAt: Date.now() });

// On reconnect:
const pending = await db.pending.toArray();
for (const item of pending) {
  await syncToSupabase(item);
  await db.pending.delete(item.id);
}
```

### 5.3 Optimistic UI

Use TanStack Query's `useMutation` with `onMutate` to update cache
immediately, server reconciles later.

---

## Phase 6 - Module completion (ongoing)

The hero modules (Dashboard, WO, AMC, Approvals, Customers) are ~80%
production-ready in design. The lighter modules need expansion:

- **Inventory** - material movement log, serial-number tracking,
  BOQ-vs-actual reconciliation, low-stock auto-reorder
- **Logistics** - vehicle stock view, pickup tasks, route view
  (Mapbox/Google Maps), driver app screens
- **Repair** - first-visit forced-capture checklist, multi-visit chain,
  free-call → chargeable conversion workflow
- **Reports** - drillable charts (Recharts), per-technician/project/
  customer reports, export to PDF/CSV
- **Admin · Users** - 7-step user creation wizard, scope editor,
  approval chain builder, audit log search
- **Scheduling** - drag-drop on desktop, tap-to-select on mobile,
  conflict detection, geo-aware routing
- **Documents & compliance** - auto-generated per-project folder
  structure, SIRA renewal calendar, expiry tracking
- **Costing & profitability** - per-WO and per-project margin

---

## Phase 7 - Mobile field workflow (1 week)

The technician's mobile flow is the most-used screen in the system.
Build it as a dedicated route `/m/wo/:id` optimized for one-handed use,
following the spec in Part 15 of the build prompt:

1. My Day list (all today's WOs)
2. WO detail card with one-tap Navigate / Accept / Check-in
3. Check-in with geo-stamp + photo
4. Work checklist (toggle tasks, photos, scan asset barcode, voice note)
5. Service report (auto-populated from checklist)
6. Customer signature pad (SignaturePad.js)
7. Close → WO Closed, next WO surfaces

All steps work offline, sync on reconnect.

---

## Phase 8 - Integrations (sprint cycles)

- WhatsApp Business API (Meta) - customer notifications
- Resend or SendGrid - email
- Twilio - SMS fallback
- Tally / Zoho Books - invoice sync (Phase 3+)
- SIRA portal - compliance status (Phase 3+)
- Mapbox - geo + routing

---

## Definition of done per module

Copied from Part 21 of the build prompt:

- RLS policies (scope-aware) written, tested, reviewed
- Database migration committed and applied to staging
- Frontend works on 360 px phone for every role
- Tablet and desktop layouts verified
- Offline behavior tested
- Realtime updates verified
- Audit log entries confirmed
- Notifications fire correctly
- SLA tracking integrated
- Escalation triggers tested
- Approval workflow tested with dynamic approver resolution
- Admin can create users, assign roles, configure approval chains
- Login as different roles renders correct dashboards
- Edge cases tested
- Seed data realistic

---

## Quick wins (do these in week 1 of Antigravity)

1. Migrate to Vite (Phase 0) - 1 day
2. Wire React Router so deep links work - 0.5 day
3. Provision Supabase + schema + seed data - 1 day
4. Wire real auth + replace role switcher with real session - 1 day
5. Convert one module (Customers is easiest) to live data - 1 day

After that you have a real production-shaped app with mock data in the
edges, and you can pull modules onto Supabase one at a time without ever
breaking the user-facing flow.

````

---

## `package.json`

```json
{
  "name": "installtec-os",
  "version": "0.1.0",
  "private": true,
  "description": "Installtec OS - unified CRM + FSM + Operations prototype (CDN-loaded React + Babel)",
  "type": "module",
  "scripts": {
    "dev": "serve . -l 5173",
    "start": "serve . -l 5173"
  },
  "devDependencies": {
    "serve": "^14.2.4"
  },
  "engines": {
    "node": ">=18"
  },
  "comment": "Runtime React, ReactDOM, and Babel are loaded from CDN - see <script> tags in index.html. The package.json only declares the static dev server. See NEXT_STEPS.md for the Vite migration that turns these into real npm dependencies."
}
```

---

## `index.html`

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Installtec OS - CRM & Operations</title>

  <link rel="preconnect" href="https://fonts.googleapis.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="preconnect" href="https://api.fontshare.com" crossorigin>
  <link href="https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap" rel="stylesheet">

  <link rel="stylesheet" href="tokens.css">
</head>
<body>
  <div id="root"></div>

  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>

  <!-- Foundations -->
  <script type="text/babel" src="data.jsx"></script>
  <script type="text/babel" src="icons.jsx"></script>
  <script type="text/babel" src="components.jsx"></script>
  <script type="text/babel" src="shell.jsx"></script>

  <!-- Modules (order doesn't matter as they each export to window) -->
  <script type="text/babel" src="modules/dashboard.jsx"></script>
  <script type="text/babel" src="modules/workorders.jsx"></script>
  <script type="text/babel" src="modules/amc.jsx"></script>
  <script type="text/babel" src="modules/approvals.jsx"></script>
  <script type="text/babel" src="modules/customers.jsx"></script>
  <script type="text/babel" src="modules/misc.jsx"></script>

  <!-- Root -->
  <script type="text/babel" src="app.jsx"></script>
</body>
</html>
```

---

Say **"next"** for Part 2 (`tokens.css` + `icons.jsx` + `data.jsx`).

## User

next

## Assistant

_[tool: read_file]_

I need to re-read the exact current state of each file before dumping it (especially `tokens.css` after the mobile-utility fix).# Part 2 of 6 - `tokens.css`, `icons.jsx`, `data.jsx`

## `tokens.css`

```css
/* ============================================================
   Installtec OS - Design Tokens
   Soft pastel enterprise · slate ink · mint primary · violet/peach accents
   ============================================================ */

:root {
  /* ---- Surfaces ---- */
  --bg:            #F8FAFC;   /* app background */
  --bg-elev:       #FFFFFF;   /* cards */
  --bg-muted:      #F1F5F9;   /* sunken, hover */
  --bg-deep:       #E2E8F0;   /* dividers, deeper sunk */
  --bg-translucent: rgba(255, 255, 255, 0.7);

  /* ---- Ink ---- */
  --ink:           #1E293B;   /* primary text */
  --ink-soft:      #475569;   /* secondary text */
  --ink-mute:      #64748B;   /* tertiary */
  --ink-quiet:     #94A3B8;   /* placeholder, caption */

  /* ---- Borders ---- */
  --border:        #E2E8F0;
  --border-strong: #CBD5E1;
  --divider:       #F1F5F9;

  /* ---- Primary (mint/teal) ---- */
  --pri-50:  #ECF7F4;
  --pri-100: #D7EFE9;
  --pri-200: #B0DED3;
  --pri-300: #82C6B6;
  --pri-400: #5BAE9C;
  --pri-500: #5BAE9C;
  --pri-600: #4A917F;
  --pri-700: #3A7363;
  --pri-900: #1F4439;

  /* ---- Secondary (violet) ---- */
  --sec-50:  #F3EFFE;
  --sec-100: #EBE3FD;
  --sec-200: #D5C5FB;
  --sec-400: #A78BFA;
  --sec-500: #A78BFA;
  --sec-600: #8B6FE5;
  --sec-700: #6A52BF;

  /* ---- Accent (peach) ---- */
  --acc-50:  #FDF1EC;
  --acc-100: #FBE2D7;
  --acc-200: #F8C9B5;
  --acc-400: #F4B8A4;
  --acc-500: #F4B8A4;
  --acc-600: #D88E76;
  --acc-700: #A5664F;

  /* ---- Status ---- */
  --suc-50:  #ECFDF5;
  --suc-100: #D1FAE5;
  --suc-500: #10B981;
  --suc-600: #059669;
  --suc-700: #047857;

  --warn-50:  #FEF7E6;
  --warn-100: #FDECC8;
  --warn-500: #E4A93A;
  --warn-600: #B8851F;
  --warn-700: #7A5A14;

  --dan-50:  #FEF1F2;
  --dan-100: #FDDDE0;
  --dan-500: #E0625B;
  --dan-600: #BD4843;
  --dan-700: #8C3431;

  --info-50:  #ECF4FE;
  --info-100: #D5E6FC;
  --info-500: #5B8FE8;
  --info-600: #3F6FBF;
  --info-700: #2C507A;

  /* ---- Radius ---- */
  --r-xs:    8px;
  --r-sm:    10px;
  --r-md:    14px;
  --r-lg:    18px;
  --r-xl:    24px;
  --r-pill:  999px;

  /* ---- Shadows (soft / glassy) ---- */
  --shadow-xs:  0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-sm:  0 1px 3px rgba(15, 23, 42, 0.05), 0 1px 2px rgba(15, 23, 42, 0.03);
  --shadow-md:  0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.04);
  --shadow-lg:  0 18px 40px -16px rgba(15, 23, 42, 0.18), 0 6px 14px -6px rgba(15, 23, 42, 0.06);
  --shadow-xl:  0 30px 60px -25px rgba(15, 23, 42, 0.30), 0 10px 24px -8px rgba(15, 23, 42, 0.10);
  --shadow-glow: 0 0 0 4px color-mix(in srgb, var(--pri-500) 18%, transparent);

  /* ---- Spacing ---- */
  --s-1: 4px;  --s-2: 8px;  --s-3: 12px; --s-4: 16px;
  --s-5: 20px; --s-6: 24px; --s-7: 32px; --s-8: 40px;
  --s-9: 56px; --s-10: 72px;

  /* ---- Type ---- */
  --font-sans: 'Inter', 'General Sans', system-ui, -apple-system, sans-serif;
  --font-display: 'General Sans', 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;

  --t-display: 600 40px/1.05 var(--font-display);
  --t-h1:      600 28px/1.15 var(--font-display);
  --t-h2:      600 20px/1.2  var(--font-display);
  --t-h3:      600 16px/1.3  var(--font-display);
  --t-h4:      600 14px/1.35 var(--font-display);
  --t-body:    400 14px/1.5  var(--font-sans);
  --t-body-md: 500 14px/1.45 var(--font-sans);
  --t-small:   500 13px/1.4  var(--font-sans);
  --t-micro:   500 11px/1.3  var(--font-sans);

  letter-spacing: -0.005em;
}

/* ============================================================
   Reset & base
   ============================================================ */
*, *::before, *::after { box-sizing: border-box; }

html, body, #root { height: 100%; }
body {
  margin: 0;
  font: var(--t-body);
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button { font-family: inherit; cursor: pointer; }
input, textarea, select { font-family: inherit; color: inherit; }
a { color: inherit; text-decoration: none; }

::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--bg-deep);
  border-radius: 5px;
  border: 2px solid var(--bg);
}
::-webkit-scrollbar-thumb:hover { background: var(--ink-quiet); }

/* ============================================================
   Layout helpers
   ============================================================ */
.row { display: flex; align-items: center; gap: var(--s-3); }
.col { display: flex; flex-direction: column; gap: var(--s-3); }
.between { justify-content: space-between; }
.grow { flex: 1; min-width: 0; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.numeric { font-variant-numeric: tabular-nums; }
.gap-1 { gap: var(--s-1); } .gap-2 { gap: var(--s-2); }
.gap-3 { gap: var(--s-3); } .gap-4 { gap: var(--s-4); }
.gap-5 { gap: var(--s-5); } .gap-6 { gap: var(--s-6); }
.mt-2 { margin-top: var(--s-2); } .mt-3 { margin-top: var(--s-3); }
.mt-4 { margin-top: var(--s-4); } .mt-6 { margin-top: var(--s-6); }
.hide-mobile { display: initial !important; }
.show-mobile { display: none !important; }

/* ============================================================
   Lucide icon defaults
   ============================================================ */
.lucide {
  width: 18px; height: 18px;
  stroke: currentColor; stroke-width: 1.5;
  fill: none;
  stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
}
.lucide-sm { width: 14px; height: 14px; }
.lucide-lg { width: 22px; height: 22px; }
.lucide-xl { width: 28px; height: 28px; }

/* ============================================================
   Primitives
   ============================================================ */

/* CARD */
.card {
  background: var(--bg-elev);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-xs);
}
.card-pad { padding: var(--s-5); }
.card-pad-lg { padding: var(--s-6); }
.card-hover { transition: all .14s ease; cursor: pointer; }
.card-hover:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); border-color: var(--border-strong); }
.card-accent {
  background: linear-gradient(150deg, var(--pri-50), var(--bg-elev) 70%);
  border-color: color-mix(in srgb, var(--pri-500) 22%, transparent);
}
.card-violet {
  background: linear-gradient(150deg, var(--sec-50), var(--bg-elev) 70%);
  border-color: color-mix(in srgb, var(--sec-500) 22%, transparent);
}
.card-peach {
  background: linear-gradient(150deg, var(--acc-50), var(--bg-elev) 70%);
  border-color: color-mix(in srgb, var(--acc-500) 25%, transparent);
}

/* BUTTON */
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 16px;
  border-radius: var(--r-pill);
  border: 1px solid transparent;
  font: var(--t-body-md);
  white-space: nowrap;
  transition: all .14s ease;
  user-select: none;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary {
  background: var(--pri-500); color: #fff;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--pri-500) 30%, transparent);
}
.btn-primary:hover:not(:disabled) { background: var(--pri-600); transform: translateY(-1px); }
.btn-ghost {
  background: transparent; color: var(--ink-soft);
  border-color: var(--border);
}
.btn-ghost:hover:not(:disabled) { background: var(--bg-muted); color: var(--ink); }
.btn-soft {
  background: var(--bg-muted); color: var(--ink);
}
.btn-soft:hover:not(:disabled) { background: var(--bg-deep); }
.btn-danger {
  background: var(--dan-50); color: var(--dan-700); border-color: var(--dan-100);
}
.btn-danger:hover:not(:disabled) { background: var(--dan-100); }
.btn-lg { height: 46px; padding: 0 22px; font-size: 15px; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 13px; }
.btn-icon { width: 38px; padding: 0; justify-content: center; }
.btn-icon.btn-sm { width: 30px; }
.btn-block { width: 100%; justify-content: center; }

/* INPUT */
.input {
  height: 40px; padding: 0 14px; width: 100%;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg-elev);
  font: var(--t-body); color: var(--ink);
  outline: none;
  transition: border-color .14s, box-shadow .14s;
}
.input:focus { border-color: var(--pri-500); box-shadow: var(--shadow-glow); }
.input::placeholder { color: var(--ink-quiet); }
.input-sm { height: 34px; padding: 0 12px; font-size: 13px; }
.input-search-wrap { position: relative; }
.input-search-wrap .lucide {
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  color: var(--ink-quiet); pointer-events: none;
}
.input-search-wrap .input { padding-left: 40px; }

.textarea {
  min-height: 80px; padding: 12px 14px; width: 100%;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: var(--bg-elev);
  font: var(--t-body); color: var(--ink);
  outline: none; resize: vertical;
  transition: border-color .14s, box-shadow .14s;
}
.textarea:focus { border-color: var(--pri-500); box-shadow: var(--shadow-glow); }

/* BADGE */
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  height: 22px; padding: 0 9px;
  border-radius: var(--r-pill);
  font: var(--t-micro);
  letter-spacing: 0.01em;
  background: var(--bg-muted);
  color: var(--ink-soft);
}
.badge-primary { background: var(--pri-100); color: var(--pri-700); }
.badge-violet  { background: var(--sec-100); color: var(--sec-700); }
.badge-peach   { background: var(--acc-100); color: var(--acc-700); }
.badge-success { background: var(--suc-100); color: var(--suc-700); }
.badge-warning { background: var(--warn-100); color: var(--warn-700); }
.badge-danger  { background: var(--dan-100); color: var(--dan-700); }
.badge-info    { background: var(--info-100); color: var(--info-700); }
.badge-outline { background: transparent; border: 1px solid var(--border); color: var(--ink-soft); }
.badge-lg { height: 26px; padding: 0 12px; font-size: 12px; }

/* DOT (status indicator) */
.dot {
  width: 7px; height: 7px; border-radius: 50%;
  display: inline-block;
  background: var(--ink-quiet);
  flex-shrink: 0;
}
.dot-success { background: var(--suc-500); }
.dot-warning { background: var(--warn-500); }
.dot-danger  { background: var(--dan-500); }
.dot-info    { background: var(--info-500); }
.dot-primary { background: var(--pri-500); }
.dot-pulse { position: relative; }
.dot-pulse::after {
  content: ''; position: absolute; inset: -3px;
  border-radius: 50%; background: inherit; opacity: 0.4;
  animation: pulse 1.6s ease-out infinite;
}
@keyframes pulse {
  0%   { transform: scale(0.8); opacity: 0.5; }
  100% { transform: scale(2.6); opacity: 0; }
}

/* AVATAR */
.avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: var(--pri-100); color: var(--pri-700);
  display: inline-flex; align-items: center; justify-content: center;
  font: 600 11px/1 var(--font-sans);
  letter-spacing: 0.02em;
  flex-shrink: 0;
  border: 2px solid var(--bg-elev);
}
.avatar-sm { width: 24px; height: 24px; font-size: 10px; }
.avatar-md { width: 36px; height: 36px; font-size: 13px; }
.avatar-lg { width: 44px; height: 44px; font-size: 15px; }
.avatar-violet { background: var(--sec-100); color: var(--sec-700); }
.avatar-peach  { background: var(--acc-100); color: var(--acc-700); }
.avatar-warm   { background: var(--warn-100); color: var(--warn-700); }
.avatar-info   { background: var(--info-100); color: var(--info-700); }
.avatar-stack { display: inline-flex; }
.avatar-stack > .avatar + .avatar { margin-left: -10px; }

/* SEGMENTED */
.seg {
  display: inline-flex;
  background: var(--bg-muted);
  border-radius: var(--r-pill);
  padding: 3px;
  gap: 2px;
}
.seg button {
  height: 30px; padding: 0 14px;
  border: none; background: transparent;
  border-radius: var(--r-pill);
  font: var(--t-small); color: var(--ink-soft);
  transition: all .14s;
  display: inline-flex; align-items: center; gap: 6px;
}
.seg button[data-on="true"] {
  background: var(--bg-elev); color: var(--ink);
  box-shadow: var(--shadow-xs);
}
.seg-block { width: 100%; }
.seg-block button { flex: 1; justify-content: center; }

/* KPI tile */
.kpi {
  background: var(--bg-elev);
  border-radius: var(--r-lg);
  border: 1px solid var(--border);
  padding: 18px;
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.kpi-label {
  font: var(--t-micro);
  color: var(--ink-mute);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.kpi-value {
  font: 600 26px/1.05 var(--font-display);
  color: var(--ink);
  letter-spacing: -0.02em;
}
.kpi-sub { font: var(--t-small); color: var(--ink-mute); }
.kpi-trend-up { color: var(--suc-600); }
.kpi-trend-down { color: var(--dan-600); }

/* PROGRESS BAR */
.progress {
  height: 6px; border-radius: 3px;
  background: var(--bg-muted);
  overflow: hidden;
}
.progress > div {
  height: 100%; border-radius: 3px;
  background: var(--pri-500);
  transition: width .3s ease;
}
.progress-success > div { background: var(--suc-500); }
.progress-warning > div { background: var(--warn-500); }
.progress-danger > div  { background: var(--dan-500); }
.progress-thin { height: 4px; }

/* CHIP / TAG */
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  height: 30px; padding: 0 12px;
  border-radius: var(--r-pill);
  border: 1px solid var(--border);
  background: var(--bg-elev);
  font: var(--t-small); color: var(--ink-soft);
  cursor: pointer;
  transition: all .14s;
}
.chip:hover { background: var(--bg-muted); border-color: var(--border-strong); }
.chip[data-on="true"] {
  background: var(--ink); color: #fff; border-color: var(--ink);
}

/* DIVIDER */
hr.divider {
  border: none; height: 1px;
  background: var(--divider);
  margin: var(--s-4) 0;
}

/* TABLE */
.table {
  width: 100%; border-collapse: separate; border-spacing: 0;
  font: var(--t-body);
}
.table thead th {
  text-align: left;
  font: var(--t-micro);
  color: var(--ink-mute);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 10px 16px;
  border-bottom: 1px solid var(--divider);
  background: transparent;
  position: sticky; top: 0; z-index: 1;
}
.table tbody td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider);
  color: var(--ink);
}
.table tbody tr { transition: background .14s; }
.table tbody tr:hover { background: var(--bg-muted); cursor: pointer; }
.table tbody tr.active { background: var(--pri-50); }
.table tbody tr:last-child td { border-bottom: none; }

/* SHELL */
.app {
  display: grid;
  grid-template-columns: 240px 1fr;
  grid-template-rows: 60px 1fr;
  grid-template-areas:
    "side  top"
    "side  main";
  height: 100vh;
  width: 100vw;
}
.app.collapsed { grid-template-columns: 70px 1fr; }
.app-side { grid-area: side; }
.app-top  { grid-area: top; }
.app-main { grid-area: main; overflow: auto; }

/* SIDEBAR */
.side {
  background: var(--bg);
  border-right: 1px solid var(--border);
  padding: 18px 12px 12px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.side-brand {
  display: flex; align-items: center; gap: 10px;
  padding: 0 8px 18px;
  border-bottom: 1px solid var(--divider);
  margin-bottom: 14px;
}
.side-brand-logo {
  width: 34px; height: 34px; border-radius: 10px;
  background: linear-gradient(135deg, var(--pri-500), var(--pri-700));
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--pri-700) 25%, transparent);
}
.side-brand-text { min-width: 0; overflow: hidden; }
.side-brand-text .title { font: 600 15px/1.1 var(--font-display); color: var(--ink); letter-spacing: -0.01em; }
.side-brand-text .sub { font: var(--t-micro); color: var(--ink-mute); margin-top: 2px; }

.side-group {
  font: var(--t-micro); color: var(--ink-quiet);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: 14px 12px 6px;
}
.side-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; }
.side-scroll::-webkit-scrollbar { width: 0; }

.side-item {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 12px;
  border-radius: var(--r-md);
  font: var(--t-body-md);
  color: var(--ink-soft);
  cursor: pointer;
  transition: all .14s;
  min-height: 38px;
  position: relative;
}
.side-item:hover { background: var(--bg-muted); color: var(--ink); }
.side-item.active {
  background: var(--bg-elev);
  color: var(--ink);
  box-shadow: var(--shadow-xs);
}
.side-item.active::before {
  content: ''; position: absolute; left: -12px; top: 50%; transform: translateY(-50%);
  width: 3px; height: 22px; border-radius: 0 3px 3px 0;
  background: var(--pri-500);
}
.side-item.active .lucide { color: var(--pri-600); }
.side-item .label { flex: 1; min-width: 0; }
.side-item .badge-count {
  background: var(--bg-muted);
  color: var(--ink-soft);
  font: 600 11px/1 var(--font-sans);
  height: 18px; min-width: 18px; padding: 0 6px;
  border-radius: 9px;
  display: inline-flex; align-items: center; justify-content: center;
}
.side-item.active .badge-count {
  background: var(--pri-500); color: #fff;
}

.collapsed .side { padding: 18px 8px 12px; }
.collapsed .side-brand { padding: 0 0 18px; justify-content: center; }
.collapsed .side-brand-text,
.collapsed .side-item .label,
.collapsed .side-item .badge-count,
.collapsed .side-group { display: none; }
.collapsed .side-item { justify-content: center; padding: 10px; }
.collapsed .side-item.active::before { left: -8px; }

.side-foot {
  padding: 14px 8px 0;
  border-top: 1px solid var(--divider);
  margin-top: 8px;
}
.side-user {
  display: flex; align-items: center; gap: 10px;
  padding: 8px; border-radius: var(--r-md);
  background: var(--bg-elev);
  border: 1px solid var(--divider);
  cursor: pointer;
  transition: all .14s;
}
.side-user:hover { box-shadow: var(--shadow-sm); }
.side-user-info { min-width: 0; flex: 1; }
.side-user-info .name { font: var(--t-small); font-weight: 600; color: var(--ink); }
.side-user-info .role { font: var(--t-micro); color: var(--ink-mute); }
.collapsed .side-user-info,
.collapsed .side-foot .lucide:last-child { display: none; }
.collapsed .side-user { justify-content: center; padding: 4px; border: none; background: transparent; }

/* TOP BAR */
.topbar {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex; align-items: center;
  gap: 12px; padding: 0 24px;
  position: sticky; top: 0; z-index: 10;
}
.topbar-bread {
  display: flex; align-items: center; gap: 6px;
  font: var(--t-small); color: var(--ink-mute);
}
.topbar-bread .crumb { color: var(--ink-mute); }
.topbar-bread .crumb.active { color: var(--ink); font-weight: 600; }
.topbar-bread .sep { color: var(--ink-quiet); }
.topbar-cmd {
  flex: 1; max-width: 480px; margin: 0 auto 0 16px;
}
.topbar-cmd .input {
  background: var(--bg-elev);
  height: 36px;
  border-color: var(--border);
}
.topbar-cmd .kbd {
  position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
  display: inline-flex; gap: 3px;
  pointer-events: none;
}
.topbar-cmd .kbd span {
  font: 500 11px/1 var(--font-sans);
  color: var(--ink-quiet);
  background: var(--bg-muted);
  padding: 3px 5px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* MAIN */
.main-pad { padding: 24px 32px 40px; }
.page-head {
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.page-eyebrow {
  font: var(--t-micro);
  color: var(--ink-mute);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 600;
}
.page-title { font: var(--t-h1); margin: 6px 0 2px; letter-spacing: -0.02em; }
.page-sub { font: var(--t-body); color: var(--ink-mute); margin: 0; }

/* SLIDE OVER (right drawer) */
.slideover-back {
  position: fixed; inset: 0; z-index: 60;
  background: rgba(15, 23, 42, 0.32);
  backdrop-filter: blur(4px);
  animation: fadeIn .16s ease;
}
.slideover {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: 560px; max-width: 100vw;
  background: var(--bg);
  z-index: 70;
  box-shadow: var(--shadow-xl);
  display: flex; flex-direction: column;
  animation: slideInRight .22s cubic-bezier(.2,.7,.3,1);
}
.slideover-head {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--divider);
}
.slideover-body { flex: 1; overflow-y: auto; padding: 20px; }
.slideover-foot {
  display: flex; gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--divider);
  background: var(--bg-elev);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
@keyframes slideInUp    { from { transform: translateY(100%); } to { transform: translateY(0); } }

/* MODAL (centered) */
.modal-back {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: fadeIn .16s ease;
}
.modal {
  background: var(--bg-elev);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-xl);
  max-width: 520px; width: 100%;
  max-height: 90vh; overflow: auto;
  animation: scaleIn .18s ease;
}
.modal-lg { max-width: 720px; }
@keyframes scaleIn { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }

/* COMMAND PALETTE */
.cmdk-back {
  position: fixed; inset: 0; z-index: 90;
  background: rgba(15, 23, 42, 0.36);
  backdrop-filter: blur(6px);
  display: flex; justify-content: center;
  padding-top: 14vh;
  animation: fadeIn .14s ease;
}
.cmdk {
  background: var(--bg-elev);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  width: 560px; max-width: calc(100vw - 32px);
  max-height: 60vh;
  display: flex; flex-direction: column;
  border: 1px solid var(--border);
  overflow: hidden;
  animation: scaleIn .14s ease;
}
.cmdk-input {
  border: none; padding: 14px 18px;
  font: var(--t-h3); color: var(--ink);
  font-weight: 400;
  background: transparent;
  border-bottom: 1px solid var(--divider);
  outline: none;
}
.cmdk-list { overflow-y: auto; padding: 6px; }
.cmdk-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  cursor: pointer; font: var(--t-body);
}
.cmdk-item:hover, .cmdk-item.active { background: var(--bg-muted); }
.cmdk-item .meta { color: var(--ink-quiet); font: var(--t-micro); margin-left: auto; }
.cmdk-group {
  font: var(--t-micro); color: var(--ink-quiet);
  text-transform: uppercase; letter-spacing: 0.08em;
  padding: 10px 14px 6px;
}

/* NOTIFICATION DRAWER */
.notif {
  position: fixed; top: 60px; right: 16px;
  width: 380px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 80px);
  background: var(--bg-elev);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border);
  display: flex; flex-direction: column;
  z-index: 50;
  animation: scaleIn .14s ease;
}
.notif-head {
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider);
  display: flex; align-items: center; justify-content: space-between;
}
.notif-list { overflow-y: auto; padding: 6px; }
.notif-item {
  display: flex; gap: 10px;
  padding: 10px 12px;
  border-radius: var(--r-sm);
  cursor: pointer;
}
.notif-item:hover { background: var(--bg-muted); }
.notif-item.unread { background: var(--pri-50); }
.notif-item.unread:hover { background: var(--pri-100); }

/* MOBILE BOTTOM NAV */
.bnav {
  display: none;
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
  background: var(--bg-elev);
  border-top: 1px solid var(--border);
  padding: 4px 4px 10px;
  grid-template-columns: repeat(5, 1fr);
  box-shadow: 0 -4px 16px rgba(15,23,42,0.06);
}
.bnav button {
  background: none; border: none;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 3px; padding: 8px 4px;
  font: var(--t-micro); color: var(--ink-quiet);
}
.bnav button[data-on="true"] { color: var(--pri-700); }
.bnav button[data-on="true"] .lucide { color: var(--pri-600); }
.bnav .fab {
  width: 50px; height: 50px; border-radius: 50%;
  background: var(--pri-500); color: #fff !important;
  margin-top: -18px;
  box-shadow: 0 6px 16px color-mix(in srgb, var(--pri-500) 35%, transparent);
}
.bnav .fab .lucide { color: #fff !important; }

/* ============================================================
   Responsive
   ============================================================ */
@media (max-width: 1024px) {
  .app { grid-template-columns: 70px 1fr; }
  .side-brand-text,
  .side-item .label,
  .side-item .badge-count,
  .side-group { display: none; }
  .side-item { justify-content: center; padding: 10px; }
  .side-item.active::before { left: -8px; }
  .side { padding: 18px 8px 12px; }
  .side-foot { padding: 14px 0 0; }
  .side-user-info { display: none; }
  .side-user { justify-content: center; padding: 4px; border: none; background: transparent; }
}

@media (max-width: 720px) {
  .app {
    grid-template-columns: 1fr;
    grid-template-rows: 56px 1fr;
    grid-template-areas: "top" "main";
  }
  .app-side { display: none; }
  .bnav { display: grid; }
  .app-main { padding-bottom: 80px; }
  .main-pad { padding: 16px 16px 24px; }
  .topbar { padding: 0 16px; }
  .topbar-cmd { display: none; }
  .topbar-bread { display: none; }
  .page-head { flex-direction: column; align-items: stretch; }
  .hide-mobile { display: none !important; }
  .show-mobile { display: initial !important; }
  .slideover { width: 100vw; }

  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  .table tr {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 12px;
    margin-bottom: 8px;
  }
  .table td {
    padding: 4px 0; border: none;
  }
  .table td::before {
    content: attr(data-th);
    font: var(--t-micro); color: var(--ink-mute);
    text-transform: uppercase; letter-spacing: 0.06em;
    display: block; margin-bottom: 2px;
  }
}
```

---

## `icons.jsx`

```jsx
// Lucide-style icon set - single React component, picks by name.
// Pass any extra props (className, style) to override default sizing/stroke.

const ICON_PATHS = {
  // - Operations / nav
  dashboard:    'M3 12V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v7M3 12v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-7M3 12h8M13 8V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M13 8v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8M13 8h8',
  feed:         'M3 5h18M3 12h18M3 19h12',
  calendar:     'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4',
  briefcase:    'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18',
  wrench:       'M14.7 6.3a4 4 0 1 0-5.4 5.4l-6 6a2 2 0 0 0 2.8 2.8l6-6a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.3-2.3z',
  shield:       'M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3z',
  shieldCheck:  'M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5zM9 12l2 2 4-4',
  users:        'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  user:         'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  cog:          'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bell:         'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  search:       'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  package:      'M16.5 9.4 7.5 4.21M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12',
  truck:        'M5 17h14M3 17V7a2 2 0 0 1 2-2h9v12M14 8h4l3 4v5h-7M7 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  fileText:     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  receipt:      'M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2zM8 9h8M8 13h6',
  chartBar:     'M3 3v18h18M7 16V8M12 16V4M17 16v-6',
  chartLine:    'M3 3v18h18M7 14l4-4 4 4 5-7',
  pieChart:     'M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10z',
  inbox:        'M22 12h-6l-2 3h-4l-2-3H2M5 3h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
  messageCircle:'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z',

  // - Workflow / status
  check:        'M20 6 9 17l-5-5',
  checkCircle:  'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  clock:        'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  alertCircle:  'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01',
  alertTriangle:'M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  zap:          'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  flame:        'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14.46-4 2-4-.5 1-.5 2 0 3 1 2 3 2 3 5a5 5 0 0 1-10 0c0-.5 0-1.5.5-2',
  pause:        'M6 4h4v16H6zM14 4h4v16h-4z',
  play:         'M5 3l14 9-14 9z',
  loader:       'M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83',

  // - Actions
  plus:         'M12 5v14M5 12h14',
  minus:        'M5 12h14',
  x:            'M18 6 6 18M6 6l12 12',
  filter:       'M22 3H2l8 9.46V19l4 2v-8.54z',
  arrowRight:   'M5 12h14M13 5l7 7-7 7',
  arrowLeft:    'M19 12H5M12 19l-7-7 7-7',
  arrowUp:      'M12 19V5M5 12l7-7 7 7',
  arrowDown:    'M12 5v14M19 12l-7 7-7-7',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft:  'M15 18l-6-6 6-6',
  chevronDown:  'M6 9l6 6 6-6',
  chevronUp:    'M18 15l-6-6-6 6',
  ellipsis:     'M5 12h.01M12 12h.01M19 12h.01',
  externalLink: 'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5',

  // - Field / mobile
  mapPin:       'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  navigation:   'M3 11l19-9-9 19-2-8-8-2z',
  camera:       'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  scan:         'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10',
  mic:          'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  phone:        'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7a2 2 0 0 1 1.72 2.03z',
  mail:         'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 7l-10 6L2 7',
  pen:          'M17 3a2.85 2.85 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  paperclip:    'M21.4 11.05 12.25 20.2a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.38A2 2 0 1 1 6.58 14.55l8.49-8.49',

  // - Domain-specific
  hardHat:      'M2 18h20M4 18a8 8 0 0 1 16 0M12 4a4 4 0 0 0-4 4v2h8V8a4 4 0 0 0-4-4z',
  camera2:      'M3 7h4l2-3h6l2 3h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z',
  cable:        'M4 9a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h2M4 13v8M22 15a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2h-2M22 11V3M9 9V3h6v6M9 9h6M9 9c-4 0-4 6 0 6h6c4 0 4-6 0-6',
  signature:    'M3 17.5C5 18 8 18 10 16s2.5-7 5-7c1.5 0 2 2 1.5 4-1 4 .5 4 2 4 2 0 3.5-.5 4.5-1.5M2 20h20',
  building:     'M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01',
  banknote:     'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  trendingUp:   'M22 7 13.5 15.5l-5-5L2 17M16 7h6v6',
  trendingDown: 'M22 17 13.5 8.5l-5 5L2 7M16 17h6v-6',
  layers:       'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  list:         'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  grid:         'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  refresh:      'M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8M3 21v-5h5M21 3v5h-5',
  star:         'M12 2 15.09 8.26 22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z',
  thumbsUp:     'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z',
  warehouse:    'M22 12V8a2 2 0 0 0-1.2-1.83l-8-3.6a2 2 0 0 0-1.6 0l-8 3.6A2 2 0 0 0 2 8v4M22 12v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8M6 14v8M6 14h12M18 14v8',
  flag:         'M4 22V4M4 4s1-1 4-1 5 2 8 2 4-1 4-1v12s-1 1-4 1-5-2-8-2-4 1-4 1',
  cloudOff:     'M22 17a5 5 0 0 0-5-5h-1.26a8 8 0 0 0-7.05-3M19 16.95A6 6 0 0 1 13 22H7a5 5 0 0 1-2-9.66M1 1l22 22',
};

function Icon({ name, size, className, style, strokeWidth }) {
  const d = ICON_PATHS[name];
  if (!d) {
    return (
      <svg width={size || 18} height={size || 18} viewBox="0 0 24 24"
        className={"lucide " + (className || '')}
        style={style} stroke="currentColor" fill="none" strokeWidth={strokeWidth || 1.5}
        strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
      </svg>
    );
  }
  return (
    <svg width={size || undefined} height={size || undefined} viewBox="0 0 24 24"
      className={"lucide " + (className || '')}
      style={size ? { width: size, height: size, ...(style || {}) } : style}
      stroke="currentColor" fill="none"
      strokeWidth={strokeWidth || 1.5}
      strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').slice(1).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

window.Icon = Icon;
```

---

## `data.jsx`

```jsx
// ============================================================
// Installtec OS - Relational mock data
// One source of truth shared across all modules.
// ============================================================

// ── USERS ───────────────────────────────────────────────────
const USERS = {
  u_rashid:  { id: 'u_rashid',  name: 'Rashid Al-Hashimi',  role: 'manager',         email: 'rashid@installtec.ae',  phone: '+971 50 482 1108', initials: 'RH', tint: 'primary', mgr: 'u_amir',     team: null,         skills: [], region: 'UAE' },
  u_amir:    { id: 'u_amir',    name: 'Amir Hadid',         role: 'md',              email: 'amir@installtec.ae',    phone: '+971 50 110 4221', initials: 'AH', tint: 'violet',  mgr: null,         team: null,         skills: [], region: 'UAE' },
  u_admin:   { id: 'u_admin',   name: 'Ops Admin',          role: 'admin',           email: 'admin@installtec.ae',   phone: '+971 50 999 0000', initials: 'OA', tint: 'peach',   mgr: null,         team: null,         skills: [], region: 'UAE' },
  u_arvind:  { id: 'u_arvind',  name: 'Arvind Krishnan',    role: 'lead_worker',     email: 'arvind@installtec.ae',  phone: '+971 55 220 3344', initials: 'AK', tint: 'primary', mgr: 'u_rashid',   team: 't_alpha',    skills: ['CCTV','ACS','SCS'], region: 'UAE' },
  u_bilal:   { id: 'u_bilal',   name: 'Bilal Sayed',        role: 'worker',          email: 'bilal@installtec.ae',   phone: '+971 56 880 1212', initials: 'BS', tint: 'warm',    mgr: 'u_arvind',   team: 't_alpha',    skills: ['CCTV','Fiber'],     region: 'UAE' },
  u_joseph:  { id: 'u_joseph',  name: 'Joseph Mathew',      role: 'worker',          email: 'joseph@installtec.ae',  phone: '+971 54 330 7788', initials: 'JM', tint: 'info',    mgr: 'u_arvind',   team: 't_alpha',    skills: ['ACS','Fiber'],      region: 'UAE' },
  u_karthik: { id: 'u_karthik', name: 'Karthik Iyer',       role: 'driver',          email: 'karthik@installtec.ae', phone: '+971 50 412 8800', initials: 'KI', tint: 'warm',    mgr: 'u_rashid',   team: null,         skills: ['Driving'],          region: 'UAE' },
  u_saif:    { id: 'u_saif',    name: 'Saif Ibrahim',       role: 'subcontractor',   email: 'saif@gmail.com',        phone: '+971 56 110 2233', initials: 'SI', tint: 'peach',   mgr: 'u_arvind',   team: null,         skills: ['Cable Pulling'],    region: 'UAE' },
  u_pooja:   { id: 'u_pooja',   name: 'Pooja Menon',        role: 'service_support', email: 'pooja@installtec.ae',   phone: '+971 50 224 8867', initials: 'PM', tint: 'violet',  mgr: 'u_rashid',   team: null,         skills: [],                   region: 'UAE' },
  u_priya:   { id: 'u_priya',   name: 'Priya Nair',         role: 'accounts',        email: 'priya@installtec.ae',   phone: '+971 50 887 9911', initials: 'PN', tint: 'info',    mgr: 'u_amir',     team: null,         skills: [],                   region: 'UAE' },
  u_noor:    { id: 'u_noor',    name: 'Noor El-Sayed',      role: 'sales',           email: 'noor@installtec.ae',    phone: '+971 55 999 3322', initials: 'NE', tint: 'peach',   mgr: 'u_rashid',   team: null,         skills: [],                   region: 'UAE' },
  u_sara:    { id: 'u_sara',    name: 'Sara Anand',         role: 'estimator',       email: 'sara@installtec.ae',    phone: '+971 50 220 1144', initials: 'SA', tint: 'primary', mgr: 'u_rashid',   team: null,         skills: [],                   region: 'UAE' },
};

const TEAMS = {
  t_alpha: { id: 't_alpha', name: 'ELV Installation Alpha', lead: 'u_arvind', manager: 'u_rashid', members: ['u_bilal','u_joseph'], skills: ['CCTV','ACS','SCS','Fiber'], region: 'UAE' },
};

// Role label map (UI-friendly)
const ROLE_LABELS = {
  admin: 'Admin',
  md: 'Managing Director',
  manager: 'Operations Manager',
  sales: 'Sales',
  estimator: 'Pre-Sales / Estimator',
  lead_worker: 'Lead Technician',
  worker: 'Technician',
  driver: 'Driver',
  subcontractor: 'Subcontractor',
  service_support: 'Service Support',
  accounts: 'Accounts',
};

// ── CUSTOMERS ───────────────────────────────────────────────
const CUSTOMERS = {
  c_damac:   { id: 'c_damac',   name: 'DAMAC Properties',             tier: 'Strategic',  region: 'UAE', sector: 'Real Estate',    owner: 'u_noor',   since: '2014-03', tags: ['ACS','CCTV','SCS'] },
  c_mag:     { id: 'c_mag',     name: 'MAG Group',                    tier: 'Strategic',  region: 'UAE', sector: 'Real Estate',    owner: 'u_noor',   since: '2017-08', tags: ['CCTV','SCS'] },
  c_azizi:   { id: 'c_azizi',   name: 'Azizi Developments',           tier: 'Key',        region: 'UAE', sector: 'Real Estate',    owner: 'u_noor',   since: '2019-05', tags: ['CCTV','Fiber'] },
  c_manipal: { id: 'c_manipal', name: 'Manipal University Dubai',     tier: 'Key',        region: 'UAE', sector: 'Education',      owner: 'u_noor',   since: '2018-11', tags: ['ACS','CCTV','AV'] },
  c_csh:     { id: 'c_csh',     name: 'Canadian Specialist Hospital', tier: 'Key',        region: 'UAE', sector: 'Healthcare',     owner: 'u_noor',   since: '2016-04', tags: ['CCTV','Nurse Call'] },
  c_nmc:     { id: 'c_nmc',     name: 'NMC Hospital',                 tier: 'Standard',   region: 'UAE', sector: 'Healthcare',     owner: 'u_noor',   since: '2020-02', tags: ['CCTV'] },
  c_burj:    { id: 'c_burj',    name: 'Emaar Mgmt - Burj District',   tier: 'Key',        region: 'UAE', sector: 'Hospitality',    owner: 'u_noor',   since: '2021-09', tags: ['CCTV'] },
  c_difc:    { id: 'c_difc',    name: 'DIFC Authority',               tier: 'Strategic',  region: 'UAE', sector: 'Government',     owner: 'u_noor',   since: '2015-06', tags: ['ACS','Compliance'] },
};

const SITES = {
  s_burj:    { id: 's_burj',    name: 'Burj Vista Tower 2',       customer: 'c_damac',   area: 'Downtown Dubai',     access: 'Rear loading bay · Security desk B' },
  s_mag318:  { id: 's_mag318',  name: 'MAG 318 - Business Bay',   customer: 'c_mag',     area: 'Business Bay',       access: 'Service entrance · Mr. Khan' },
  s_difc:    { id: 's_difc',    name: 'DIFC Gate Avenue West',    customer: 'c_difc',    area: 'DIFC',               access: 'Concierge · Block 4' },
  s_manipal: { id: 's_manipal', name: 'Manipal Campus',           customer: 'c_manipal', area: 'Dubai Academic City',access: 'Maintenance gate 2' },
  s_csh:     { id: 's_csh',     name: 'CSH Deira - Main Block',   customer: 'c_csh',     area: 'Deira',              access: 'Goods lift · Basement B1' },
  s_azizi:   { id: 's_azizi',   name: 'Azizi Riviera Phase 5',    customer: 'c_azizi',   area: 'MBR City',           access: 'Site office trailer' },
  s_nmc:     { id: 's_nmc',     name: 'NMC Deira Branch',         customer: 'c_nmc',     area: 'Deira',              access: 'Reception escort required' },
};

// ── PROJECTS ────────────────────────────────────────────────
const PROJECTS = {
  p_difc4: {
    id: 'p_difc4', code: 'PRJ-2025-014', name: 'DIFC Gate Ave West - ELV Upgrade',
    customer: 'c_difc', site: 's_difc', manager: 'u_rashid', team: 't_alpha',
    status: 'In Progress', stage: 'Installation', progress: 62,
    value: 1840000, startedAt: '2025-02-10', dueAt: '2025-07-30',
    milestones: [
      { id: 'm1', name: 'Mobilisation',     done: true,  pct: 10 },
      { id: 'm2', name: 'Cable pulling',    done: true,  pct: 30 },
      { id: 'm3', name: 'Containment',      done: true,  pct: 50 },
      { id: 'm4', name: 'Device install',   done: false, pct: 75 },
      { id: 'm5', name: 'T&C',              done: false, pct: 95 },
      { id: 'm6', name: 'Handover · As-built', done: false, pct: 100 },
    ],
  },
  p_azizi: {
    id: 'p_azizi', code: 'PRJ-2025-022', name: 'Azizi Riviera Ph.5 - CCTV + Fiber Backbone',
    customer: 'c_azizi', site: 's_azizi', manager: 'u_rashid', team: 't_alpha',
    status: 'In Progress', stage: 'Installation', progress: 38,
    value: 920000, startedAt: '2025-03-22', dueAt: '2025-08-15',
    milestones: [
      { id: 'm1', name: 'Survey',          done: true,  pct: 10 },
      { id: 'm2', name: 'Cable pulling',   done: false, pct: 40 },
      { id: 'm3', name: 'Termination',     done: false, pct: 70 },
      { id: 'm4', name: 'T&C + Handover',  done: false, pct: 100 },
    ],
  },
  p_manipal: {
    id: 'p_manipal', code: 'PRJ-2025-009', name: 'Manipal Campus - Phase 2 ACS Expansion',
    customer: 'c_manipal', site: 's_manipal', manager: 'u_rashid', team: 't_alpha',
    status: 'Awaiting VO Approval', stage: 'Variation', progress: 78,
    value: 540000, startedAt: '2025-01-08', dueAt: '2025-06-12',
    milestones: [
      { id: 'm1', name: 'Mobilisation',  done: true,  pct: 12 },
      { id: 'm2', name: 'Hardware fit',  done: true,  pct: 60 },
      { id: 'm3', name: 'VO scope add',  done: false, pct: 80 },
      { id: 'm4', name: 'T&C + Handover',done: false, pct: 100 },
    ],
  },
  p_mag: {
    id: 'p_mag', code: 'PRJ-2025-018', name: 'MAG 318 - Phase A Tenant Floors',
    customer: 'c_mag', site: 's_mag318', manager: 'u_rashid', team: 't_alpha',
    status: 'On Track', stage: 'Termination', progress: 84,
    value: 690000, startedAt: '2025-02-01', dueAt: '2025-06-04',
    milestones: [
      { id: 'm1', name: 'Survey + BOQ', done: true, pct: 10 },
      { id: 'm2', name: 'Cabling',      done: true, pct: 55 },
      { id: 'm3', name: 'Termination',  done: true, pct: 80 },
      { id: 'm4', name: 'T&C',          done: false, pct: 100 },
    ],
  },
};

// ── AMC CONTRACTS ───────────────────────────────────────────
const AMCS = {
  amc_091: { id: 'amc_091', code: 'AMC-091', customer: 'c_damac',   site: 's_burj',    manager: 'u_rashid', state: 'PENDING_REACTIVATION', value: 48000, services: { done: 1, total: 4 }, nextDue: 'Today',  overdueDays: 12, freeCalls: 3, expiresAt: '2025-12-31' },
  amc_092: { id: 'amc_092', code: 'AMC-092', customer: 'c_mag',     site: 's_mag318',  manager: 'u_rashid', state: 'ACTIVE',               value: 36000, services: { done: 2, total: 4 }, nextDue: 'May 28', overdueDays: 0,  freeCalls: 5, expiresAt: '2025-11-15' },
  amc_088: { id: 'amc_088', code: 'AMC-088', customer: 'c_manipal', site: 's_manipal', manager: 'u_rashid', state: 'BLOCKED',              value: 64000, services: { done: 0, total: 4 }, nextDue: '-',      overdueDays: 34, freeCalls: 0, expiresAt: '2026-01-30' },
  amc_085: { id: 'amc_085', code: 'AMC-085', customer: 'c_nmc',     site: 's_nmc',     manager: 'u_rashid', state: 'ACTIVE',               value: 22000, services: { done: 3, total: 4 }, nextDue: 'Jun 02', overdueDays: 0,  freeCalls: 2, expiresAt: '2025-10-08' },
  amc_080: { id: 'amc_080', code: 'AMC-080', customer: 'c_azizi',   site: 's_azizi',   manager: 'u_rashid', state: 'RENEWAL_DUE',          value: 41000, services: { done: 4, total: 4 }, nextDue: 'Jun 14', overdueDays: 0,  freeCalls: 7, expiresAt: '2025-06-22' },
  amc_079: { id: 'amc_079', code: 'AMC-079', customer: 'c_csh',     site: 's_csh',     manager: 'u_rashid', state: 'ACTIVE',               value: 28000, services: { done: 2, total: 4 }, nextDue: 'Jun 05', overdueDays: 0,  freeCalls: 1, expiresAt: '2025-12-10' },
};

// ── REPAIR TICKETS ──────────────────────────────────────────
const REPAIRS = {
  r_412: { id: 'r_412', code: 'TKT-412', title: 'Reception camera offline',  customer: 'c_mag',     site: 's_mag318',  state: 'In Progress', sla: { target: 240, elapsed: 142, breach: false }, classification: 'AMC free-call', priority: 'high',   openedAt: '2025-05-15 14:20', assigned: 'u_bilal',  visits: 2 },
  r_410: { id: 'r_410', code: 'TKT-410', title: 'NVR rack - power supply fault', customer: 'c_csh', site: 's_csh',     state: 'Resolved',    sla: { target: 240, elapsed: 95,  breach: false }, classification: 'Chargeable',    priority: 'normal', openedAt: '2025-05-13 09:30', assigned: 'u_joseph', visits: 1 },
  r_408: { id: 'r_408', code: 'TKT-408', title: 'ACS reader stuck - main lobby', customer: 'c_difc',site: 's_difc',    state: 'New',         sla: { target: 120, elapsed: 18,  breach: false }, classification: 'AMC free-call', priority: 'high',   openedAt: '2025-05-16 08:40', assigned: null,       visits: 0 },
  r_405: { id: 'r_405', code: 'TKT-405', title: 'AC unit alarm - server room',   customer: 'c_azizi',site: 's_azizi',  state: 'Resolved',    sla: { target: 240, elapsed: 188, breach: false }, classification: 'Warranty',      priority: 'normal', openedAt: '2025-05-09 11:00', assigned: 'u_arvind', visits: 1 },
  r_402: { id: 'r_402', code: 'TKT-402', title: 'CAM-B-204 third failure',       customer: 'c_mag', site: 's_mag318',  state: 'Resolved',    sla: { target: 240, elapsed: 220, breach: false }, classification: 'AMC free-call', priority: 'high',   openedAt: '2025-05-02 10:15', assigned: 'u_bilal',  visits: 3, flagged: 'Repeat failure' },
};

// ── WORK ORDERS ─────────────────────────────────────────────
const WORK_ORDERS = {
  wo_3284: {
    id: 'wo_3284', code: 'WO-3284', type: 'AMC', priority: 'Standard',
    title: 'Q2 Quarterly Service - CCTV + ACS',
    source: { kind: 'amc', id: 'amc_091' },
    customer: 'c_damac', site: 's_burj',
    scheduledStart: '2025-05-16T09:00', scheduledEnd: '2025-05-16T11:30',
    status: 'In Progress', assignedLead: 'u_arvind', assigned: ['u_arvind','u_bilal'],
    progress: 60, slaMin: 240, elapsedMin: 142, materials: ['Lens cleaning kit','NVR HDD test','ACS reader spare'],
    tasks: [
      { id: 't1', label: 'Check-in & site walk',     done: true },
      { id: 't2', label: 'Inspect 24× IP cameras',   done: true,  count: '24/24' },
      { id: 't3', label: 'Test NVR & storage',       done: true },
      { id: 't4', label: 'Inspect 6× ACS readers',   done: false, count: '4/6' },
      { id: 't5', label: 'Customer walk-through',    done: false },
      { id: 't6', label: 'Service report + sign-off',done: false },
    ],
  },
  wo_3285: {
    id: 'wo_3285', code: 'WO-3285', type: 'REPAIR', priority: 'High',
    title: 'Reception camera offline - Visit 2',
    source: { kind: 'repair', id: 'r_412' },
    customer: 'c_mag', site: 's_mag318',
    scheduledStart: '2025-05-16T13:00', scheduledEnd: '2025-05-16T14:30',
    status: 'Assigned', assignedLead: 'u_bilal', assigned: ['u_bilal'],
    progress: 0, slaMin: 180, elapsedMin: 12, materials: ['Replacement 4MP dome cam','PoE injector'],
    flagged: 'Repeat failure - 3 visits in 90 days',
  },
  wo_3286: {
    id: 'wo_3286', code: 'WO-3286', type: 'PROJECT', priority: 'Standard',
    title: 'Cable pulling - L4 to L6 risers',
    source: { kind: 'project', id: 'p_azizi' },
    customer: 'c_azizi', site: 's_azizi',
    scheduledStart: '2025-05-16T15:00', scheduledEnd: '2025-05-16T18:00',
    status: 'Scheduled', assignedLead: 'u_joseph', assigned: ['u_joseph','u_saif'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: ['Cat6A 305m drum','Containment','Tie wraps'],
  },
  wo_3287: {
    id: 'wo_3287', code: 'WO-3287', type: 'DELIVERY', priority: 'Standard',
    title: 'Site delivery - Cat6A drums & patch panels',
    source: { kind: 'project', id: 'p_manipal' },
    customer: 'c_manipal', site: 's_manipal',
    scheduledStart: '2025-05-16T10:30', scheduledEnd: '2025-05-16T11:30',
    status: 'In Transit', assignedLead: 'u_karthik', assigned: ['u_karthik'],
    progress: 35, slaMin: null, elapsedMin: 22, materials: ['Cat6A drum × 4','Patch panel × 8','Cable ties'],
  },
  wo_3288: {
    id: 'wo_3288', code: 'WO-3288', type: 'PROJECT', priority: 'Standard',
    title: 'ACS device fit - Block A floors 3-5',
    source: { kind: 'project', id: 'p_manipal' },
    customer: 'c_manipal', site: 's_manipal',
    scheduledStart: '2025-05-17T08:30', scheduledEnd: '2025-05-17T17:00',
    status: 'Scheduled', assignedLead: 'u_arvind', assigned: ['u_arvind','u_joseph','u_bilal'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: ['12× ACS readers','Cabling kit'],
  },
  wo_3279: {
    id: 'wo_3279', code: 'WO-3279', type: 'AMC', priority: 'Standard',
    title: 'CSH AMC service Q2',
    source: { kind: 'amc', id: 'amc_079' },
    customer: 'c_csh', site: 's_csh',
    scheduledStart: '2025-05-15T08:00', scheduledEnd: '2025-05-15T11:00',
    status: 'Closed', assignedLead: 'u_joseph', assigned: ['u_joseph'],
    progress: 100, slaMin: 240, elapsedMin: 180, materials: [],
  },
  wo_3290: {
    id: 'wo_3290', code: 'WO-3290', type: 'SURVEY', priority: 'Standard',
    title: 'Site survey - DIFC Gate Ave variation order',
    source: { kind: 'project', id: 'p_difc4' },
    customer: 'c_difc', site: 's_difc',
    scheduledStart: '2025-05-16T14:00', scheduledEnd: '2025-05-16T16:00',
    status: 'Scheduled', assignedLead: 'u_sara', assigned: ['u_sara','u_rashid'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: [],
  },
  wo_3271: {
    id: 'wo_3271', code: 'WO-3271', type: 'REPAIR', priority: 'High',
    title: 'ACS reader stuck - NMC main lobby',
    source: { kind: 'repair', id: 'r_408' },
    customer: 'c_nmc', site: 's_nmc',
    scheduledStart: '2025-05-16T09:30', scheduledEnd: '2025-05-16T11:00',
    status: 'In Progress', assignedLead: 'u_bilal', assigned: ['u_bilal'],
    progress: 30, slaMin: 120, elapsedMin: 108, materials: ['Reader spare','Tooling'],
  },
};

// ── APPROVALS ──────────────────────────────────────────────
const APPROVALS = {
  ap_441: { id: 'ap_441', code: 'AP-441', kind: 'AMC Reactivation', amount: null,  context: 'AMC-091 - payment AED 48,000 cleared today', requester: 'system', target: { kind: 'amc', id: 'amc_091' }, openedAt: '14m ago', priority: 'high',   pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }], notes: 'Customer expecting Q2 service to start immediately. WO-3284 ready and team on site.' },
  ap_440: { id: 'ap_440', code: 'AP-440', kind: 'Material Request', amount: 6200,  context: 'Cat6A bulk + accessories for Azizi Riviera',  requester: 'u_joseph', target: { kind: 'project', id: 'p_azizi' },   openedAt: '38m ago', priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'lead_worker', user: 'u_arvind', state: 'approved', at: '24m ago' }, { step: 2, role: 'manager', user: 'u_rashid', state: 'pending' }] },
  ap_439: { id: 'ap_439', code: 'AP-439', kind: 'Variation Order',  amount: 28400, context: 'Add 2× corner cameras - Manipal Phase 2',     requester: 'u_noor',   target: { kind: 'project', id: 'p_manipal' }, openedAt: '1h 12m',  priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }, { step: 2, role: 'md', user: 'u_amir', state: 'queued' }] },
  ap_438: { id: 'ap_438', code: 'AP-438', kind: 'Subcontractor Payment', amount: 4800, context: 'Saif Ibrahim - 3 days, Riviera fiber pulling', requester: 'u_priya', target: { kind: 'project', id: 'p_azizi' }, openedAt: '2h 04m',  priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }, { step: 2, role: 'accounts', user: 'u_priya', state: 'queued' }, { step: 3, role: 'md', user: 'u_amir', state: 'queued' }] },
  ap_437: { id: 'ap_437', code: 'AP-437', kind: 'Leave Request',    amount: null,  context: 'Bilal Sayed - May 20-22 - 2 WO conflicts',     requester: 'u_bilal',  target: { kind: 'user', id: 'u_bilal' },         openedAt: '3h 28m',  priority: 'normal', pendingFor: 'u_arvind', chain: [{ step: 1, role: 'lead_worker', user: 'u_arvind', state: 'pending' }, { step: 2, role: 'manager', user: 'u_rashid', state: 'queued' }] },
};

// ── ACTIVITY FEED ──────────────────────────────────────────
const FEED = [
  { id: 'f1', t: '2m ago',  kind: 'check-in',     who: 'u_arvind', text: 'checked in at Burj Vista Tower 2', tag: 'success', target: { kind: 'wo', id: 'wo_3284' } },
  { id: 'f2', t: '6m ago',  kind: 'sla',          who: 'system',   text: 'TKT-408 response SLA - 12 min remaining', tag: 'warning', target: { kind: 'repair', id: 'r_408' } },
  { id: 'f3', t: '14m ago', kind: 'material',     who: 'u_joseph', text: 'requested approval for AED 6,200 cable run', tag: 'info', target: { kind: 'approval', id: 'ap_440' } },
  { id: 'f4', t: '18m ago', kind: 'reactivation', who: 'system',   text: 'DAMAC AMC-091 - payment received, reactivation pending', tag: 'primary', target: { kind: 'amc', id: 'amc_091' } },
  { id: 'f5', t: '22m ago', kind: 'signoff',      who: 'u_joseph', text: 'CSH Deira customer signed off WO-3279', tag: 'success', target: { kind: 'wo', id: 'wo_3279' } },
  { id: 'f6', t: '34m ago', kind: 'flag',         who: 'system',   text: 'CAM-B-204 - repeat-failure flag (3 in 90 days)', tag: 'danger', target: { kind: 'wo', id: 'wo_3285' } },
  { id: 'f7', t: '41m ago', kind: 'check-in',     who: 'u_karthik',text: 'departed warehouse → Manipal Campus', tag: 'info', target: { kind: 'wo', id: 'wo_3287' } },
  { id: 'f8', t: '52m ago', kind: 'ticket',       who: 'u_pooja',  text: 'opened TKT-408 - Azizi AC alarm', tag: 'info', target: { kind: 'repair', id: 'r_408' } },
  { id: 'f9', t: '1h 14m',  kind: 'invoice',      who: 'u_priya',  text: 'issued INV-2241 - AED 18,400 for DAMAC',  tag: 'info', target: { kind: 'customer', id: 'c_damac' } },
  { id: 'f10', t: '1h 38m', kind: 'leave',        who: 'u_bilal',  text: 'submitted leave request May 20–22', tag: 'info', target: { kind: 'approval', id: 'ap_437' } },
];

// ── INVENTORY ──────────────────────────────────────────────
const INVENTORY = [
  { id: 'i1', sku: 'CCTV-DOME-4MP', name: '4MP IP Dome Camera',     unit: 'pcs', central: 42, vehicles: 6,  sites: 18, reorderAt: 20, value: 38000 },
  { id: 'i2', sku: 'CCTV-BULL-8MP', name: '8MP IP Bullet Camera',   unit: 'pcs', central: 18, vehicles: 4,  sites: 6,  reorderAt: 12, value: 22000 },
  { id: 'i3', sku: 'CAT6A-DRUM',    name: 'Cat6A Cable Drum (305m)', unit: 'drum', central: 6,  vehicles: 2,  sites: 4,  reorderAt: 8,  value: 14400 },
  { id: 'i4', sku: 'NVR-32CH',      name: 'NVR 32-channel 4K',      unit: 'pcs', central: 5,  vehicles: 1,  sites: 12, reorderAt: 3,  value: 32500 },
  { id: 'i5', sku: 'ACS-RDR-MIFARE',name: 'Mifare ACS Reader',      unit: 'pcs', central: 28, vehicles: 5,  sites: 22, reorderAt: 15, value: 11200 },
  { id: 'i6', sku: 'PATCH-PNL-48',  name: '48-port patch panel',    unit: 'pcs', central: 12, vehicles: 2,  sites: 8,  reorderAt: 5,  value: 8400 },
  { id: 'i7', sku: 'POE-SW-24',     name: '24-port PoE+ Switch',    unit: 'pcs', central: 8,  vehicles: 1,  sites: 4,  reorderAt: 4,  value: 18000 },
];

// ── ASSETS (registry) ──────────────────────────────────────
const ASSETS = [
  { id: 'a1', tag: 'CAM-B-204',  model: '4MP IP Dome', site: 's_mag318', installedAt: '2022-03-14', warrantyTo: '2025-03-13', faultCount: 3, status: 'Repeat failure' },
  { id: 'a2', tag: 'NVR-MAIN-1', model: 'NVR 32-channel', site: 's_burj', installedAt: '2021-09-22', warrantyTo: '2024-09-21', faultCount: 0, status: 'Healthy' },
  { id: 'a3', tag: 'ACS-D-12',   model: 'Mifare Reader', site: 's_csh', installedAt: '2023-06-01', warrantyTo: '2026-05-30', faultCount: 1, status: 'Healthy' },
];

// ── NOTIFICATIONS ──────────────────────────────────────────
const NOTIFICATIONS = [
  { id: 'n1', t: '2m ago',  read: false, kind: 'approval',     title: 'AMC-091 reactivation needed',     body: 'DAMAC payment cleared, awaiting your approval.', target: { kind: 'approval', id: 'ap_441' } },
  { id: 'n2', t: '12m ago', read: false, kind: 'sla',          title: 'TKT-408 SLA · 12m remaining',     body: 'Response window closing on NMC reader ticket.',  target: { kind: 'repair', id: 'r_408' } },
  { id: 'n3', t: '38m ago', read: false, kind: 'material',     title: 'Material request - AED 6,200',    body: 'Joseph requested Cat6A bulk for Azizi.',          target: { kind: 'approval', id: 'ap_440' } },
  { id: 'n4', t: '1h 04m',  read: true,  kind: 'signoff',      title: 'WO-3279 signed off',              body: 'CSH Deira service report accepted.',              target: { kind: 'wo', id: 'wo_3279' } },
  { id: 'n5', t: '2h 38m',  read: true,  kind: 'leave',        title: 'Leave request - Bilal Sayed',     body: 'May 20–22 · 2 work order conflicts detected.',    target: { kind: 'approval', id: 'ap_437' } },
];

// ── FORECAST RISKS ─────────────────────────────────────────
const RISKS = [
  { id: 'r1', kind: 'Manpower', label: 'CCTV technicians overloaded', detail: 'Week of Jun 02 - 142% capacity',   severity: 'warning' },
  { id: 'r2', kind: 'Material', label: 'Cat6A stock running low',     detail: '4 active projects, 2.1km on hand', severity: 'warning' },
  { id: 'r3', kind: 'AMC',      label: 'Quarterly service cluster',   detail: 'Week of Jun 09 - 14 services due', severity: 'info'    },
  { id: 'r4', kind: 'SLA',      label: 'NMC ticket near breach',      detail: 'TKT-408 - 12 min remaining',       severity: 'danger'  },
];

// ── COMMS TIMELINE ─────────────────────────────────────────
const COMMS = {
  c_damac: [
    { id: 'cm1', t: 'Today 09:42', kind: 'WhatsApp',  from: 'DAMAC Site Manager', body: 'Payment for AMC-091 cleared this morning, please reactivate ASAP.' },
    { id: 'cm2', t: 'Today 09:18', kind: 'System',    from: 'Payment gateway',     body: 'AED 48,000 reconciled against AMC-091' },
    { id: 'cm3', t: 'Yest 16:30',  kind: 'Site visit', from: 'Arvind Krishnan',    body: 'Preliminary survey complete, photos uploaded' },
    { id: 'cm4', t: 'Yest 11:05',  kind: 'Email',     from: 'Rashid Al-Hashimi',   body: 'Sent reactivation reminder + Q2 schedule preview' },
    { id: 'cm5', t: 'May 12',      kind: 'Invoice',   from: 'Accounts',            body: 'INV-2238 issued - AED 48,000, due May 15' },
  ],
  c_mag: [
    { id: 'cm1', t: 'Today 11:08', kind: 'WhatsApp',  from: 'MAG Reception',       body: 'Camera at lobby still offline, please escalate.' },
    { id: 'cm2', t: 'Yest 14:40',  kind: 'Site visit', from: 'Bilal Sayed',        body: 'Replaced PoE injector. Camera still intermittent.' },
  ],
};

// ── BREAKDOWNS ─────────────────────────────────────────────
const KPI_OPS = {
  open_wo: 38, sla_at_risk: 5, sla_pct: 94.2,
  amc_value_q: 482000, amc_growth: 0.124,
  utilization: 0.87, util_spark: [40, 55, 48, 62, 58, 70, 75, 87],
  approvals_count: 5, approvals_high: 1,
  rev_month: 1280000, rev_growth: 0.082,
  active_projects: 14, projects_at_risk: 3,
};

// ── EXPORT ─────────────────────────────────────────────────
window.DB = {
  USERS, TEAMS, ROLE_LABELS,
  CUSTOMERS, SITES, PROJECTS, AMCS, REPAIRS, WORK_ORDERS,
  APPROVALS, FEED, NOTIFICATIONS, RISKS, COMMS, INVENTORY, ASSETS,
  KPI_OPS,
  // Helpers
  user:    (id) => USERS[id]     || { name: 'Unknown', initials: '?', tint: 'primary' },
  cust:    (id) => CUSTOMERS[id] || null,
  site:    (id) => SITES[id]     || null,
  proj:    (id) => PROJECTS[id]  || null,
  amc:     (id) => AMCS[id]      || null,
  wo:      (id) => WORK_ORDERS[id] || null,
  byCustomer: (id) => ({
    projects: Object.values(PROJECTS).filter(p => p.customer === id),
    amcs:     Object.values(AMCS).filter(a => a.customer === id),
    repairs:  Object.values(REPAIRS).filter(r => r.customer === id),
    wos:      Object.values(WORK_ORDERS).filter(w => w.customer === id),
  }),
  byProject: (id) => ({
    wos:      Object.values(WORK_ORDERS).filter(w => w.source.kind === 'project' && w.source.id === id),
  }),
  byAmc: (id) => ({
    wos:      Object.values(WORK_ORDERS).filter(w => w.source.kind === 'amc' && w.source.id === id),
  }),
};
```

---

Say **"next"** for Part 3 (`components.jsx`, `shell.jsx`, `app.jsx`).

