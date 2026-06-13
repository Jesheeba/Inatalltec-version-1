"use client";
// ============================================================
// Accountant · Expenses tab (Phase 5, Module 8).
//
// Three sub-views: Expenses (list + filters + workflow), Reports (category /
// vendor / monthly + CSV), Recurring (templates + generate-due). Receipts are
// mandatory; above-threshold items route to Manager/MD approval.
//
// canManage = MANAGE_EXPENSES (Accountant: create/edit/pay). canApprove =
// APPROVE_EXPENSES (Manager: approve/reject). Fully responsive.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState, FilterBar, KPI, Modal } from "../../shared";
import {
  fetchExpenses, fetchExpenseHistory, submitExpense, approveExpense, markExpensePaid,
  deleteExpense, fetchRecurringExpenses, setRecurringActive, deleteRecurringExpense,
  generateDueRecurringExpenses, buildCategoryBreakdown, buildVendorBreakdown,
  buildMonthlySummary, expensesToCsv,
  EXPENSE_STATUS_LABEL,
  type Expense, type ExpenseStatus, type ExpenseHistory, type RecurringExpense,
} from "@/lib/accounting/expenses";
import {
  fetchExpenseCategories, fetchPaymentMethods, type AccountingLookup, type AccountingSettings, fetchAccountingSettings,
} from "@/lib/accounting/settings";
import { fetchVendors, type Vendor } from "@/lib/accounting/vendors";
import {
  ExpenseBadge, ExpenseFormDialog, RejectExpenseDialog, MarkExpensePaidDialog,
  RecurringFormDialog, ReceiptButton,
} from "./expenseBits";

type SubView = "expenses" | "reports" | "recurring";
type StatusFilter = "all" | ExpenseStatus;

