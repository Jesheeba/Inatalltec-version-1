"use client";
// ============================================================
// Accountant · Bank Reconciliation (Phase 7, Module 10).
//
// Statements: upload a bank CSV → parsed lines → auto-match against recorded
// cash movements → manual match/ignore the rest. Reconciliations: monthly
// book-vs-bank close-out with a print-friendly report. admin/md/accounts only.
// Fully responsive.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState, FilterBar, KPI, Modal } from "../../shared";
import {
  fetchBankStatements, fetchStatementDetail, createStatementFromCsv, deleteStatement,
  autoMatchStatement, setTransactionMatch, summarizeTransactions, getStatementUrl,
  fetchReconciliations, createReconciliation, finalizeReconciliation,
  type BankStatement, type BankTransaction, type BankReconciliation, type StatementDetail,
} from "@/lib/accounting/bankRecon";
import { printReport } from "./reportPrint";
import type { Report } from "@/lib/accounting/monthly";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
type SubView = "statements" | "recon";

export function BankReconTab({ canManage }: { canManage: boolean }) {
  const [view, setView] = useState<SubView>("statements");
  const subTabs: { value: SubView; label: string }[] = [
    { value: "statements", label: "Statements" },
    { value: "recon", label: "Reconciliations" },
  ];
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <FilterBar<SubView> value={view} onChange={setView} options={subTabs} />
      </div>
      {view === "statements" ? <StatementsView canManage={canManage} /> : <ReconciliationsView canManage={canManage} />}
    </>
  );
}

