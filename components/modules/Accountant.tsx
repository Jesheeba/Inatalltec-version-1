"use client";
// ============================================================
// Accountant module — tabbed hub.
//
// Phase 0 restructured this from a single AMC-AR screen into a hub so
// the accounting areas (Settings now; Invoices, Receivables, Vendors,
// POs, Payables, Subcontractor Pay, Payroll, Expenses, Inventory Txns,
// Reports in later phases) live as tabs under one route. The original
// AMC receivables view is preserved verbatim as the first tab.
//
// Gate: VIEW_ACCOUNTING (admin / md / manager / accounts). The Shell
// sidebar already filters; re-checked here for direct-URL safety.
// ============================================================

import { useState } from "react";
import { useApp } from "@/lib/app-context";
import { can } from "@/lib/permissions";
import { EmptyState, PageHeader, FilterBar } from "../shared";
import { AmcReceivablesTab } from "./accountant/AmcReceivablesTab";
import { InvoicesTab } from "./accountant/InvoicesTab";
import { ReceivablesTab } from "./accountant/ReceivablesTab";
import { VendorsTab } from "./accountant/VendorsTab";
import { PurchaseOrdersTab } from "./accountant/PurchaseOrdersTab";
import { PayablesTab } from "./accountant/PayablesTab";
import { SubcontractorPaymentsTab } from "./accountant/SubcontractorPaymentsTab";
import { PayrollTab } from "./accountant/PayrollTab";
import { ExpensesTab } from "./accountant/ExpensesTab";
import { MonthlyView } from "./accountant/MonthlyView";
import { BankReconTab } from "./accountant/BankReconTab";
import { SettingsTab } from "./accountant/SettingsTab";

type AccTab = "monthly" | "amc_ar" | "invoices" | "receivables" | "vendors" | "pos" | "payables" | "subpay" | "payroll" | "expenses" | "bank" | "settings";

export function Accountant() {
  const { role } = useApp();
  // Monthly View is the Accountant's landing tab when they can see it.
  const [tab, setTab] = useState<AccTab>(can(role, "VIEW_MONTHLY_REPORTS") ? "monthly" : "amc_ar");

  if (!can(role, "VIEW_ACCOUNTING")) {
    return (
      <div className="main-pad">
        <PageHeader eyebrow="Finance" title="Accountant" />
        <EmptyState icon="shield" title="Not available for your role"
          sub="Accountant is available to MD / Admin / Operations Manager / Accounts." />
      </div>
    );
  }

  const canEditSettings = can(role, "MANAGE_ACCOUNTING_SETTINGS");
  const canManageInvoices = can(role, "MANAGE_INVOICES");
  const canApproveInvoices = can(role, "APPROVE_INVOICES");
  const canManageVendors = can(role, "MANAGE_VENDORS");
  const canManagePOs = can(role, "MANAGE_POS");
  const canApprovePOs = can(role, "APPROVE_POS");
  const canManagePayables = can(role, "MANAGE_PAYABLES");
  const canManageSubPay = can(role, "MANAGE_SUBCONTRACTOR_PAYMENTS");
  // Payroll is CONFIDENTIAL — only the VIEW_PAYROLL audience (admin/md/
  // accounts) gets the tab at all; Manager is excluded.
  const canViewPayroll = can(role, "VIEW_PAYROLL");
  const canManagePayroll = can(role, "MANAGE_PAYROLL");
  const canViewExpenses = can(role, "VIEW_EXPENSES");
  const canManageExpenses = can(role, "MANAGE_EXPENSES");
  const canApproveExpenses = can(role, "APPROVE_EXPENSES");
  const canViewMonthly = can(role, "VIEW_MONTHLY_REPORTS");
  const canViewBank = can(role, "VIEW_BANK_RECON");
  const canManageBank = can(role, "MANAGE_BANK_RECON");

  // Tabs grow as later phases land. All VIEW_ACCOUNTING roles see every
  // tab; per-action edit rights are gated inside each tab. (VIEW_PAYABLES
  // shares the VIEW_ACCOUNTING audience, so the Payables tab is visible to
  // everyone who can reach the hub; Manager sees it read-only.) Payroll is
  // the exception — it only appears for VIEW_PAYROLL roles.
  const tabs: { value: AccTab; label: string }[] = [
    ...(canViewMonthly ? [{ value: "monthly" as AccTab, label: "Monthly View" }] : []),
    { value: "amc_ar", label: "AMC Receivables" },
    { value: "invoices", label: "Invoices" },
    { value: "receivables", label: "Receivables" },
    { value: "vendors", label: "Vendors" },
    { value: "pos", label: "Purchase Orders" },
    { value: "payables", label: "Vendor Payables" },
    { value: "subpay", label: "Sub-contractor Payments" },
    ...(canViewPayroll ? [{ value: "payroll" as AccTab, label: "Payroll" }] : []),
    ...(canViewExpenses ? [{ value: "expenses" as AccTab, label: "Expenses" }] : []),
    ...(canViewBank ? [{ value: "bank" as AccTab, label: "Bank Reconciliation" }] : []),
    { value: "settings", label: "Settings" },
  ];

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Finance" title="Accountant"
        sub="Receivables, payments & configuration" />

      <div style={{ marginBottom: 16 }}>
        <FilterBar<AccTab> value={tab} onChange={setTab} options={tabs} />
      </div>

      {tab === "monthly" && canViewMonthly && <MonthlyView onOpenTab={(t) => setTab(t)} />}
      {tab === "amc_ar" && <AmcReceivablesTab />}
      {tab === "invoices" && <InvoicesTab canManage={canManageInvoices} canApprove={canApproveInvoices} />}
      {tab === "receivables" && <ReceivablesTab canManage={canManageInvoices} />}
      {tab === "vendors" && <VendorsTab canManage={canManageVendors} />}
      {tab === "pos" && <PurchaseOrdersTab canManage={canManagePOs} canApprove={canApprovePOs} />}
      {tab === "payables" && <PayablesTab canManage={canManagePayables} />}
      {tab === "subpay" && <SubcontractorPaymentsTab canManage={canManageSubPay} />}
      {tab === "payroll" && canViewPayroll && <PayrollTab canManage={canManagePayroll} />}
      {tab === "expenses" && canViewExpenses && <ExpensesTab canManage={canManageExpenses} canApprove={canApproveExpenses} />}
      {tab === "bank" && canViewBank && <BankReconTab canManage={canManageBank} />}
      {tab === "settings" && <SettingsTab canEdit={canEditSettings} />}
    </div>
  );
}
