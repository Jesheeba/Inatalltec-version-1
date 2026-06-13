// ============================================================
// Accountant screenshot flow — shared by the desktop and mobile specs.
//
// Logs in as the Accountant and walks the Accountant module (Sections
// A–H from the brief). The module is a single route (/accountant) with
// in-page tabs rendered as buttons, so navigation = click the tab button.
//
// Best-effort: every tab/modal capture is forgiving. window.print() is
// neutralised in signIn(), so "Print" buttons won't hang; the Monthly
// Statement opens a popup window which we screenshot directly.
//
// `folder` controls the output subdir: "accountant" or "accountant-mobile".
// ============================================================

import type { Page } from "@playwright/test";
import {
  ACCOUNTS,
  makeShot,
  section,
  signIn,
  clickTab,
  clickByText,
  captureModal,
  type Shot,
} from "./helpers";

// Reset to /accountant and switch to a top-level tab by its label.
async function openTab(page: Page, label: string): Promise<boolean> {
  await page.goto("/accountant");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
  return clickTab(page, label);
}

export async function accountantFlow(page: Page, folder: string): Promise<void> {
  const shot = makeShot(page, folder);
  const acct = ACCOUNTS.accountant;

  // Sign in (also captures the login screen as shot 01).
  await section("· login as accountant", async () => {
    await signIn(page, acct, shot, { loginShot: "login" });
    await page.goto("/accountant");
    await shot("accountant_landing");
  });

  // ── Section A — Settings ─────────────────────────────────
  // Company info / WPS / Categories / Approval thresholds all live on the
  // one scrollable Settings tab — a full-page shot captures them.
  await section("A · Settings", async () => {
    if (await openTab(page, "Settings")) await shot("settings");
  });

  // ── Section B — Monthly View dashboard + reports ─────────
  await section("B · Monthly View", async () => {
    if (!(await openTab(page, "Monthly View"))) return;
    await shot("monthly_dashboard");

    // Print Monthly Statement → opens a popup with the print document
    // (window.print is stubbed, so no OS dialog). Capture the popup.
    await capturePrintPopup(page, shot, /Print Monthly Statement/i, "monthly_print_view");

    // The report buttons open in-app modals.
    await capturePostTabModal(page, shot, "Monthly View", /Status Report/i, "monthly_status_report");
    await capturePostTabModal(page, shot, "Monthly View", /CNL Report/i, "monthly_cnl_report");
    await capturePostTabModal(page, shot, "Monthly View", /P&L( Summary)?/i, "monthly_pnl_report");
    await capturePostTabModal(page, shot, "Monthly View", /Cash Flow/i, "monthly_cash_flow");
  });

  // ── Section C — Invoices ─────────────────────────────────
  await section("C · Invoices", async () => {
    if (!(await openTab(page, "Invoices"))) return;
    await shot("invoices_list");
    await captureModal(page, shot, /New invoice/i, "invoice_new_form");
  });

  // ── Section D — Vendors & Purchase Orders ────────────────
  await section("D · Vendors & POs", async () => {
    if (await openTab(page, "Vendors")) {
      await shot("vendors_list");
      await captureModal(page, shot, /New vendor/i, "vendor_new_form");
    }
    if (await openTab(page, "Purchase Orders")) {
      await shot("purchase_orders_list");
      await captureModal(page, shot, /New PO/i, "po_new_form");
    }
    if (await openTab(page, "Vendor Payables")) {
      await shot("vendor_payables_list");
      await captureModal(page, shot, /New bill/i, "vendor_bill_new_form");
    }
  });

  // ── Section E — Subcontractor payments ───────────────────
  await section("E · Sub-contractor payments", async () => {
    if (await openTab(page, "Sub-contractor Payments")) await shot("subcontractor_payments");
  });

  // ── Section F — Payroll ──────────────────────────────────
  await section("F · Payroll", async () => {
    if (!(await openTab(page, "Payroll"))) return;
    await shot("payroll_employees");
    await captureModal(page, shot, /New employee/i, "payroll_new_employee_form");

    // Sub-tabs within Payroll.
    if (await clickTab(page, "Payroll Runs")) {
      await page.waitForTimeout(600);
      await shot("payroll_runs");
      await captureModal(page, shot, /New run/i, "payroll_new_run_form");
    }
    if (await clickTab(page, "End of Service")) {
      await page.waitForTimeout(600);
      await shot("payroll_end_of_service");
    }
  });

  // ── Section G — Expenses ─────────────────────────────────
  await section("G · Expenses", async () => {
    if (!(await openTab(page, "Expenses"))) return;
    await shot("expenses_list");
    await captureModal(page, shot, /New expense/i, "expense_new_form");

    if (await clickTab(page, "Reports")) {
      await page.waitForTimeout(600);
      await shot("expenses_reports");
    }
    if (await clickTab(page, "Recurring")) {
      await page.waitForTimeout(600);
      await shot("expenses_recurring");
      await captureModal(page, shot, /New template/i, "expense_recurring_form");
    }
  });

  // ── Section H — Bank reconciliation ──────────────────────
  await section("H · Bank reconciliation", async () => {
    if (!(await openTab(page, "Bank Reconciliation"))) return;
    await shot("bank_recon");
    await captureModal(page, shot, /Import CSV|Upload/i, "bank_import_form");
  });

  console.log(`\n✅  accountant flow complete → docs/screenshots/${folder}/`);
}

// Reopen a top-level tab, then open a modal on it. Used for the Monthly
// View report modals so each one starts from a clean tab state.
async function capturePostTabModal(
  page: Page,
  shot: Shot,
  tab: string,
  trigger: RegExp,
  screenName: string
): Promise<void> {
  if (!(await openTab(page, tab))) return;
  await captureModal(page, shot, trigger, screenName);
}

// Click a button that opens a print popup, screenshot the popup, close it.
async function capturePrintPopup(
  page: Page,
  shot: Shot,
  trigger: RegExp,
  screenName: string
): Promise<void> {
  const popupPromise = page.waitForEvent("popup", { timeout: 6000 }).catch(() => null);
  const clicked = await clickByText(page, trigger);
  if (!clicked) return;
  const popup = await popupPromise;
  if (!popup) {
    console.log("  ·   print did not open a popup — skipped print view");
    return;
  }
  // The context init script already stubs window.print before the popup's
  // scripts run; re-assert here too as a cheap safety net so the popup's
  // auto window.print() can never raise a blocking OS dialog.
  await popup.evaluate(() => {
    try {
      // @ts-expect-error overriding for headless-safety
      window.print = () => {};
    } catch {
      /* ignore */
    }
  }).catch(() => {});
  try {
    await popup.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
    await popup.waitForTimeout(700);
    await shot(screenName, { fullPage: true, target: popup });
  } finally {
    await popup.close().catch(() => {});
  }
}
