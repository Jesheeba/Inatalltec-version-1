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
import { SettingsTab } from "./accountant/SettingsTab";

type AccTab = "amc_ar" | "invoices" | "receivables" | "vendors" | "pos" | "settings";

export function Accountant() {
  const { role } = useApp();
  const [tab, setTab] = useState<AccTab>("amc_ar");

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

  // Tabs grow as later phases land. All VIEW_ACCOUNTING roles see every
  // tab; per-action edit rights are gated inside each tab.
  const tabs: { value: AccTab; label: string }[] = [
    { value: "amc_ar", label: "AMC Receivables" },
    { value: "invoices", label: "Invoices" },
    { value: "receivables", label: "Receivables" },
    { value: "vendors", label: "Vendors" },
    { value: "pos", label: "Purchase Orders" },
    { value: "settings", label: "Settings" },
  ];

  return (
    <div className="main-pad">
      <PageHeader eyebrow="Finance" title="Accountant"
        sub="Receivables, payments & configuration" />

      <div style={{ marginBottom: 16 }}>
        <FilterBar<AccTab> value={tab} onChange={setTab} options={tabs} />
      </div>

      {tab === "amc_ar" && <AmcReceivablesTab />}
      {tab === "invoices" && <InvoicesTab canManage={canManageInvoices} canApprove={canApproveInvoices} />}
      {tab === "receivables" && <ReceivablesTab canManage={canManageInvoices} />}
      {tab === "vendors" && <VendorsTab canManage={canManageVendors} />}
      {tab === "pos" && <PurchaseOrdersTab canManage={canManagePOs} canApprove={canApprovePOs} />}
      {tab === "settings" && <SettingsTab canEdit={canEditSettings} />}
    </div>
  );
}