/* ─── Statements ──────────────────────────────────────────── */
function StatementsView({ canManage }: { canManage: boolean }) {
  const { fmtMoney } = useApp();
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    const res = await fetchBankStatements();
    setLoading(false);
    if (!res.ok) { setErr(res.error); return; }
    setStatements(res.data);
  };
  useEffect(() => { void load(); }, []);

  if (openId) return <StatementDetailView id={openId} canManage={canManage} onBack={() => { setOpenId(null); void load(); }} />;

  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ font: "var(--t-h3)" }}>Bank statements</div>
        {canManage && <button className="btn btn-primary btn-sm" onClick={() => setUploading(true)}><Icon name="plus" size={14} /> Import CSV</button>}
      </div>
      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}
      {loading ? <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
        : statements.length === 0 ? <EmptyState icon="receipt" title="No statements" sub={canManage ? "Import a bank CSV to begin reconciling." : undefined} />
        : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Ref</th><th className="hide-mobile">Bank</th><th>Period</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Closing</th><th></th>
              </tr></thead>
              <tbody>
                {statements.map(st => (
                  <tr key={st.id} style={{ cursor: "pointer" }} onClick={() => setOpenId(st.id)}>
                    <td data-th="Ref" style={{ fontWeight: 600, font: "var(--t-small)" }}>{st.statementRef}</td>
                    <td data-th="Bank" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{st.bankName ?? "—"}</td>
                    <td data-th="Period" style={{ font: "var(--t-small)" }}>{st.periodStart ?? "?"} → {st.periodEnd ?? "?"}</td>
                    <td data-th="Closing" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(st.closingBalance)}</td>
                    <td data-th=""><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setOpenId(st.id); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {uploading && <UploadDialog onClose={() => setUploading(false)} onDone={(id) => { setUploading(false); void load(); setOpenId(id); }} />}
    </>
  );
}

function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const { me, fireToast } = useApp();
  const [bankName, setBankName] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [closingBalance, setClosingBalance] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const cols2 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;

  const submit = async () => {
    setErr(null);
    if (!file) { setErr("Choose a CSV file."); return; }
    setBusy(true);
    const res = await createStatementFromCsv({
      bankName, accountLabel, openingBalance: Number(openingBalance) || 0, closingBalance: Number(closingBalance) || 0,
    }, file, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${res.data.imported} transaction(s) imported${res.data.warnings.length ? " — check warnings" : ""}`);
    onDone(res.data.statement.id);
  };

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Import bank statement</div>
        <div className="alert-banner tone-info">
          <div className="ic"><Icon name="alertCircle" size={16} /></div>
          <div className="text"><div className="d">CSV with Date, Description and a signed Amount (or Debit/Credit) columns.
            Ambiguous dates are read as DD/MM/YYYY. Validate after import.</div></div>
        </div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Bank name</label>
            <input className="input" value={bankName} onChange={e => setBankName(e.target.value)} /></div>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Account label</label>
            <input className="input" value={accountLabel} onChange={e => setAccountLabel(e.target.value)} /></div>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Opening balance</label>
            <input className="input numeric" type="number" step="any" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} /></div>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Closing balance</label>
            <input className="input numeric" type="number" step="any" value={closingBalance} onChange={e => setClosingBalance(e.target.value)} /></div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <label style={labelStyle}>Statement CSV<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <input className="input" type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        </div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !file}><Icon name="check" size={14} /> Import</button>
        </div>
      </div>
    </Modal>
  );
}

function StatementDetailView({ id, canManage, onBack }: { id: string; canManage: boolean; onBack: () => void }) {
  const { fmtMoney, fireToast, me } = useApp();
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [matchTxn, setMatchTxn] = useState<BankTransaction | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetchStatementDetail(id);
    setLoading(false);
    if (res.ok) setDetail(res.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  const summary = useMemo(() => detail ? summarizeTransactions(detail.transactions) : null, [detail]);

  const auto = async () => {
    setBusy(true);
    const res = await autoMatchStatement(id, me.id);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    fireToast(res.data === 0 ? "No new matches" : `${res.data} line(s) auto-matched`);
    void load();
  };
  const setStatus = async (t: BankTransaction, status: "unmatched" | "ignored") => {
    setBusy(true);
    const res = await setTransactionMatch(t.id, { status }, me.id);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    void load();
  };
  const openFile = async () => {
    if (!detail?.statement.filePath) return;
    const res = await getStatementUrl(detail.statement.filePath);
    if (res.ok) window.open(res.data, "_blank", "noopener"); else fireToast(res.error);
  };

  if (loading || !detail || !summary) return <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>;
  const st = detail.statement;

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: 12 }}><Icon name="arrowLeft" size={14} /> All statements</button>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div className="col" style={{ gap: 4, minWidth: 0 }}>
            <div style={{ font: "var(--t-h3)" }}>{st.statementRef}</div>
            <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{st.bankName ?? "—"} · {st.periodStart ?? "?"} → {st.periodEnd ?? "?"}</div>
          </div>
          <div className="row gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
            {st.filePath && <button className="btn btn-ghost btn-sm" onClick={openFile}><Icon name="paperclip" size={13} /> CSV</button>}
            {canManage && <button className="btn btn-primary btn-sm" disabled={busy} onClick={auto}><Icon name="refresh" size={14} /> Auto-match</button>}
            {canManage && <button className="btn btn-ghost btn-sm btn-danger" disabled={busy}
              onClick={async () => { const r = await deleteStatement(id); if (r.ok) onBack(); else fireToast(r.error); }}><Icon name="trash" size={13} /></button>}
          </div>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", marginTop: 16 }}>
          <KPI label="Matched" value={summary.matched} sub={`${detail.transactions.length} lines`} />
          <KPI label="Unmatched" value={summary.unmatched} sub={fmtMoney(summary.unmatchedTotal)} />
          <KPI label="Money in" value={fmtMoney(summary.inflow, { compact: true })} />
          <KPI label="Money out" value={fmtMoney(summary.outflow, { compact: true })} />
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="table">
            <thead><tr>
              <th>Date</th><th>Description</th>
              <th style={{ textAlign: "right" }}>Amount</th><th>Status</th>{canManage && <th></th>}
            </tr></thead>
            <tbody>
              {detail.transactions.map(t => (
                <tr key={t.id}>
                  <td data-th="Date" style={{ font: "var(--t-small)" }}>{t.txnDate}</td>
                  <td data-th="Description" style={{ font: "var(--t-small)" }}>
                    <div>{t.description ?? "—"}</div>
                    {t.matchedRef && <div style={{ font: "var(--t-micro)", color: "var(--suc-700)" }}>✓ {t.matchedRef}</div>}
                  </td>
                  <td data-th="Amount" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600, color: t.amount < 0 ? "var(--dan-700)" : undefined }}>{fmtMoney(t.amount)}</td>
                  <td data-th="Status"><span className={"badge " + (t.status === "matched" ? "badge-success" : t.status === "ignored" ? "badge-outline" : "badge-warning")}>{t.status}</span></td>
                  {canManage && (
                    <td data-th="">
                      <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        {t.status !== "matched" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setMatchTxn(t)}>Match</button>}
                        {t.status !== "ignored" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(t, "ignored")}>Ignore</button>}
                        {t.status !== "unmatched" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setStatus(t, "unmatched")}>Reset</button>}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {matchTxn && <ManualMatchDialog txn={matchTxn} onClose={() => setMatchTxn(null)} onDone={() => { setMatchTxn(null); void load(); }} />}
    </>
  );
}

function ManualMatchDialog({ txn, onClose, onDone }: { txn: BankTransaction; onClose: () => void; onDone: () => void }) {
  const { me, fireToast, fmtMoney } = useApp();
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const submit = async () => {
    setBusy(true);
    const res = await setTransactionMatch(txn.id, { status: "matched", matchedRef: ref, matchedNote: note }, me.id);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    fireToast("Line matched"); onDone();
  };
  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>Match transaction</div>
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{txn.txnDate} · {fmtMoney(txn.amount)} · {txn.description ?? ""}</div>
        <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Matched to (reference)</label>
          <input className="input" value={ref} onChange={e => setRef(e.target.value)} placeholder="e.g. INV-2026-0012 / cheque no." /></div>
        <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Note</label>
          <input className="input" value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}><Icon name="check" size={14} /> Confirm match</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── Reconciliations ─────────────────────────────────────── */
function ReconciliationsView({ canManage }: { canManage: boolean }) {
  const { fmtMoney, fireToast, me, currentOrg } = useApp();
  const [recons, setRecons] = useState<BankReconciliation[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const companyName = currentOrg?.display_name || "Company";

  const load = async () => {
    setLoading(true);
    const [r, s] = await Promise.all([fetchReconciliations(), fetchBankStatements()]);
    setLoading(false);
    if (r.ok) setRecons(r.data);
    if (s.ok) setStatements(s.data);
  };
  useEffect(() => { void load(); }, []);

  const finalize = async (rec: BankReconciliation) => {
    setBusy(true);
    const res = await finalizeReconciliation(rec.id, me.id);
    setBusy(false);
    if (!res.ok) { fireToast(res.error); return; }
    fireToast("Reconciliation finalized"); void load();
  };
  const print = (rec: BankReconciliation) => {
    const report: Report = {
      kind: "recon", title: "Bank Reconciliation", period: `${MONTHS[(rec.periodMonth - 1) % 12]} ${rec.periodYear}`,
      sections: [{ title: "Balances", lines: [
        { label: "Book balance (our records)", value: rec.bookBalance },
        { label: "Bank balance (statement)", value: rec.bankBalance },
        { label: "Difference", value: rec.difference, bold: true },
      ], note: Math.abs(rec.difference) < 0.01 ? "Reconciled — book and bank agree." : "Difference outstanding — investigate unmatched items." }],
    };
    if (!printReport(report, companyName)) fireToast("Allow pop-ups to print");
  };

  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ font: "var(--t-h3)" }}>Reconciliations</div>
        {canManage && <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} /> New reconciliation</button>}
      </div>
      {loading ? <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading…</div>
        : recons.length === 0 ? <EmptyState icon="checkCircle" title="No reconciliations" sub={canManage ? "Close a month once its statement is matched." : undefined} />
        : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Ref</th><th className="hide-mobile" style={{ textAlign: "right" }}>Book</th>
                <th className="hide-mobile" style={{ textAlign: "right" }}>Bank</th>
                <th style={{ textAlign: "right" }}>Difference</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {recons.map(rec => (
                  <tr key={rec.id}>
                    <td data-th="Ref" style={{ fontWeight: 600, font: "var(--t-small)" }}>{rec.reconRef}</td>
                    <td data-th="Book" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(rec.bookBalance)}</td>
                    <td data-th="Bank" className="hide-mobile numeric" style={{ textAlign: "right", font: "var(--t-small)" }}>{fmtMoney(rec.bankBalance)}</td>
                    <td data-th="Difference" className="numeric" style={{ textAlign: "right", font: "var(--t-small)", fontWeight: 600, color: Math.abs(rec.difference) < 0.01 ? "var(--suc-700)" : "var(--dan-700)" }}>{fmtMoney(rec.difference)}</td>
                    <td data-th="Status"><span className={"badge " + (rec.status === "finalized" ? "badge-success" : "badge-outline")}>{rec.status}</span></td>
                    <td data-th="">
                      <div className="row gap-1" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => print(rec)}><Icon name="fileText" size={13} /></button>
                        {canManage && rec.status === "draft" && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => finalize(rec)}>Finalize</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {creating && <NewReconDialog statements={statements} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void load(); }} />}
    </>
  );
}

function NewReconDialog({ statements, onClose, onDone }: { statements: BankStatement[]; onClose: () => void; onDone: () => void }) {
  const { me, fireToast } = useApp();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [statementId, setStatementId] = useState("");
  const [bookBalance, setBookBalance] = useState("");
  const [bankBalance, setBankBalance] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const labelStyle = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;
  const cols2 = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" } as const;

  const pickStatement = (sid: string) => {
    setStatementId(sid);
    const st = statements.find(s => s.id === sid);
    if (st) setBankBalance(String(st.closingBalance));
  };
  const submit = async () => {
    setErr(null); setBusy(true);
    const res = await createReconciliation({ periodYear: year, periodMonth: month, statementId: statementId || null, bookBalance: Number(bookBalance) || 0, bankBalance: Number(bankBalance) || 0, notes }, me.id);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    fireToast(`${res.data.reconRef} created`); onDone();
  };
  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>New reconciliation</div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Month</label>
            <select className="input" value={month} onChange={e => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Year</label>
            <select className="input" value={year} onChange={e => setYear(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
        </div>
        <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Statement <span style={{ color: "var(--ink-quiet)" }}>(optional)</span></label>
          <select className="input" value={statementId} onChange={e => pickStatement(e.target.value)}>
            <option value="">—</option>
            {statements.map(s => <option key={s.id} value={s.id}>{s.statementRef} · {s.bankName ?? ""}</option>)}
          </select></div>
        <div style={cols2}>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Book balance (our records)</label>
            <input className="input numeric" type="number" step="any" value={bookBalance} onChange={e => setBookBalance(e.target.value)} /></div>
          <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Bank balance (statement)</label>
            <input className="input numeric" type="number" step="any" value={bankBalance} onChange={e => setBankBalance(e.target.value)} /></div>
        </div>
        <div className="col" style={{ gap: 4 }}><label style={labelStyle}>Notes</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
        <div style={{ font: "var(--t-micro)", color: "var(--ink-quiet)" }}>The difference (bank − book) is computed automatically.</div>
        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}><Icon name="check" size={14} /> Create</button>
        </div>
      </div>
    </Modal>
  );
}
