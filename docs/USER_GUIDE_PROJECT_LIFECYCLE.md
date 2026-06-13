\

\

**SIRAH DIGITAL**

*[ Logo placeholder — add public/sirah-digital-logo.png ]*

\

\

# Project Lifecycle User Guide

### A complete guide for managing projects from creation to closure

\

\

**Prepared by:** Sirah Digital

**Prepared for:** Installtec

**Version:** 1.0

**Date:** 13 June 2026

\

\

> **Confidentiality Notice**
>
> This document is confidential and proprietary. It is prepared by Sirah Digital for the exclusive use of Installtec and may not be copied, distributed, or disclosed to any third party without prior written consent.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# Table of Contents

1. **Introduction**
   - 1.1 About This Guide
   - 1.2 Intended Audience
   - 1.3 Document Conventions
2. **Getting Started**
   - 2.1 Accessing the System
   - 2.2 The Main Dashboard
   - 2.3 Mobile Access for Field Workers
3. **System Overview**
   - 3.1 The 7-Phase Project Lifecycle
   - 3.2 User Roles and Responsibilities
   - 3.3 Notification System
4. **Creating a Project**
   - 4.1 Projects List
   - 4.2 Starting a New Project
   - 4.3 Project Information
   - 4.4 Auto-Generated Project Code
   - 4.5 Project Detail View
5. **Phase 1 — Design**
6. **Phase 2 — Material Supply**
7. **Phase 3 — Installation**
8. **Phase 4 — Testing & Commissioning**
9. **Phase 5 — Handover**
10. **Phase 6 — DLP (Defects Liability Period)**
11. **Phase 7 — Closed**
12. **Notifications**
13. **User Roles and Permissions**
14. **Phase Gate System**
15. **Mobile Use for Field Workers**
16. **Audit Trail and History**
17. **Troubleshooting**
18. **Glossary**
19. **Support**

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 1. Introduction

## 1.1 About This Guide

This guide explains how Installtec manages the complete lifecycle of installation projects, from initial creation through final closure. The system enforces a structured 7-phase workflow that ensures quality, compliance, and customer satisfaction at every stage.

Each phase has its own purpose, deliverables, and quality checkpoints. By following the workflow described in this guide, your team can deliver projects consistently and keep every stakeholder informed of progress in real time.

## 1.2 Intended Audience

This guide is written for everyone who takes part in delivering a project:

- **Operations Manager** — primary project oversight and approvals
- **Lead Technician** — on-site project execution and team management
- **Field Worker** — task execution at customer sites
- **Sales** — project visibility and customer communication
- **Managing Director** — strategic oversight and high-value approvals

The language is kept clear and practical so that both office management and field teams can use it.

## 1.3 Document Conventions

The following conventions are used throughout this guide:

- **Bold text** indicates a user-interface element, such as a button, field, or tab name.
- *Italic text* indicates emphasis or a figure caption.
- Screenshots illustrate each major step in the workflow.
- Notes provide additional context where helpful.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 2. Getting Started

## 2.1 Accessing the System

![Login screen](docs/screenshots/lifecycle/01_login.png){width=6in}

*Figure 2.1: Login Screen*

Open the application URL in any modern web browser. The system is accessible from desktop computers, tablets, and mobile phones, allowing both office staff and field workers to use the same platform. Enter your email address and password, then select **Sign in**.

## 2.2 The Main Dashboard

![Operations dashboard](docs/screenshots/lifecycle/02_dashboard.png){width=6in}

*Figure 2.2: Operations Dashboard*

After logging in, the dashboard displays a summary of active projects, upcoming tasks, and recent activity. Quick-access tiles help you navigate to the most important areas of the system.

## 2.3 Mobile Access for Field Workers

The system is fully mobile-responsive, allowing field technicians to use it on phones while at customer sites. Key mobile-friendly features include:

- View assigned tasks for the day
- Update task status directly from site
- Capture photos using the device camera for installation documentation
- Receive notifications about new assignments
- Mark tasks as complete with timestamp evidence

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 3. System Overview