function downloadText(filename: string, text: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function ExpensesTab({ canManage, canApprove }: { canManage: boolean; canApprove: boolean }) {
  const { fmtMoney, me, fireToast } = useApp();
  const [view, setView] = useState<SubView>("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<AccountingLookup[]>([]);
  const [methods, setMethods] = useState<AccountingLookup[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [settings, setSettings] = useState<AccountingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [catFilter, setCatFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Dialog state
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [rejecting, setRejecting] = useState<Expense | null>(null);
  const [paying, setPaying] = useState<Expense | null>(null);
  const [historyOf, setHistoryOf] = useState<Expense | null>(null);
  const [recurringEdit, setRecurringEdit] = useState<RecurringExpense | null>(null);
  const [recurringNew, setRecurringNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadRefs = async () => {
    const [c, m, v, s] = await Promise.all([
      fetchExpenseCategories(), fetchPaymentMethods(), fetchVendors(), fetchAccountingSettings(),
    ]);
    if (c.ok) setCategories(c.data.filter(x => x.isActive));
    if (m.ok) setMethods(m.data.filter(x => x.isActive));
    if (v.ok) setVendors(v.data);
    if (s.ok) setSettings(s.data);
  };
  const loadExpenses = async () => {
    const res = await fetchExpenses();
    if (!res.ok) { setErr(res.error); return; }
    setExpenses(res.data);
  };
  const loadRecurring = async () => {
    const res = await fetchRecurringExpenses();
    if (res.ok) setRecurring(res.data);
  };
  const loadAll = async () => {
    setLoading(true); setErr(null);
    await Promise.all([loadRefs(), loadExpenses(), loadRecurring()]);
    setLoading(false);
  };
  useEffect(() => { void loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const catLabel = (code: string | null) => categories.find(c => c.code === code)?.label ?? (code || "Uncategorized");
  const vendorName = (id: string | null) => vendors.find(v => v.id === id)?.name ?? (id ? "—" : "No vendor");
  const threshold = settings?.expenseApprovalThreshold ?? 5000;
  const taxRatePct = settings?.defaultTaxRatePct ?? 5;

  const filtered = useMemo(() => expenses.filter(e => {
    if (statusFilter !== "all" && e.status !== statusFilter) return false;
    if (catFilter !== "all" && e.categoryCode !== catFilter) return false;
    if (vendorFilter !== "all" && e.vendorId !== vendorFilter) return false;
    if (from && e.expenseDate < from) return false;
    if (to && e.expenseDate > to) return false;
    return true;
  }), [expenses, statusFilter, catFilter, vendorFilter, from, to]);

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = useMemo(() => expenses.filter(e => e.expenseDate.startsWith(thisMonth)).reduce((s, e) => s + e.total, 0), [expenses, thisMonth]);
  const pendingCount = useMemo(() => expenses.filter(e => e.status === "pending_approval").length, [expenses]);
  const toPay = useMemo(() => expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.total, 0), [expenses]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { fireToast(res.error ?? "Action failed"); return; }
    if (okMsg) fireToast(okMsg);
    void loadExpenses();
  };

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: expenses.length },
    { value: "draft", label: "Draft" },
    { value: "pending_approval", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "paid", label: "Paid" },
    { value: "rejected", label: "Rejected" },
  ];

  const subTabs: { value: SubView; label: string }[] = [
    { value: "expenses", label: "Expenses" },
    { value: "reports", label: "Reports" },
    { value: "recurring", label: "Recurring" },
  ];

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <FilterBar<SubView> value={view} onChange={setView} options={subTabs} />
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", marginBottom: 20 }}>
        <KPI accent="primary" label="This month" value={fmtMoney(monthTotal, { compact: true })} sub="Total expenses" />
        <KPI label="Pending approval" value={pendingCount} sub="Awaiting Manager/MD" />
        <KPI label="Approved to pay" value={fmtMoney(toPay, { compact: true })} sub="Not yet paid" />
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}
      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading expenses…</div>
      ) : view === "expenses" ? (
        <>
          <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <FilterBar<StatusFilter> value={statusFilter} onChange={setStatusFilter} options={statusTabs} />
            </div>
            {canManage && (
              <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                <Icon name="plus" size={14} /> New expense
              </button>
            )}
          </div>

          <div className="row gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
            <select className="input" style={{ maxWidth: 200 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map(c => <option key={c.id} value={c.code}>{c.label}</option>)}
            </select>
            <select className="input" style={{ maxWidth: 200 }} value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}>
              <option value="all">All vendors</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <input className="input" type="date" style={{ maxWidth: 160 }} value={from} onChange={e => setFrom(e.target.value)} title="From" />
            <input className="input" type="date" style={{ maxWidth: 160 }} value={to} onChange={e => setTo(e.target.value)} title="To" />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon="receipt" title={expenses.length === 0 ? "No expenses yet" : "Nothing in this view"}
              sub={canManage && expenses.length === 0 ? "Record the first expense with its receipt." : undefined} />
          ) : (
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead><tr>
                    <th>Number</th><th>Date</th>
                    <th className="hide-mobile">Category</th>
                    <th className="hide-mobile">Vendor</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th>Status</th><th></th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(e => (
                      <tr key={e.id}>
                        <td data-th="Number" style={{ fontWeight: 600, font: "var(--t-small)" }}>{e.expenseNumber}</td>
                        <td data-th="Date" style={{ font: "var(--t-small)" }}>{e.expenseDate}</td>
                        <td data-th="Category" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{catLabel(e.categoryCode)}</td>
                        <td data-th="Vendor" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{vendorName(e.vendorId)}</td>
                        <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(e.total)}</td>
                        <td data-th="Status"><ExpenseBadge status={e.status} /></td>
                        <td data-th="">
                          <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <ReceiptButton path={e.receiptPath} />
                            {canManage && (e.status === "draft" || e.status === "rejected") && (
                              <>
                                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditing(e)}><Icon name="pen" size={13} /></button>
                                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => submitExpense(e.id, me.id), "Submitted")}>Submit</button>
                              </>
                            )}
                            {canManage && e.status === "draft" && (
                              <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => act(() => deleteExpense(e.id), "Deleted")}><Icon name="trash" size={13} /></button>
                            )}
                            {canApprove && e.status === "pending_approval" && (
                              <>
                                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(() => approveExpense(e.id, me.id), "Approved")}>Approve</button>
                                <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => setRejecting(e)}>Reject</button>
                              </>
                            )}
                            {canManage && e.status === "approved" && (
                              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => setPaying(e)}><Icon name="banknote" size={13} /> Pay</button>
                            )}
                            <button className="btn btn-ghost btn-sm" aria-label="History" onClick={() => setHistoryOf(e)}><Icon name="clock" size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : view === "reports" ? (
        <ReportsView expenses={filtered} catLabel={catLabel} vendorName={vendorName}
          onExport={() => downloadText(`expenses_${thisMonth}.csv`, expensesToCsv(filtered, catLabel, vendorName))} />
      ) : (
        <RecurringView
          recurring={recurring} canManage={canManage} busy={busy} catLabel={catLabel} vendorName={vendorName}
          onNew={() => setRecurringNew(true)} onEdit={t => setRecurringEdit(t)}
          onToggle={(t) => act(() => setRecurringActive(t.id, !t.isActive), "Updated").then(() => void loadRecurring())}
          onDelete={(t) => act(() => deleteRecurringExpense(t.id), "Template removed").then(() => void loadRecurring())}
          onGenerate={async () => {
            setBusy(true);
            const res = await generateDueRecurringExpenses(me.id);
            setBusy(false);
            if (!res.ok) { fireToast(res.error); return; }
            fireToast(res.data === 0 ? "Nothing due" : `${res.data} draft expense(s) generated`);
            await Promise.all([loadExpenses(), loadRecurring()]);
            if (res.data > 0) setView("expenses");
          }} />
      )}

      {/* Dialogs */}
      {creating && settings && (
        <ExpenseFormDialog categories={categories} vendors={vendors} paymentMethods={methods}
          taxRatePct={taxRatePct} threshold={threshold}
          onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void loadExpenses(); }} />
      )}
      {editing && settings && (
        <ExpenseFormDialog expense={editing} categories={categories} vendors={vendors} paymentMethods={methods}
          taxRatePct={taxRatePct} threshold={threshold}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void loadExpenses(); }} />
      )}
      {rejecting && (
        <RejectExpenseDialog expense={rejecting} onClose={() => setRejecting(null)} onDone={() => { setRejecting(null); void loadExpenses(); }} />
      )}
      {paying && (
        <MarkExpensePaidDialog expense={paying} paymentMethods={methods} onClose={() => setPaying(null)} onDone={() => { setPaying(null); void loadExpenses(); }} />
      )}
      {historyOf && <HistoryModal expense={historyOf} onClose={() => setHistoryOf(null)} />}
      {(recurringNew || recurringEdit) && (
        <RecurringFormDialog template={recurringEdit ?? undefined} categories={categories} vendors={vendors}
          onClose={() => { setRecurringNew(false); setRecurringEdit(null); }}
          onSaved={() => { setRecurringNew(false); setRecurringEdit(null); void loadRecurring(); }} />
      )}
    </>
  );
}

