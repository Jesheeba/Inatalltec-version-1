# Master Build Prompt v6: Installtec CRM & Operations Management System

> **Single source of truth for the development team.**
> Complete architectural specification - Super Admin governance, white-labeling, multi-currency, Admin-driven user model, operational systems, mobile-first PWA, Supabase + Node.js stack.

---

## Table of Contents

1. [Project Brief](#part-1--project-brief)
2. [Governance & User Management Model](#part-2--governance--user-management-model-critical-foundation)
3. [Multi-Tenancy, Branding & Currency](#part-3--multi-tenancy-branding--currency)
4. [Business Workflow Rules](#part-4--business-workflow-rules-non-negotiable)
5. [Hidden Pain Points the CRM Must Solve](#part-5--hidden-pain-points-the-crm-must-solve)
6. [Technical Architecture](#part-6--technical-architecture)
7. [Three-Engine System Architecture](#part-7--the-three-engine-system-architecture)
8. [Complete Module List](#part-8--complete-module-list)
9. [Module Deep-Dives](#part-9--module-deep-dives)
10. [Role-Based Dashboards](#part-10--role-based-dashboards)
11. [Database / Entity Model](#part-11--database--entity-model)
12. [Costing & Profitability Engine](#part-12--costing--profitability-engine)
13. [Automation & Business Rules](#part-13--automation--business-rules)
14. [Notification Strategy](#part-14--notification-strategy)
15. [KPIs](#part-15--kpis)
16. [Mobile PWA Worker Workflow](#part-16--mobile-pwa-worker-workflow)
17. [AI & Smart Automation](#part-17--ai--smart-automation-phase-3)
18. [Phased Roadmap](#part-18--phased-roadmap)
19. [Non-Functional Requirements](#part-19--non-functional-requirements)
20. [Development Principles](#part-20--development-principles)
21. [Supabase Storage Structure](#part-21--supabase-storage-structure)
22. [Definition of Done](#part-22--definition-of-done)
23. [Deliverables Expected](#part-23--deliverables-expected)
24. [The Three Truths to Internalize](#part-24--the-three-truths-to-internalize)
25. [Explicit Exclusions](#part-25--explicit-exclusions)

---

## PART 1 - PROJECT BRIEF

### About the Client

**Installtec Electromechanical LLC** is a Dubai-based system integrator and electromechanical company with 14+ years of experience, 25+ technical staff, 100+ completed projects, and 220+ satisfied customers across 6 countries (UAE, Saudi Arabia, Ethiopia, Uganda, India, and growing).

The company is a SIRA-registered CCTV installation contractor specializing in Extra-Low Voltage (ELV) systems across three core pillars:

- **IT Infrastructure** - structured cabling, servers, networking, Wi-Fi, IPTV
- **Physical Security Systems** - CCTV, ANPR, access control, gate barriers, intercoms, biometrics
- **Automation** - Building Management Systems, lighting control, HVAC control, home automation, Delta T Controls

### What We're Building

A **mobile-responsive Progressive Web App (PWA) CRM and Operations Management System** that unifies three business operations into one platform:

1. **Contractor Projects** - multi-month installation projects with milestones, manpower planning, BOQs, and stakeholder coordination
2. **Repair Agency Work** - fast-turnaround repair tickets for own products and third-party supplier products
3. **Annual Maintenance Contracts (AMC)** - quarterly recurring services with payment-gated execution and free-call tracking

All field activity flows through a **unified Work Order / Job Card system**.

**Governance is two-tier:** Super Admin sits at the system level and creates Admins. Each Admin governs one Organization. Each Organization has its own branding, currency, locale, users, customers, and operations. **The system is multi-tenant from day one - built for Installtec first, ready to host other companies later.**

Every user role - from Super Admin to field worker - must have full feature parity on phone, tablet, and desktop.

### The Three Business Realities Driving This Build

1. **The Operations Manager is the bottleneck today.** The CRM's #1 job is to make those decisions visible, reversible, and delegable.
2. **AMC is the strategic gold mine, not contractor projects.** Build the funnel into the workflow.
3. **Phone-first for everyone.** Every workflow must work one-handed on a 6-inch Android screen.

---

## PART 2 - GOVERNANCE & USER MANAGEMENT MODEL (CRITICAL FOUNDATION)

### Two-Tier Governance Hierarchy

```
Super Admin  (System-level - seeded on Day 1)
    │
    ├─ creates / manages → Organizations
    │                          │
    │                          └─ has its own branding, currency, locale, custom domain
    │
    └─ creates / manages → Admin(s) per Organization
                              │
                              └─ creates / manages → all operational users
                                                       │
                                                       └─ assigns to → Teams
                                                                         │
                                                                         └─ flows into → Operations
```

### The Super Admin Role

The Super Admin is the **highest-privilege user in the entire system**. Typically one Super Admin, multiple allowed for redundancy. The first Super Admin is **seeded via database migration**, not created through UI.

**Super Admin Responsibilities:**
1. **Create and manage Organizations** (each Organization = one company using the CRM)
2. **Create and manage Admins** - assign Admins to Organizations
3. **Configure Organization branding** - logo, colors, tagline, login page
4. **Configure Organization currency & locale** - AED, SAR, INR, USD, etc.
5. **Configure Organization custom domain** - DNS verification, SSL provisioning
6. **Configure Organization document templates** - invoice, service report, AMC contract footers
7. **Configure Organization email & WhatsApp templates**
8. **System-wide audit log access** - every action by every user across all organizations
9. **Emergency overrides** - can deactivate any user including Admins
10. **Multi-organization support** - manages billing/subscription per Organization (future SaaS-ready)

**Super Admin does NOT:**
- Manage day-to-day operational users
- Create Managers, Workers, Sales, etc. directly
- Configure operational approval chains for specific workflows
- Manage customers, projects, or work orders directly

### The Admin Role

The Admin is the **organization-level governance role**. Admins are created by Super Admin and assigned to one Organization. One Organization can have one or many Admins.

**Admin Responsibilities:**
1. **User creation** - create any number of users in any operational role within their Organization
2. **Role assignment** - assign each user one of the operational roles
3. **Scope assignment** - define what each user can manage (specific projects, customers, sites, AMCs, regions, teams)
4. **Approval chain configuration** - define who approves what for every approval type
5. **Permission management** - grant or revoke specific capabilities within a role
6. **Team formation** - create teams with assigned manager + workers
7. **Operational SLA targets, escalation timers, notification rules**
8. **Optional branding management** - if Super Admin grants the permission

**Admin cannot:**
- Create or modify other Admins (Super Admin only)
- Create or modify the Super Admin
- Manage Organization branding/currency/domain (unless Super Admin delegates)
- Access cross-organization data
- Access system-level audit logs

### System Roles (Full Hierarchy)

| Role | Created By | Description | Phone-Responsive |
|---|---|---|---|
| **Super Admin** | Database seed | Highest privilege, creates Organizations and Admins, system-level control | Yes |
| **Admin** | Super Admin | Organization governance, creates all other users | Yes |
| **Managing Director** | Admin | Strategic view, top-tier approvals | Yes |
| **Manager** | Admin | Operational oversight of assigned scope | Yes |
| **Sales** | Admin | Quotations, pipeline, AMC renewals | Yes |
| **Pre-Sales / Estimator** | Admin | BOQ building, costing, estimations | Yes |
| **Lead Worker** | Admin | Crew supervisor, work order assignment within team | Yes |
| **Worker / Technician** | Admin | Field execution of work orders | Yes |
| **Driver** | Admin | Material delivery work orders | Yes |
| **Subcontractor** | Admin | Limited scope, assigned work orders only | Yes |
| **Service Support** | Admin | Repair ticket intake, customer communication | Yes |
| **Accounts** | Admin | Invoicing, payments, financial approvals | Yes |
| **Customer (Phase 3)** | Admin or self-signup | Self-service portal | Yes |

### Admin Creation Flow (Super Admin Only)

```
Super Admin opens "Admin Management"
         │
         ▼
[+ Create New Admin]
         │
         ▼
Step 1: Select Organization (or create new org first)
Step 2: Basic Info (name, email, phone, photo)
Step 3: Admin Permission Level (Full / Limited)
Step 4: Notification Preferences
Step 5: Send Invite (magic link + mandatory 2FA on first login)
```

### User Creation Flow (Admin Manages All Other Users)

```
Admin opens "User Management"
         │
         ▼
[+ Create New User]
         │
         ▼
Step 1: Basic Info
Step 2: Role Selection (cannot select Super Admin or Admin)
Step 3: Permission Customization (toggle granular permissions)
Step 4: Scope Assignment (projects, customers, AMCs, regions, teams)
Step 5: Manager Assignment
Step 6: Notification Preferences
Step 7: Send Invite (magic link + 2FA for sensitive roles)
```

### Dynamic Dashboard Rendering

When any user logs in, the system at login time:
1. Reads the user's `role`, `permissions`, `scope`, `organization_id`, `manager_id`
2. Loads the Organization's branding (logo, colors, currency, locale)
3. Loads the dashboard template for that role
4. Filters all queries by `organization_id` AND user scope via RLS

### Dashboard Templates by Role

**Super Admin Dashboard**
- Organizations Management (list, create, edit, deactivate)
- Per-Organization Branding & Configuration
- Admin Management
- System-wide audit log
- System-level settings
- Cross-Organization analytics (Phase 4)

**Admin Dashboard**
- User Management
- Team Management
- Role Permission Templates
- Approval Chain Builder
- Operational system configuration
- Audit logs (Organization-scoped)
- All operational dashboards (read access to everything in their Organization)
- Optional: Organization Branding (if Super Admin granted permission)

**Managing Director, Manager, Sales, Pre-Sales, Lead Worker, Worker, Driver, Subcontractor, Service Support, Accounts, Customer** - see Part 10.

### Permission Granularity

Admin can toggle granular permissions per user. All permissions stored as JSONB on the user record and enforced via Supabase RLS + frontend conditional rendering.

### Approval Chain Configuration (Admin-Controlled)

No hardcoded chains. Admin configures every approval type per Organization. See Part 9 Module 14 for full detail.

### Audit & History

Every Super Admin and Admin action is logged in dedicated tables:
- `super_admin_audit_log` - system-level actions (organization creation, admin creation, branding changes)
- `admin_audit_log` - organization-level actions (user creation, role changes, approval chain edits)

Audit logs are immutable and exportable.

---

## PART 3 - MULTI-TENANCY, BRANDING & CURRENCY

### Multi-Tenancy Foundation

The system is **multi-tenant from day one**. Every operational table has an `organization_id` foreign key. RLS policies enforce that no data ever crosses Organization boundaries.

- Super Admin can view across all Organizations
- Admin sees only their assigned Organization
- All other roles see only data within their Organization AND their personal scope

This makes the system **portable**: tomorrow Installtec can host their CRM for a sister company, or the platform can be licensed to other ELV/MEP firms, without code changes.

### Organizations Table Schema

```sql
organizations (
  id UUID PRIMARY KEY,
  
  -- Identity
  name TEXT NOT NULL,                          -- "Installtec Electromechanical LLC"
  display_name TEXT NOT NULL,                  -- "Installtec"
  legal_name TEXT,                             -- full legal entity name for documents
  tagline TEXT,                                -- "Your Trusted Partner in Integrated Systems"
  login_page_message TEXT,                     -- welcome text on login screen
  
  -- Visual branding
  logo_url TEXT,                               -- Supabase Storage URL
  logo_dark_url TEXT,                          -- optional dark-mode variant
  favicon_url TEXT,                            -- browser tab icon
  primary_color TEXT DEFAULT '#5BAE9C',        -- hex
  secondary_color TEXT DEFAULT '#A78BFA',      -- hex
  accent_color TEXT DEFAULT '#F4B8A4',         -- hex
  
  -- Domain
  subdomain TEXT UNIQUE NOT NULL,              -- "installtec" → installtec.yourapp.com (always works)
  custom_domain TEXT UNIQUE,                   -- "crm.installtecuae.com" (optional)
  domain_verified BOOLEAN DEFAULT false,
  domain_verification_token TEXT,              -- for TXT record DNS verification
  
  -- Currency
  default_currency TEXT NOT NULL DEFAULT 'AED', -- ISO 4217: AED, SAR, USD, INR, EUR, GBP, OMR, KWD, BHD, QAR, EGP
  currency_symbol TEXT NOT NULL DEFAULT 'AED', -- display: "AED", "$", "₹", "ر.س"
  currency_position TEXT DEFAULT 'before',     -- 'before' or 'after'
  decimal_separator TEXT DEFAULT '.',
  thousand_separator TEXT DEFAULT ',',
  decimal_places INT DEFAULT 2,
  
  -- Locale
  default_locale TEXT DEFAULT 'en-AE',         -- BCP 47
  default_timezone TEXT DEFAULT 'Asia/Dubai',  -- IANA
  date_format TEXT DEFAULT 'DD/MM/YYYY',
  time_format TEXT DEFAULT '24h',
  first_day_of_week INT DEFAULT 1,             -- 0=Sunday, 1=Monday, 6=Saturday
  
  -- Document templates
  invoice_footer_text TEXT,
  invoice_terms_text TEXT,
  service_report_footer_text TEXT,
  amc_contract_footer_text TEXT,
  quotation_footer_text TEXT,
  
  -- Email customization
  email_from_name TEXT,                        -- "Installtec Operations"
  email_signature TEXT,                        -- HTML signature
  email_reply_to TEXT,                         -- support@installtecuae.com
  
  -- WhatsApp customization
  whatsapp_business_name TEXT,
  whatsapp_greeting_template TEXT,
  whatsapp_sign_off TEXT,
  
  -- Permissions
  admin_can_manage_branding BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_trial BOOLEAN DEFAULT false,
  trial_ends_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  created_by UUID REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT now()
)
```

### Organization Creation Flow (Super Admin)

```
Super Admin opens "Organizations" → [+ Create Organization]
         │
         ▼
Step 1: Basic Info
  - Legal name, display name, tagline, subdomain (auto-validated unique)
         │
         ▼
Step 2: Branding
  - Upload logo (recommended 400x100 PNG, transparent)
  - Upload dark-mode logo (optional)
  - Upload favicon (optional)
  - Color pickers (primary, secondary, accent) with live preview
         │
         ▼
Step 3: Currency & Locale
  - Currency dropdown (AED, SAR, USD, INR, EUR, GBP, OMR, KWD, BHD, QAR, EGP)
  - Currency symbol (auto-filled, editable)
  - Currency position (before/after) with live preview
  - Decimal/thousand separators with preview
  - Decimal places (0, 2, 3)
  - Timezone (IANA dropdown)
  - Date format dropdown
  - Time format (12h/24h)
  - First day of week (Sun/Mon/Sat)
  - Default locale
         │
         ▼
Step 4: Document Templates
  - Invoice footer text (rich text editor)
  - Invoice T&C text
  - Service report footer
  - AMC contract footer
  - Quotation footer
         │
         ▼
Step 5: Email Settings
  - Email from name
  - Reply-to email
  - Email signature (rich text editor with logo embed option)
         │
         ▼
Step 6: WhatsApp Settings
  - Business name
  - Greeting template (with {customer_name}, {company_name} variables)
  - Sign-off
         │
         ▼
Step 7: Custom Domain (optional)
  - Domain input
  - DNS verification instructions (auto-generated CNAME / TXT)
  - "Verify Now" button → polls DNS
         │
         ▼
Step 8: Initial Admin
  - Name, email of first Admin for this Organization
  - Send invite
```

### Editing an Existing Organization

Same tabs as creation flow, all editable. All changes audit-logged. Super Admin can toggle "Allow Admin to manage branding" per Organization.

### Optional: Delegating Branding to Admin

If `admin_can_manage_branding = true`, Admin sees a "Branding" section in their dashboard with the same tabs (except subdomain and custom domain remain Super Admin-only).

### Application-Wide Effects of Organization Config

When any user logs into an Organization, the system loads that Organization's settings and applies them everywhere:

1. **CSS variables injected at app root** - `--primary`, `--secondary`, `--accent` from Organization
2. **Logo shown in:**
   - Sidebar header
   - Login page
   - Email templates
   - PDF documents (invoice, service report, AMC contract, quotation, handover pack)
   - WhatsApp message templates
   - Browser tab (favicon)
   - Browser title (Organization display name)
3. **All money values** rendered using Organization's currency settings via a single utility:
   `formatCurrency(amount, organization)` → "AED 1,234.56" or "1.234,56 ر.س" or "₹ 1,23,456.00"
4. **All dates/times** rendered using Organization's date/time/timezone settings
5. **All outgoing emails** use Organization's `email_from_name`, signature, footer
6. **All outgoing WhatsApp messages** use Organization's templates
7. **All PDFs** use Organization's logo, colors, footer text

### Currency Handling Rules

Critical implementation rules:

- **Store all monetary values in the Organization's currency at time of recording**
- **Every financial row** (invoices, AMC contracts, BOQ items, payments, quotations, costing records, material costs, technician cost rates) has a `currency` column - future-proof against any currency changes
- **DO NOT do automatic currency conversion** - that's a finance integration concern, not CRM concern
- **Approval thresholds** (e.g., "approve quotations under AED 50K") are configured in the Organization's currency
- **Reports show totals in Organization's currency only** - cross-Organization aggregation (Super Admin view) shows raw values per currency without conversion
- **A single `formatCurrency()` utility** handles all display formatting - components never format money inline

### Custom Domain Handling

- Subdomain always works as fallback: `installtec.yourapp.com`
- Custom domain requires DNS verification:
  - CNAME record pointing to platform
  - TXT record for ownership verification
- Show DNS instructions in Super Admin UI with copy buttons
- Auto-poll DNS every 5 minutes after setup
- SSL certificates auto-provisioned (Vercel/Cloudflare)
- Until verified, Organization uses subdomain only

### Supabase Storage for Branding

```
organization-branding/{organization_id}/
  logo.{ext}
  logo-dark.{ext}
  favicon.{ext}
```

RLS:
- Super Admin: read/write all
- Admin: read/write only their Organization's folder (if granted permission)
- Other roles: read-only access to their Organization's logo
- Public read for login page logo (cached aggressively)

---

## PART 4 - BUSINESS WORKFLOW RULES (NON-NEGOTIABLE)

### Project Workflow
Manager assigns projects/sites to Lead Workers → Lead Workers create work orders → Driver handles material logistics → Subcontractors hired only when additional manpower needed.

### AMC Rules
- Quarterly service model: 4 services per year, auto-scheduled at contract signing
- Payment must complete within 30 days of signing
- If payment delayed → next service work order blocked automatically (override approval routed per Admin-configured chain)
- **When delayed payment is received**, system auto-detects, auto-reactivates contract, restores next-due service work order, and routes reactivation approval to the Manager. Service proceeds only after Manager approval.
- AMC includes free support calls
- If damaged product replaced during free call → separate additional invoice auto-generated

**AMC Contract Lifecycle:**

```
DRAFT → SIGNED → (within 30d payment) → ACTIVE → quarterly services execute
                       │
                       ▼ (no payment)
                    BLOCKED
                       │
                       ├─► Override approved → ACTIVE
                       │
                       └─► Late payment arrives → PENDING_REACTIVATION
                                                     │
                                                     ├─► Manager approves → ACTIVE
                                                     └─► Manager rejects → BLOCKED
```

### Repair Workflow
- Own-product and third-party repairs tracked separately
- Each repair generates one or more work orders (one per visit)
- First visit forces capture: symptom, root cause, parts needed, estimate
- Free-call vs. chargeable classification at ticket creation

### Subcontractor Handling
Track only name, phone, email, working days/hours, skill, rate. Payment-gated by work order completion verification.

### 3-Month Operational Planning
Forward visibility for projects, manpower, technician allocation, schedules, targets, activities, calendar, pending tasks, updates.

**Hierarchy**: All Projects → Activities → Targets → Calendar → Updates

---

## PART 5 - HIDDEN PAIN POINTS THE CRM MUST SOLVE

1. **"Where's my technician?"** - no real-time visibility
2. **Double-booked technicians** - conflicts on-site
3. **Material pilferage / ghost inventory** - 40-60% of project cost, untracked
4. **Free-call trap** - abused by clients, missed by techs
5. **AMC payment-service deadlock** - services delivered against unpaid contracts AND services delayed even after payment arrives
6. **Repair visit spiral** - one repair becomes three visits
7. **No man-hour truth** - quotes based on gut, not history
8. **Subcontractor black box** - paid without verification
9. **Document chaos** - drawings scattered across email/WhatsApp/Drive
10. **Quotation bottleneck** - pre-sales rebuilds estimates from scratch
11. **Approval bottleneck** - every decision via WhatsApp, no audit
12. **No escalation discipline** - issues fester until MD complaint
13. **Asset history loss** - past replacements forgotten
14. **Customer communication silos** - promises live on phones
15. **No SLA tracking** - measured against nothing
16. **Reactive resourcing** - manpower crunches discovered same day
17. **Onboarding friction** - new staff onto WhatsApp chaos

---

## PART 6 - TECHNICAL ARCHITECTURE

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│        MOBILE-RESPONSIVE PWA (Next.js + Tailwind)              │
│     Installable on phones, tablets, desktops as PWA             │
│       Offline-first via Service Worker + IndexedDB              │
│        Full feature parity on phone for ALL user roles          │
│   Per-Organization branding, currency, locale applied at boot   │
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
│ • Storage      │                            │ • PDF gen with  │
│ • Realtime     │  ◄─── service-key ops      │   org branding  │
│ • RLS policies │                            │ • WhatsApp API  │
│ • pg_cron      │                            │ • Schedulers    │
│ • Triggers     │                            │ • Escalations   │
│ • Views        │                            │ • SLA monitor   │
│ • fn_resolve_  │                            │ • Forecasting   │
│   approver     │                            │ • DNS verifier  │
└────────────────┘                            └─────────────────┘
                                                       │
                                ┌──────────────────────┴────────────┐
                                │       EXTERNAL SERVICES           │
                                │                                   │
                                │ • WhatsApp Business API (Meta)    │
                                │ • Resend (Email)                  │
                                │ • Twilio (SMS)                    │
                                │ • Vercel/Cloudflare (SSL/Domain)  │
                                │ • Tally/Zoho (future)             │
                                └───────────────────────────────────┘
```

### Tech Stack

**Frontend (Mobile-Responsive PWA)**
- Next.js 15+ with App Router
- TypeScript (strict mode)
- Tailwind CSS + shadcn/ui
- Zustand for state management
- Workbox for PWA capabilities
- Dexie.js for IndexedDB (offline storage)
- SignaturePad.js for customer signatures
- browser-image-compression for photo handling
- Supabase JS Client SDK
- Recharts for dashboards
- React Hook Form + Zod
- FullCalendar for calendar views
- next-i18next (Phase 2) for localization

**Backend (Node.js)**
- Node.js 20 LTS
- NestJS framework with TypeScript
- Supabase JS Client (service role key)
- BullMQ + Redis for job queues
- node-cron for scheduled tasks
- Puppeteer for PDF generation (with per-Organization branding)
- Pino for structured logging
- Zod for input validation
- Jest for testing

**Data & Storage Platform (Supabase)**
- PostgreSQL 15+
- Supabase Auth (email/password + magic link + 2FA)
- Supabase Storage (multi-bucket, RLS-protected)
- Supabase Realtime
- Row-Level Security on every table
- pg_cron for scheduled DB jobs

**External Integrations**
- WhatsApp Business API (Meta)
- Resend (email)
- Twilio (SMS)
- Vercel or Cloudflare for custom domain SSL
- Future: Tally / Zoho Books, SIRA portal

**Hosting & Infrastructure**
- Supabase: AWS Mumbai (ap-south-1)
- Frontend: Vercel
- Node.js backend: Railway / Render / DigitalOcean App Platform
- Redis: Upstash
- CDN: Cloudflare
- Domain: per-Organization custom domains supported

**Estimated infrastructure cost**: $80–150/month for single Installtec deployment; scales per Organization for multi-tenant.

---

## PART 7 - THE THREE-ENGINE SYSTEM ARCHITECTURE

```
              ┌─────────────────────────────────────┐
              │      INTEGRATED CRM PLATFORM        │
              │   (Multi-tenant, Super Admin       │
              │    governance, white-labeled)       │
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
              │ • Users & Teams               │
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
              │ • Escalation Matrix           │
              │ • SLA Engine                  │
              │ • Costing & Profitability     │
              │ • Resource Forecasting        │
              │ • Customer Comm Timeline      │
              │ • Reports & Analytics         │
              │ • Org Configuration (Admin)   │
              │ • Super Admin Console         │
              └───────────────────────────────┘
```

---

## PART 8 - COMPLETE MODULE LIST

### Module 0 - Super Admin Console ⭐ NEW
- Organizations Management (CRUD)
- Per-Organization Branding & Configuration (logo, colors, currency, locale, domain, documents, email, WhatsApp)
- Admin Management across Organizations
- System-wide audit logs
- Cross-Organization analytics (Phase 4)
- DNS verification & SSL provisioning workflow

### Module 1 - Admin & User Management ⭐ FOUNDATION
- User creation, editing, deactivation (within Organization)
- Role assignment, granular permissions, scope assignment
- Team creation and management
- Manager-Worker linking
- Approval chain configuration (per Organization)
- Operational system configuration
- Audit logs (Organization-scoped)
- User invite flow (magic link via email + WhatsApp)

### Module 2 - Customer & Site Management
- Customer profile, multi-site, geo, access instructions
- Stakeholder contacts, project/repair/AMC history
- Linked installed assets, communication timeline

### Module 3 - Project Engine
- Lifecycle: Lead → DLP → AMC handoff
- BOQ builder, milestones with payment terms
- Versioned drawings, SIRA submission, T&C checklist
- As-Built handover gate, variation orders
- Spawns work orders

### Module 4 - Repair Engine
- Multi-channel ticket intake
- Own/third-party classification
- Multi-visit chain via work orders
- Free-call to chargeable conversion
- SLA-tracked

### Module 5 - AMC Engine
- Contract creation, 4 quarterly schedules
- Payment gating + override
- **Automatic payment-arrival reactivation workflow**
- Free-call counter, replacement invoicing
- Renewal pipeline, digital service reports
- Linked to Asset Registry

### Module 6 - Work Order / Job Card System
The universal execution layer. Every field activity runs through a work order.

### Module 7 - Workforce & Manpower
- Skill tags, availability calendar, capacity heatmap
- Subcontractor lite-profile
- Leave Request & Smart Reassignment

### Module 8 - Scheduling & Dispatch
- Unified calendar, drag-drop (desktop) / tap-select (mobile)
- Conflict detection, geo-aware routing
- 3-month forward visibility

### Module 9 - Inventory & Materials
- Central / vehicle / site stock
- BOQ reconciliation, material requests via approval
- Low-stock alerts, serial number tracking

### Module 10 - Driver & Logistics
- Material delivery work orders, vehicle stock
- Pickup-from-site, daily route plans

### Module 11 - Documents & Compliance
- Per-project document folder
- SIRA renewal calendar, trade license/insurance/visa tracking
- Customer-signed PODs and service reports (with Organization branding)

### Module 12 - Finance (Lightweight)
- Quotation → Proforma → Invoice (with Organization currency & branding)
- AMC invoice scheduling, free-call replacement auto-trigger
- Payment status sync, outstanding aging
- Costing & Profitability Engine

### Module 13 - Asset Registry
Every installed device tracked with serial, warranty, full event history.

### Module 14 - Approval Workflow Engine ⭐ ADMIN-CONFIGURED
Universal approval router with dynamic approver resolution.

### Module 15 - Escalation Matrix
Auto-escalation following Admin-configured manager hierarchies.

### Module 16 - SLA Engine
Real-time countdowns, breach detection, Escalation Matrix trigger.

### Module 17 - Customer Communication Timeline
Unified per-customer history across all channels.

### Module 18 - Resource Forecasting
Rule-based capacity prediction.

### Module 19 - Central Operations Feed
Live command center - primary screen for Managers.

### Module 20 - Internal Communication Threads
Project / work order / ticket / AMC discussion threads.

### Module 21 - Reports & Analytics
Project, technician, customer, operational reporting (in Organization currency).

### Module 22 - Mobile Field Workflow (PWA)
Mobile-first execution of work orders.

---

## PART 9 - MODULE DEEP-DIVES

### MODULE 0 - Super Admin Console

**Organizations Management UI**

Sidebar entry → "Organizations" → list view (cards showing logo, name, status, currency, # users, custom domain status)

Each Organization detail view has tabs:
- **Overview** - summary stats, status toggle, deactivate
- **Branding** - logo, colors, tagline, login page message (live preview)
- **Currency & Locale** - currency, format, timezone, date/time format
- **Documents** - invoice/report/contract/quotation footer text editors
- **Email Settings** - from name, reply-to, signature
- **WhatsApp Settings** - business name, greeting, sign-off
- **Domain** - subdomain (read-only), custom domain with DNS verification UI
- **Admins** - list of Admins assigned to this Organization, create new

**Branding Form Components**
- File uploaders for logo, dark-logo, favicon (drag-drop, preview, validation)
- Color pickers with hex input and live preview against sample dashboard
- Currency configurator with live preview ("AED 1,234.56" updates as user changes settings)
- Rich text editor for document footers (Tiptap or similar)

**DNS Verification UI**
- Input custom domain
- System generates: "Add CNAME: crm.yourdomain.com → app.yourplatform.com" and "Add TXT: _verify.yourdomain.com → token-xxxxx"
- "Verify Now" button polls DNS
- Status badge: Pending / Verifying / Verified / Failed
- Success → SSL auto-provisioned via Vercel/Cloudflare API

### MODULE 1 - Admin & User Management

Standard user CRUD scoped to Organization. See Part 2 for governance rules. Schemas, RLS policies, and approval chains all enforce `organization_id` separation.

### MODULE 5 - AMC Engine (with Payment Reactivation)

When delayed payment arrives:
1. Postgres trigger detects payment clears outstanding (in Organization's currency)
2. Contract status → PENDING_REACTIVATION
3. Next-due service WO restored to visible state
4. Approval entry created (type: `amc_reactivation`)
5. `fn_resolve_approver` finds the Manager assigned to this AMC's scope
6. Manager receives notification (email/WhatsApp branded per Organization)
7. Manager approves → contract becomes ACTIVE, service proceeds
8. All notifications use Organization's branding (logo, email_from_name, WhatsApp templates)

### MODULE 6 - Work Order / Job Card System

**Entity** (with organization_id):
- WO Number (per-Organization sequence)
- Type, Linked source, Customer + Site
- Scheduled date/time
- Assigned users, required skills
- Materials allocated
- Priority, SLA target
- Current status

**Lifecycle**:
```
Created → Assigned → Accepted → In Transit → Checked In → Working
   → (Waiting Material | Waiting Customer) → Completed
   → Customer Approved → Closed
```

Mobile WO card uses Organization branding (colors, logo) and currency for any monetary values.

### MODULE 14 - Approval Workflow Engine

No hardcoded chains. Admin configures per-Organization. Postgres function `fn_resolve_approver(approval_type, requester_id, context)` dynamically finds the right approver based on requester's scope, team, and manager hierarchy.

All notification templates (in-app, WhatsApp, email) pull from Organization branding.

### Other Modules

Modules 2, 3, 4, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22 - all carry `organization_id`, all use Organization currency where money is involved, all use Organization branding where customer-facing.

---

## PART 10 - ROLE-BASED DASHBOARDS

All dashboards must work fully on 360px phone screens.

**Super Admin Dashboard** - Organizations, branding, currency, admin management, system audit logs, cross-org analytics

**Admin Dashboard** - User management, teams, approval chains, system config, audit logs (org-scoped), optional branding (if granted)

**Managing Director** - Strategic KPIs, top-tier escalations, high-value approvals, compliance alerts

**Manager** - Central Operations Feed (live field activity, today's schedule, escalations, approvals, SLA watch, customer sign-offs, material requests, forecasted risks, delayed items, repeat-failure assets)

**Sales** - Pipeline, quotations, AMC renewals, lead aging, communication timeline

**Pre-Sales / Estimator** - Quotation requests, BOQ templates, rate card, historical costing

**Lead Worker** - Crew, today's work orders, approvals, material requests, escalations

**Worker / Technician** - My Day, work orders, leave requests, approvals, mentions

**Driver** - Delivery work orders, vehicle stock, pickup tasks, route view

**Subcontractor** - Scope-bounded work orders

**Service Support** - Open repair tickets with SLA timers, callbacks, escalations

**Accounts** - Invoices, payments, AMC billing, outstanding aging, approval queue (in Organization currency)

**Customer (Phase 3)** - Active services, AMC schedule, communication timeline, self-service tickets

---

## PART 11 - DATABASE / ENTITY MODEL

```
Organization ──┬── Users (1:many) - every user belongs to one org
               ├── Customers (1:many)
               ├── Projects (1:many)
               ├── AMC_Contracts (1:many)
               ├── Repair_Tickets (1:many)
               ├── Work_Orders (1:many)
               ├── Assets (1:many)
               ├── Teams (1:many)
               ├── Approval_Chain_Configs (1:many)
               └── Branding_Storage (1:1 via storage bucket)

User ──┬── Team_Membership
       ├── Created_Users
       ├── Approval_Action
       ├── Notification_Preference
       ├── Audit_Log_Entry
       └── Manager_Of

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

Project ──┬── BOQ_Item (1:many) - with currency
          ├── Milestone (1:many)
          ├── Work_Order (1:many)
          ├── Material_Issue (1:many)
          ├── Document (1:many)
          ├── Variation_Order (1:many)
          ├── Invoice (1:many) - with currency
          ├── Communication_Thread (1)
          ├── Assigned_Manager (1)
          └── Approval (1:many)

AMC_Contract ──┬── Service_Schedule (1:4)
               │      └── Work_Order (1:1)
               ├── Free_Call (1:many)
               ├── Replacement_Invoice (1:many)
               ├── Payment_Record (1:many) - with currency
               ├── Reactivation_Approval (0:many)
               ├── Assigned_Manager (1)
               └── Covered_Asset (many:many)

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

Costing_Record ──┬── Linked_Project / Linked_Work_Order
                 ├── Manpower_Cost (in org currency)
                 ├── Material_Cost (in org currency)
                 ├── Subcontractor_Cost (in org currency)
                 ├── Transport_Cost (in org currency)
                 ├── Overtime_Cost (in org currency)
                 └── Profitability_Snapshot (in org currency)
```

Every financial entity has a `currency` column for safety against future currency changes.

---

## PART 12 - COSTING & PROFITABILITY ENGINE

Cost layers (all in Organization currency): manpower, subcontractor, material, transportation, overtime, equipment depreciation (Phase 3).

Profitability per Project, per Work Order, per Customer, per User. Real-time margin tiles displayed using Organization's `formatCurrency()`.

---

## PART 13 - AUTOMATION & BUSINESS RULES

**AMC**: auto-scheduling, payment-gated activation, automatic payment-arrival reactivation, renewal pipeline 60 days pre-expiry.

**SIRA & Compliance**: renewal alerts at 90/60/30/15 days.

**Work Orders**: status validation, auto-status from check-in/out, ETA recalculation, multi-visit chains.

**Materials**: free-call-to-invoice conversion, low-stock auto-reorder, consumption reconciliation.

**Scheduling**: double-booking prevention, smart reassignment, nightly forecasting.

**SLA & Escalation**: real-time countdowns, breach detection, auto-escalation.

**Approvals**: dynamic chain resolution, queue routing, stale auto-escalation.

**Notifications**: daily morning brief 7:30am, end-of-day timesheets, payment reminders.

**Asset Registry**: repeat-failure detection, warranty expiry alerts.

**Domain verification**: DNS polling every 5 min, SSL auto-provisioning on verification.

---

## PART 14 - NOTIFICATION STRATEGY

Three channels (in-app push, WhatsApp, email, SMS fallback). All templates pull from Organization branding (`email_from_name`, signature, WhatsApp templates). Smart batching, role-aware, configurable per user.

---

## PART 15 - KPIs

**Strategic (MD)**: Revenue by stream (org currency), AMC renewal rate, average margin, DSO, CLV, escalation rate, SLA compliance.

**Operational (Manager)**: Utilization, FCR, repair TAT, milestone-on-time, material wastage, AMC service-on-schedule, AMC reactivation TAT, SLA breach count, approval cycle time.

**Field (Lead Worker)**: Hours vs. estimate, rework rate, customer sign-off score, WO completion rate.

**Individual (Worker)**: Utilization, SLA compliance, customer rating, repeat-visit ratio.

**Customer**: Touch frequency, customer-specific SLA, AMC renewal probability, outstanding balance (org currency).

**Admin-Specific**: Active users by role, approval bottlenecks, system config changes.

**Super Admin-Specific**: Active organizations, growth metrics, system-wide audit volume.

---

## PART 16 - MOBILE PWA WORKER WORKFLOW

```
LOGIN → MY DAY → OPEN WORK ORDER
              → [NAVIGATE] [ACCEPT]
              → [CHECK-IN] (geo-stamped, photo)
              → WORK CHECKLIST
                → [ADD PHOTO] [SCAN ASSET] [LOG MATERIAL] [VOICE NOTE]
                → [REQUEST MATERIAL → approval] [REPORT BLOCKER]
                → [POST TO THREAD]
              → [MARK COMPLETED] → SERVICE REPORT (with org branding)
              → [CUSTOMER SIGNATURE] → Customer Approved
              → WO Closes
```

All UI uses Organization branding. All money values use Organization currency.

---

## PART 17 - AI & SMART AUTOMATION (PHASE 3+)

Intelligent technician recommendation, repair pattern recognition, AMC renewal probability score, quotation cost-AI, anomaly detection on BOQ consumption, voice-to-report, OCR for delivery notes, WhatsApp customer bot, predictive maintenance.

---

## PART 18 - PHASED ROADMAP

### Phase 1 (Months 1–4) - Foundation
- **Super Admin Console** (Organizations, branding, currency, admin management)
- **Multi-tenancy from day one** (organization_id on every table, RLS scoped)
- **Admin & User Management (full)**
- **Approval Chain Configuration UI**
- **Dynamic dashboard rendering by role + org**
- Customer & Site master
- Project module (basic)
- AMC module with payment-gated services + reactivation flow
- Work Order / Job Card System (full lifecycle)
- Approval Workflow Engine (core, admin-configured)
- Mobile PWA (work order execution)
- Manager Central Operations Feed (Phase 1)
- Branded PDF generation (invoices, service reports)
- Branded email & WhatsApp templates
- Custom domain support with DNS verification
- All role dashboards phone-responsive
- Asset Registry (basic)

### Phase 2 (Months 5–8) - Operational Intelligence
- Repair module
- SLA Engine
- Escalation Matrix
- Leave Request & Smart Reassignment
- Internal Communication Threads
- Inventory & material reconciliation
- SIRA compliance tracker
- Subcontractor lite
- Document repository
- Reporting v1
- Customer WhatsApp notifications
- i18n scaffolding (Arabic RTL support)

### Phase 3 (Months 9–12) - Forecasting + Strategic
- Costing & Profitability Engine (full)
- Customer Communication Timeline (unified)
- Resource Forecasting (rule-based)
- Central Operations Feed v2
- Advanced reports
- AMC renewal pipeline
- Customer portal v1
- NPS feedback
- Multi-language UI (Arabic, Hindi, Tamil)

### Phase 4 (Months 13+) - Platform & AI
- Multi-country/multi-currency reporting (cross-Organization for Super Admin)
- Vendor portal
- AI features
- Voice-first MD interface
- Predictive maintenance
- External integrations (Tally/Zoho/SIRA)
- SaaS productization (self-service trial, Stripe billing, status page)

---

## PART 19 - NON-FUNCTIONAL REQUIREMENTS

**Performance**: PWA load <3s on 4G, dashboards <1s, realtime <2s, Central Ops Feed handles 500+ live WOs.

**Security**:
- Supabase RLS on every table from day one
- All policies scope-aware (`organization_id` + user scope)
- JWT auth with refresh tokens
- Storage policies mirror DB RLS
- Server-side validation regardless of RLS
- Full audit log on all modifications
- Dedicated `super_admin_audit_log` and `admin_audit_log` tables
- 2FA mandatory for Super Admin, Admin; optional for MD/Manager/Accounts

**Offline (Field PWA)**: Full offline work order execution, IndexedDB queuing, optimistic UI, server-wins conflict resolution.

**Localization**: Phase 1 English, Phase 2 Arabic (RTL), Phase 3 Hindi/Tamil/Urdu. Per-user language preference.

**Responsive Breakpoints (Universal)**:
- 360–480px (primary)
- 481–768px
- 769–1024px
- 1025px+

**Mobile-First Design**: every screen at 360px first; no desktop-only features; tables become cards; tap targets 44×44px minimum; PWA installable for all roles.

**Browser Support**: Chrome 90+, Safari 14+, Edge 90+, Firefox 90+.

---

## PART 20 - DEVELOPMENT PRINCIPLES

1. **Super Admin bootstraps the system** - seeded via DB migration on Day 1
2. **Multi-tenant from day one** - `organization_id` on every table, scoped RLS policies
3. **Per-Organization branding & currency applied everywhere** - single utilities, no inline formatting
4. **Role-based + scope-based everything** - UI, data access, approvals, escalations
5. **Supabase RLS from day one** - never retrofit security
6. **Business logic split sensibly**: Postgres for data-bound rules; Node.js for orchestration
7. **PostgreSQL views power dashboards** - scope-filtered automatically
8. **Proper indexing**: `organization_id`, `user_id`, `role`, `team_id`, `manager_id`, scope fields
9. **Two environments**: staging and production
10. **Migrations via Supabase CLI** - no manual GUI changes
11. **Audit log everything** - Super Admin actions, Admin actions, approvals, escalations, status changes
12. **API-first**, **Mobile-first**, **Real-time where it matters**
13. **Configurable, never hard-coded** - approval chains, SLA targets, escalation timers, branding, currency all in DB
14. **One `formatCurrency()` utility** - components never format money inline
15. **The Super Admin's UI deserves the same design quality as the field worker's UI**

---

## PART 21 - SUPABASE STORAGE STRUCTURE

```
organization-branding/{org_id}/
  logo.{ext}
  logo-dark.{ext}
  favicon.{ext}

admin/
  user-profile-photos/
  audit-exports/

project-documents/{org_id}/{project_id}/
  drawings/ boq/ sira/ photos/ service-reports/ handover/

amc-documents/{org_id}/{amc_contract_id}/
  contracts/ service-reports/ invoices/ reactivation-approvals/

repair-tickets/{org_id}/{ticket_id}/
  photos/ reports/

work-orders/{org_id}/{wo_id}/
  photos/ signatures/ voice-notes/ documents/

asset-registry/{org_id}/{asset_id}/
  install-photos/ service-photos/ docs/

communication/{org_id}/{thread_id}/
  attachments/

approvals/{org_id}/{approval_id}/
  supporting-docs/

compliance/{org_id}/
  sira-certificates/ trade-license/ insurance/ visas/

customer-comms/{org_id}/{customer_id}/
  attachments/
```

All buckets enforce RLS scoped by `organization_id`. Logo bucket has public-read for login pages.

---

## PART 22 - DEFINITION OF DONE

1. RLS policies (scope-aware, `organization_id`-aware) written, tested, reviewed
2. Migration committed and applied to staging
3. Frontend works on 360px phone for every role
4. Tablet and desktop layouts verified
5. Offline behavior tested
6. Realtime updates verified
7. Audit log entries confirmed (both super_admin and admin tables)
8. Notifications fire correctly across all channels (with org branding)
9. SLA tracking integrated
10. Escalation triggers tested
11. Approval workflow tested with dynamic approver resolution
12. Super Admin can create Organizations, configure branding, manage Admins
13. Admin can create users, assign roles, configure approval chains
14. Login as different roles renders correct dashboards with correct branding/currency
15. Custom domain DNS verification tested
16. PDF generation uses correct Organization branding and currency
17. Edge cases tested (no signal, conflicts, race conditions, cross-org isolation)
18. Seed data realistic (one Super Admin, one Installtec Organization, sample users)
19. User guides per role with phone + desktop screenshots

---

## PART 23 - DELIVERABLES EXPECTED

1. **Database schema** - complete DDL, indexes, scope-aware RLS, triggers (including AMC reactivation), views, functions (`fn_resolve_approver`, `fn_handle_amc_payment_received`)
2. **Multi-tenancy enforced** - `organization_id` on every operational table, verified RLS prevents cross-org data leaks
3. **Node.js API service** with OpenAPI documentation
4. **Next.js PWA frontend** with dynamic role-based + Organization-based rendering
5. **Super Admin Console** - full Organizations / branding / currency / admin management
6. **Admin Management UI** - full user/role/permission/approval-chain control
7. **Mobile PWA installable** for all roles
8. **Central Operations Feed** demonstrating scope-filtered live updates
9. **Work Order lifecycle** with audit trail
10. **Approval Workflow Engine** with admin-configured chains and dynamic resolution
11. **AMC payment reactivation flow** end-to-end
12. **Escalation Matrix** with manager-hierarchy-aware paths
13. **SLA Engine** with real-time countdowns
14. **Smart Reassignment** with skill/availability matching
15. **Customer Communication Timeline** unified across channels
16. **Resource Forecasting** with 4 forecast types
17. **Asset Registry** with serial-number scan
18. **Costing & Profitability** dashboard (in Organization currency)
19. **Internal Communication Threads** on every major entity
20. **Notification system** WhatsApp + Email + SMS + Push (with Organization branding)
21. **Branded PDF generation** for invoices, service reports, AMC contracts, quotations
22. **Custom domain support** with DNS verification UI
23. **Role-based access** verified for all configured roles
24. **Phone-responsive parity** screenshots for every role
25. **Offline mode** end-to-end
26. **Seed data** - initial Super Admin, sample Installtec Organization, sample users in each role
27. **User documentation** per role with phone screenshots
28. **Super Admin operations guide** for Organization provisioning
29. **Admin operations guide** for user/permission/configuration management
30. **Migration plan** for existing Installtec data

---

## PART 24 - THE THREE TRUTHS TO INTERNALIZE

1. **The Super Admin is the system's seed; the Admin is the organization's foundation.** Super Admin creates Organizations and Admins. Admin creates everyone else. Every user, every permission, every approval chain flows from this hierarchy. Build both Super Admin and Admin UIs with the same care as the field worker UI.

2. **The system is multi-tenant from day one - even if Installtec is the only customer right now.** Every table has `organization_id`. Every query scopes by it. Every screen applies that Organization's branding and currency. This is what makes it sellable, portable, and future-proof.

3. **Phone-first for everyone.** Every role, every screen, every workflow must work one-handed on a 6-inch screen - Super Admin configuring an Organization, Manager approving an AMC reactivation, Worker checking in to a site.

---

## PART 25 - EXPLICIT EXCLUSIONS

- Knowledge Base / SOP Module
- Full HR/payroll system
- Full inventory ERP
- Customer marketing automation
- Heavy financial reporting (Tally/Zoho integration in future)
- E-commerce or product catalog
- Automatic currency conversion (deliberately excluded - finance integration concern)

**The system's focus is**: operational visibility, workforce coordination, scheduling, execution tracking, proactive issue management, and converting field activity into measurable, billable, profitable work - all delivered through a multi-tenant, white-labeled platform that lets Installtec grow today and serve other companies tomorrow.

---

**Build this system. Build it well. Build it Super-Admin-foundational, multi-tenant-aware, brand-faithful, currency-correct, phone-first, and AMC-strategic.**

---

*End of Master Build Prompt v6. This document is the single source of truth for the Installtec CRM & Operations Management System build.*