## 3.1 The 7-Phase Project Lifecycle

Every Installtec project progresses through seven defined phases, each with specific workflows, approval requirements, and quality gates:

| Phase | Purpose | Key Outputs |
|-------|---------|-------------|
| 1. Design | Equipment list, drawings, budget | Material Submittal, Shop Drawing, JCA |
| 2. Material Supply | Procurement of approved equipment | Delivered materials |
| 3. Installation | Physical installation at site | Completed installation tasks |
| 4. Testing & Commissioning | System testing and customer acceptance | Acceptance Certificate |
| 5. Handover | Document delivery to customer | Handover documents |
| 6. DLP | Warranty period | Resolved defect tickets |
| 7. Closed | Project archive | Closure summary |

## 3.2 User Roles and Responsibilities

The system supports several user roles, each with specific access and capabilities:

- **Administrator** — system configuration and user management
- **Managing Director** — strategic approvals and oversight
- **Founder** — top-tier approvals for high-value items
- **Operations Manager** — day-to-day project management
- **Lead Technician** — on-site execution leadership
- **Worker** — task execution and reporting
- **Sales** — customer-facing visibility

## 3.3 Notification System

The system sends real-time notifications when:

- A worker is assigned to a new task
- A project advances to a new phase
- An approval is required
- A material submittal is approved
- A document needs review

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 4. Creating a Project

## 4.1 Projects List

![Projects listing](docs/screenshots/lifecycle/03_projects_list.png){width=6in}

*Figure 4.1: Projects Listing*

The **Projects** page shows all active and historical projects, with filters for phase, status, customer, and date range. Each project displays its current phase, customer, and key metrics.

## 4.2 Starting a New Project

![New project form, empty](docs/screenshots/lifecycle/04_new_project_empty.png){width=6in}

*Figure 4.2: New Project Form (Empty)*

Select **New Project** to open the project creation form.

## 4.3 Project Information

![New project form, filled](docs/screenshots/lifecycle/05_new_project_filled.png){width=6in}

*Figure 4.3: New Project Form (Filled)*

Provide the required information:

- **Job Name** — a descriptive project title
- **Customer** — selected from the customer database
- **Lead Technician** — the primary technical contact
- **Contract Value** — the total project value in AED
- **Scope Description** — a summary of the project scope
- **Start Date** and **Expected Completion**

## 4.4 Auto-Generated Project Code

![Project created](docs/screenshots/lifecycle/06_after_create_attempt.png){width=6in}

*Figure 4.4: Project Created*

Upon save, the system automatically generates a unique project code in the format **PRJ-YYYY-NNNN** (for example, *PRJ-2026-0042*). This code is used throughout all communications and reports.

## 4.5 Project Detail View

![Project detail view](docs/screenshots/lifecycle/07_project_detail.png){width=6in}

*Figure 4.5: Project Detail View*

After creation, the project detail page shows:

- A phase tracker with the current phase highlighted
- Customer and contract information
- Phase-specific cards (Design tasks, Material Supply, and so on)
- A financial summary
- Team assignments
- Recent activity

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 5. Phase 1 — Design

## 5.1 Design Phase Overview

The Design phase establishes the technical and commercial foundation for the project. Three deliverables must be completed:

1. **Material Submittal** — the equipment list for client approval
2. **Shop Drawing** — the technical drawings for client approval
3. **Job Cost Analysis (JCA)** — the internal budget and profit plan

The project cannot advance to Material Supply until all three deliverables are approved.

## 5.2 Material Submittal

![Material Submittal page](docs/screenshots/lifecycle/08_design_material_submittal.png){width=6in}

*Figure 5.1: Material Submittal Page*

The **Material Submittal** lists all equipment required for the project. Each line item includes:

- Description
- Model number
- Quantity
- Specifications

The submittal goes through an approval workflow before it becomes the basis for procurement.

## 5.3 Shop Drawing

![Shop Drawing page](docs/screenshots/lifecycle/09_design_shop_drawing.png){width=6in}

*Figure 5.2: Shop Drawing Page*