/* ─── Reports ─────────────────────────────────────────────── */
function ReportsView({ expenses, catLabel, vendorName, onExport }: {
  expenses: Expense[];
  catLabel: (c: string | null) => string;
  vendorName: (id: string | null) => string;
  onExport: () => void;
}) {
  const { fmtMoney } = useApp();
  const cats = useMemo(() => buildCategoryBreakdown(expenses, catLabel), [expenses, catLabel]);
  const vends = useMemo(() => buildVendorBreakdown(expenses, vendorName), [expenses, vendorName]);
  const months = useMemo(() => buildMonthlySummary(expenses), [expenses]);
  const grand = expenses.reduce((s, e) => s + e.total, 0);

  const breakdownCard = (title: string, rows: { key: string; label: string; count: number; total: number }[]) => (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div className="card-pad" style={{ paddingBottom: 8 }}><CardHead title={title} sub={`${rows.length} group(s)`} /></div>
      {rows.length === 0 ? <div className="card-pad"><EmptyState icon="chartBar" title="No data" /></div> : (
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr><th>{title.split(" ")[0]}</th><th style={{ textAlign: "right" }}>Count</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td data-th="Group" style={{ font: "var(--t-small)" }}>{r.label}</td>
                  <td data-th="Count" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{r.count}</td>
                  <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {expenses.length} expense(s) in view · total <strong>{fmtMoney(grand)}</strong>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onExport} disabled={expenses.length === 0}>
          <Icon name="arrowDown" size={14} /> Export CSV
        </button>
      </div>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {breakdownCard("Category breakdown", cats)}
        {breakdownCard("Vendor breakdown", vends)}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="card-pad" style={{ paddingBottom: 8 }}><CardHead title="Monthly summary" sub={`${months.length} month(s)`} /></div>
          {months.length === 0 ? <div className="card-pad"><EmptyState icon="chartBar" title="No data" /></div> : (
            <div style={{ overflowX: "auto" }}>
              <table className="table">
                <thead><tr><th>Month</th><th style={{ textAlign: "right" }}>Count</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
                <tbody>
                  {months.map(m => (
                    <tr key={m.month}>
                      <td data-th="Month" style={{ font: "var(--t-small)" }}>{m.month}</td>
                      <td data-th="Count" className="numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{m.count}</td>
                      <td data-th="Total" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Recurring ───────────────────────────────────────────── */
function RecurringView({ recurring, canManage, busy, catLabel, vendorName, onNew, onEdit, onToggle, onDelete, onGenerate }: {
  recurring: RecurringExpense[];
  canManage: boolean;
  busy: boolean;
  catLabel: (c: string | null) => string;
  vendorName: (id: string | null) => string;
  onNew: () => void;
  onEdit: (t: RecurringExpense) => void;
  onToggle: (t: RecurringExpense) => void;
  onDelete: (t: RecurringExpense) => void;
  onGenerate: () => void;
}) {
  const { fmtMoney } = useApp();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ font: "var(--t-h3)" }}>Recurring templates</div>
        {canManage && (
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onGenerate}><Icon name="refresh" size={14} /> Generate due</button>
            <button className="btn btn-primary btn-sm" onClick={onNew}><Icon name="plus" size={14} /> New template</button>
          </div>
        )}
      </div>
      {recurring.length === 0 ? (
        <EmptyState icon="refresh" title="No recurring expenses"
          sub={canManage ? "Add a template for rent, internet, etc. — “Generate due” creates a draft when each falls due." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Description</th>
                <th className="hide-mobile">Category</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th className="hide-mobile">Frequency</th>
                <th>Next due</th><th></th>
              </tr></thead>
              <tbody>
                {recurring.map(t => (
                  <tr key={t.id}>
                    <td data-th="Description" style={{ font: "var(--t-small)" }}>
                      <div style={{ fontWeight: 600 }}>{t.description}</div>
                      <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{vendorName(t.vendorId)}{t.isActive ? "" : " · paused"}</div>
                    </td>
                    <td data-th="Category" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{catLabel(t.categoryCode)}</td>
                    <td data-th="Amount" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600 }}>{fmtMoney(t.baseAmount)}</td>
                    <td data-th="Frequency" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)", textTransform: "capitalize" }}>{t.frequency}</td>
                    <td data-th="Next due" style={{ font: "var(--t-small)", color: t.isActive && t.nextDueDate <= today ? "var(--warn-700)" : undefined }}>{t.nextDueDate}</td>
                    <td data-th="">
                      {canManage && (
                        <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(t)}><Icon name="pen" size={13} /></button>
                          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onToggle(t)}>{t.isActive ? "Pause" : "Resume"}</button>
                          <button className="btn btn-ghost btn-sm btn-danger" disabled={busy} onClick={() => onDelete(t)}><Icon name="trash" size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── History modal ───────────────────────────────────────── */
function HistoryModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { fmtMoney } = useApp();
  const [history, setHistory] = useState<ExpenseHistory[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      const res = await fetchExpenseHistory(expense.id);
      if (res.ok) setHistory(res.data);
      setLoading(false);
    })();
  }, [expense.id]);
  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{expense.expenseNumber}</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>
          {expense.description} · {fmtMoney(expense.total)} · {EXPENSE_STATUS_LABEL[expense.status]}
        </div>
        {expense.status === "rejected" && expense.rejectionReason && (
          <div className="alert-banner tone-danger">
            <div className="ic"><Icon name="alertCircle" size={16} /></div>
            <div className="text"><div className="d">{expense.rejectionReason}</div></div>
          </div>
        )}
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <ReceiptButton path={expense.receiptPath} label="Open receipt" />
        </div>
        <CardHead title="Activity" sub="Audit trail" />
        {loading ? <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Loading…</div>
          : history.length === 0 ? <div style={{ font: "var(--t-small)", color: "var(--ink-quiet)" }}>No history.</div> : (
          <div className="col gap-2">
            {history.map(h => (
              <div key={h.id} className="row" style={{ gap: 8, alignItems: "flex-start", font: "var(--t-small)" }}>
                <Icon name="clock" size={13} />
                <div className="col" style={{ gap: 0, minWidth: 0 }}>
                  <span>{h.detail ?? h.action}</span>
                  <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>{new Date(h.changedAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  );
}
