// ============================================================
// Lifecycle screenshot flow — shared by the desktop and mobile specs.
//
// Logs in as the Operations Manager and walks the full project lifecycle
// (Sections A–I from the brief). It is BEST-EFFORT: phase advancement in
// the real app is gated (approvals, deliveries, elapsed DLP windows…), so
// rather than forcing one project through every gate, we:
//   • fully capture login → dashboard → list → create-project flow, then
//   • discover a real project and screenshot each phase PAGE by URL, and
//   • opportunistically open the primary modal/form on each phase.
//
// Every interaction is wrapped so a failure only skips that one capture.
// `folder` controls the output subdir: "lifecycle" or "lifecycle-mobile".
// ============================================================

import type { Page } from "@playwright/test";
import {
  ACCOUNTS,
  makeShot,
  section,
  signIn,
  clickByText,
  captureModal,
  fillField,
  getAnyProjectId,
  capturePhasePage,
} from "./helpers";

export async function lifecycleFlow(page: Page, folder: string): Promise<void> {
  const shot = makeShot(page, folder);
  const acct = ACCOUNTS.manager;

  // ── Section A — Project creation ─────────────────────────
  await section("A · Login & project creation", async () => {
    await signIn(page, acct, shot, { loginShot: "login" });
    await page.goto("/dashboard");
    await shot("dashboard");

    await page.goto("/projects");
    await shot("projects_list");

    if (await clickByText(page, /New Project/i)) {
      await page.waitForTimeout(800);
      await shot("new_project_empty", { fullPage: false });

      await fillField(page, "Job name", "Marina Bay Office Tower — Office CCTV");
      await fillField(page, "Contract value", "250000");
      await fillField(page, "Scope description", "Office CCTV Installation");
      await shot("new_project_filled", { fullPage: false });

      // Customer / Lead Technician are required <Select>s sourced from
      // existing rows — submission may fail if none exist. Attempt it,
      // then capture whatever state results (created detail OR the form
      // with validation messaging).
      await clickByText(page, /Create job/i);
      await page.waitForTimeout(1500);
      await shot("after_create_attempt");
      await page.keyboard.press("Escape").catch(() => {});
    }
  });

  // ── Locate a project to drive Sections B–H ───────────────
  let projectId: string | null = null;
  await section("· locate a project for the phase walk-through", async () => {
    projectId = await getAnyProjectId(page);
    if (projectId) {
      await shot("project_detail");
      console.log(`  ·   walking phases for project ${projectId}`);
    } else {
      console.log("  ·   no projects found — phase Sections B–H will be skipped");
    }
  });

  // ── Section B — Phase 1 Design ───────────────────────────
  await section("B · Phase 1 — Design", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "material-submittal", "design_material_submittal");
    await captureModal(page, shot, /Create material submittal|Add Material/i, "design_material_submittal_form");

    await capturePhasePage(page, shot, projectId, "shop-drawing", "design_shop_drawing");
    await captureModal(page, shot, /Create shop drawing|Upload Files/i, "design_shop_drawing_form");

    await capturePhasePage(page, shot, projectId, "jca", "design_jca");

    // Phase advance lives on the project detail page (the "Move to …"
    // stepper button → confirm modal).
    await page.goto(`/projects/${projectId}`);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await captureModal(page, shot, /Move to|Set Phase/i, "phase_advance_confirm");
  });

  // ── Section C — Phase 2 Material Supply ──────────────────
  await section("C · Phase 2 — Material Supply", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "material-supply", "material_supply");
    await captureModal(page, shot, /Add material/i, "material_supply_add_form");
  });

  // ── Section D — Phase 3 Installation ─────────────────────
  await section("D · Phase 3 — Installation", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "installation", "installation");
    await captureModal(page, shot, /Add task/i, "installation_add_task_form");
  });

  // ── Section E — Phase 4 Testing & Commissioning ──────────
  await section("E · Phase 4 — Testing & Commissioning", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "tc", "tc");
    await captureModal(page, shot, /Add snagging item/i, "tc_add_snag_form");
  });

  // ── Section F — Phase 5 Handover ─────────────────────────
  await section("F · Phase 5 — Handover", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "handover", "handover");
    await captureModal(page, shot, /Upload/i, "handover_upload_form");
  });

  // ── Section G — Phase 6 DLP ──────────────────────────────
  await section("G · Phase 6 — DLP (Defects Liability Period)", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "dlp", "dlp");
    await captureModal(page, shot, /Report ticket/i, "dlp_ticket_form");
  });

  // ── Section H — Phase 7 Closed ───────────────────────────
  await section("H · Phase 7 — Closed", async () => {
    if (!projectId) return;
    await capturePhasePage(page, shot, projectId, "closed", "closed");
  });

  // ── Section I — Notifications ────────────────────────────
  await section("I · Notifications", async () => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    // The bell lives in the topbar with an accessible name of
    // "Notifications" (or "Notifications, N unread").
    if (await clickByText(page, /^Notifications/i)) {
      await page.waitForTimeout(800);
      await shot("notifications_dropdown", { fullPage: false });
      await page.keyboard.press("Escape").catch(() => {});
    }
    await page.goto("/notifications");
    await shot("notifications_page");
  });

  console.log(`\n✅  lifecycle flow complete → docs/screenshots/${folder}/`);
}