Technical drawings show camera positions, cable routing, equipment placement, and installation layout. Drawings are uploaded as PDF or image files and are version-controlled.

Each drawing records:

- Drawing title and number
- Revision tracking
- Client comments
- Approval status

## 5.4 Job Cost Analysis (JCA)

![Job Cost Analysis](docs/screenshots/lifecycle/10_design_jca.png){width=6in}

*Figure 5.3: Job Cost Analysis*

The JCA is the internal budget breakdown, showing:

- Material costs
- Subcontractor costs
- Direct labor costs
- Other charges
- Total estimated cost
- Expected profit margin

The JCA is for internal use, helping the team track project profitability.

## 5.5 Phase Advancement

![Phase advance confirmation](docs/screenshots/lifecycle/11_phase_advance_confirm.png){width=6in}

*Figure 5.4: Phase Advance Confirmation*

Once the Design deliverables are complete, the Operations Manager selects **Move to Material Supply**. A confirmation message verifies that all gate requirements are met before the project advances.

If any requirement is not met, the system displays a clear message explaining what must be completed first.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 6. Phase 2 — Material Supply

## 6.1 Material Supply Overview

![Material Supply page](docs/screenshots/lifecycle/12_material_supply.png){width=6in}

*Figure 6.1: Material Supply Page*

The Material Supply phase tracks the procurement of approved equipment, from supplier to site delivery.

## 6.2 Auto-Seeded Items

When the project enters Material Supply, the system automatically creates a tracking row for each item from the approved Material Submittal. This ensures that every approved item is procured.

## 6.3 Material Status Workflow

Each material line progresses through these statuses:

- **Not Ordered** — the initial state
- **Ordered** — a purchase order has been issued to the supplier
- **Received at Warehouse** — the material has arrived at the warehouse
- **Delivered to Site** — the material has been delivered to the project site
- **Cancelled** — the material is no longer required
- **Issue** — a quality or delivery problem requiring attention

## 6.4 Phase Gate to Installation

The project cannot advance to Installation until **all** materials are marked **Delivered to Site** or **Cancelled**. This ensures the installation team has everything it needs before work begins.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 7. Phase 3 — Installation

## 7.1 Installation Phase Overview

![Installation page](docs/screenshots/lifecycle/13_installation.png){width=6in}

*Figure 7.1: Installation Page*

The Installation phase tracks physical work at the customer site, broken down into manageable tasks organized by zone.

## 7.2 Zone-Grouped Task Management

Tasks are organized by physical location at the customer site, for example:

- **Zone A** — Reception Area
- **Zone B** — Parking Lot
- **Zone C** — Office Floor 1
- **Zone D** — Office Floor 2

This organization matches how field teams actually work and provides clear progress tracking per area.

## 7.3 Task Creation

The Lead Technician creates tasks based on the project scope and approved drawings. Each task includes:

- **Zone** — the location at site
- **Title** — what needs to be done
- **Category** — for example, Device Mounting, Cabling, Configuration, or Testing
- An optional link to a specific delivered material
- The assigned worker

## 7.4 Task Status Workflow

Each task moves through these statuses:

- **Pending** — not yet started
- **In Progress** — a worker is actively working on it
- **Completed** — successfully finished
- **Blocked** — cannot proceed (with notes explaining why)
- **Not Applicable** — determined not to be needed

## 7.5 Photo Documentation

Workers capture photos at each task using their mobile device camera. Photos serve as:

- Proof of completion for billing
- Quality documentation
- Warranty reference
- Customer reassurance

## 7.6 Blocked Tasks

When a task cannot proceed, the worker marks it **Blocked** with a note explaining the issue. This visibly flags issues that require supervisor intervention.

## 7.7 Phase Gate to Testing

All installation tasks must be **Completed** or **Not Applicable** before the project can advance to Testing & Commissioning.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 8. Phase 4 — Testing & Commissioning

## 8.1 T&C Phase Overview

![Testing and commissioning page](docs/screenshots/lifecycle/14_tc.png){width=6in}

*Figure 8.1: Testing & Commissioning Page*

The Testing & Commissioning phase covers the customer walkthrough, defect tracking, and formal acceptance.

## 8.2 Snagging List

During the customer walkthrough, any defects or issues are recorded as snagging items with:

- The zone where the issue was found
- A description of the issue
- Severity (**Low**, **Medium**, **High**, or **Critical**)
- Photos
- The assigned worker for resolution

The snagging workflow is: **Open → In Progress → Fixed → Verified**.

## 8.3 Per-Zone Customer Sign-Off

The customer signs off on each zone separately, recording:

- Customer name
- Email (optional)
- Sign-off date
- Notes
- A confirmation checkbox

## 8.4 Acceptance Certificate

Once all zones are signed and all snagging items are resolved, the system generates a formal **Acceptance Certificate** with an auto-numbered format (**AC-YYYY-NNNN**). This document serves as proof of customer acceptance.

## 8.5 Phase Gate to Handover

The project cannot advance to Handover until:

- **All** zones have customer sign-off
- There are **zero** open or in-progress snagging items
- The Acceptance Certificate has been generated

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 9. Phase 5 — Handover

## 9.1 Handover Phase Overview

![Handover page](docs/screenshots/lifecycle/15_handover.png){width=6in}

*Figure 9.1: Handover Page*

The Handover phase formally delivers the project documentation to the customer.

## 9.2 Document Categories

Five document categories may be provided:

- **Drawings** — as-built drawings showing the actual installation
- **Manuals** — equipment user manuals and operation guides
- **Certificates** — warranty certificates and compliance documents
- **Warranty** — warranty terms and service contact information
- **Other** — any additional documents

Four categories are mandatory: **Drawings**, **Manuals**, **Certificates**, and **Warranty**.

## 9.3 Handover Checklist

![Document upload](docs/screenshots/lifecycle/16_handover_upload_form.png){width=6in}

*Figure 9.2: Document Upload*

A standard checklist of six mandatory items must be completed:

- As-built drawings provided
- Equipment manuals provided
- Warranty certificates issued
- Testing & Commissioning Certificate
- Warranty terms documented
- Asset register provided

## 9.4 Document Upload

Documents are uploaded by category, with metadata. The upload supports:

- File-type validation (PDF, Office documents, and images)
- A 25 MB size limit per file
- Automatic version tracking
- Secure storage with access controls

## 9.5 Customer Sign-Off

Once all mandatory items are complete and at least one document exists in each required category, the customer signs off on the handover by providing:

- Customer name and email
- Sign-off date
- A confirmation checkbox

Upon sign-off, the project's handover completion timestamp is recorded, which starts the DLP warranty period.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 10. Phase 6 — DLP (Defects Liability Period)

## 10.1 DLP Phase Overview

![DLP page](docs/screenshots/lifecycle/17_dlp.png){width=6in}

*Figure 10.1: DLP Page*

The DLP phase is the warranty period during which any defects are repaired at no charge to the customer. The default DLP duration is 12 months from handover completion.

## 10.2 DLP Countdown

The system displays:

- Days remaining until the DLP expires
- The DLP start date (the handover completion date)
- The DLP end date (calculated automatically)
- A configurable DLP duration per project

## 10.3 Defect Tickets

When the customer reports an issue during DLP, the team can:

- Create a ticket with a description and severity
- Upload photos showing the issue
- Assign the ticket to a worker
- Track resolution through the workflow: **Open → In Progress → Fixed → Verified → Closed**

## 10.4 Resolution Tracking

Each ticket maintains:

- A description of the issue
- Photos (before and after)
- The assigned worker
- Resolution notes
- The resolution date
- Customer satisfaction confirmation

## 10.5 Phase Gate to Closed

The project can only advance to Closed when:

- The DLP duration has elapsed (12 months by default)
- **All** DLP tickets are in **Closed** status

This prevents prematurely closing a project that still has unresolved warranty issues.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 11. Phase 7 — Closed

## 11.1 Project Closure Overview

![Closed page](docs/screenshots/lifecycle/18_closed.png){width=6in}

*Figure 11.1: Closed Page*

The Closed phase represents formal project completion, with full documentation archived and read-only access.

## 11.2 Closure Checklist

A 10-item closure checklist must be completed:

- Final invoice issued and paid
- All warranty items closed
- Final documentation delivered
- Customer satisfaction confirmed
- Retention released (if applicable)
- Asset register finalized
- Equipment manuals delivered
- Service contracts established
- Project files archived
- Final cost reconciled

## 11.3 Financial Summary

A read-only summary shows:

- Final Total Cost
- Total Invoiced to Customer
- Total Received from Customer
- Total Paid Out (vendors, payroll, expenses)
- Profitability calculation

## 11.4 Read-Only Archive

Once a project is closed, all previous phase pages become read-only:

- No new tasks can be added
- No status changes are allowed
- Documents remain viewable but cannot be modified
- The audit trail is preserved permanently

## 11.5 Reopening Closed Projects

Only **Administrators** and **Managing Directors** can reopen a closed project. Reopening returns the project to its previous phase (DLP), and all edits are tracked in the audit history.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 12. Notifications

## 12.1 In-App Notifications

![Notification bell dropdown](docs/screenshots/lifecycle/19_notifications_dropdown.png){width=6in}

*Figure 12.1: Notification Bell Dropdown*

The notification bell in the top navigation shows unread notifications with a count badge. Select it to view your recent notifications.

## 12.2 Notification Types

The system sends real-time notifications for:

- New work order assignments (worker)
- Phase advancement (lead technician)
- Material submittal approval (project team)
- Approval requests (manager, MD, founder)
- DLP ticket assignments (worker)
- Document upload required (relevant role)

## 12.3 Notifications Page

![Full notifications page](docs/screenshots/lifecycle/20_notifications_page.png){width=6in}

*Figure 12.2: Full Notifications Page*

Select **View All** to see the complete notification history, with the ability to:

- Filter by type
- Filter by date
- Mark as read
- Click to navigate to the source

## 12.4 Real-Time Updates

Notifications appear instantly without a page refresh, ensuring users see new assignments as soon as they occur.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 13. User Roles and Permissions

## 13.1 Permission Matrix

| Action | Admin | MD | Manager | Lead Tech | Worker | Sales |
|--------|-------|----|---------|-----------|--------|-------|
| Create Project | Yes | Yes | Yes | No | No | No |
| Advance Phase | Yes | Yes | Yes | Limited | No | No |
| Approve Material Submittal | Yes | Yes | Yes | No | No | No |
| Create Tasks | Yes | Yes | Yes | Yes | No | No |
| Update Task Status | Yes | Yes | Yes | Yes | Own only | View |
| Upload Documents | Yes | Yes | Yes | Yes | Limited | No |
| Generate Certificates | Yes | Yes | Yes | No | No | No |
| Close Project | Yes | Yes | No | No | No | No |
| Reopen Project | Yes | Yes | No | No | No | No |

## 13.2 Field Worker Capabilities

Workers have focused, mobile-optimized access. They can:

- View tasks assigned to them
- Update the status of their tasks
- Capture photos at site
- Mark tasks complete with timestamps

Workers cannot edit other workers' tasks.

## 13.3 Mobile vs. Desktop Access

- **Desktop** — all features available, optimized for office staff
- **Mobile** — optimized for field workers and quick approvals
- All roles can access the system from any device

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 14. Phase Gate System

## 14.1 What Are Phase Gates?

Phase gates are quality checkpoints that prevent a project from advancing until specific conditions are met. They ensure work quality and prevent critical steps from being skipped.

## 14.2 Built-In Enforcement

Phase gates are enforced by the system itself, not just by the screen you see. This means they cannot be bypassed through web-address manipulation or interface tricks, providing absolute assurance that quality standards are maintained on every project.

## 14.3 Common Gate Requirements

| From | To | Requirements |
|------|----|--------------|
| Design | Material Supply | All 3 design deliverables approved |
| Material Supply | Installation | All materials delivered or cancelled |
| Installation | T&C | All tasks completed or not applicable |
| T&C | Handover | All zones signed, no open snags |
| Handover | DLP | Handover certificate signed |
| DLP | Closed | DLP period elapsed, all tickets closed |

## 14.4 What To Do When a Gate Blocks Advancement

The system displays a clear message listing what needs to be completed. Review each requirement, complete the necessary actions, and then retry the phase advance.

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 15. Mobile Use for Field Workers

## 15.1 Mobile-Friendly Features

- Touch-optimized buttons (minimum 44-pixel tap targets)
- Bottom-sheet modals for easy thumb access
- Photo capture from the device camera
- Native phone integrations
- Offline viewing of cached data

## 15.2 Photo Capture

The system uses the device camera directly for installation documentation:

- Take photos in landscape or portrait
- Automatic compression for upload
- A timestamp embedded in the metadata
- Each photo linked to a specific task

## 15.3 Task Status Updates from Site

Workers can update task status directly from site:

- Start a task on arrival
- Mark it complete on finishing
- Block a task if an issue is found

All updates are timestamped automatically.

## 15.4 Native Phone Integrations

- Tap a customer phone number to call
- Tap a site address to open maps
- Camera integration for photos

## 15.5 Best Practices for Field Use

- Charge your phone before site visits
- Test your mobile data connection
- Sync notifications regularly
- Take photos with good lighting
- Mark tasks complete immediately

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 16. Audit Trail and History

## 16.1 Append-Only History

Every action in the project lifecycle is recorded in an append-only audit trail. This means:

- Records can never be deleted
- Records can never be modified after creation
- A full history is preserved for compliance

## 16.2 Who Can See Audit Trails

Audit trails are accessible to:

- **Administrators** (full access)
- **Managing Director** (full access)
- **Operations Manager** (operational records)

Audit logs cannot be edited by anyone.

## 16.3 What Gets Logged

- Project creation, edits, and phase advancement
- Task creation, status changes, and assignments
- Document uploads and downloads
- Approval actions
- Customer sign-offs
- Phase gate decisions
- All financial transactions

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 17. Troubleshooting

## 17.1 Cannot Advance to the Next Phase

- Read the system message — it lists the exact requirements
- Check that all required documents are uploaded
- Verify that the approval workflow is complete
- Ensure all tasks and items are in the correct status

## 17.2 Material Submittal Not Approving

- Check that the approver has logged in and reviewed it
- Verify that all required line items are present
- Confirm that the approver has the appropriate permissions

## 17.3 Cannot Mark a Task Complete

- Only the assigned worker can update their own tasks
- A Manager or Lead Technician can update any task
- The task must be in an active status (not Cancelled)

## 17.4 Photo Upload Fails

- Check the file size (25 MB limit)
- Verify that mobile camera permissions are enabled
- Try smaller-resolution photos
- Ensure a stable internet connection

## 17.5 Notification Not Received

- Refresh the page in your browser
- Check that the user has the correct role permissions
- Verify that the notification system is enabled

## 17.6 Cannot Reopen a Closed Project

- Only **Admin** and **MD** roles can reopen projects
- Contact your administrator for reopen requests

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 18. Glossary

| Term | Definition |
|------|------------|
| Acceptance Certificate | Formal customer acceptance document |
| Audit Trail | Immutable record of all changes |
| BOM | Bill of Materials |
| DLP | Defects Liability Period (warranty) |
| ELV | Extra Low Voltage |
| JCA | Job Cost Analysis (internal budget) |
| NVR | Network Video Recorder |
| Phase Gate | Quality checkpoint between phases |
| PRJ | Project code prefix |
| Shop Drawing | Technical installation drawing |
| Snagging | List of defects to fix |
| Submittal | Equipment list for client approval |
| T&C | Testing & Commissioning |
| Warranty | DLP coverage period |

```{=openxml}
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
```

# 19. Support

For technical issues with the system, contact Sirah Digital through your designated support channel.

---

*Confidential and Proprietary. Prepared by Sirah Digital for Installtec. Version 1.0.*
