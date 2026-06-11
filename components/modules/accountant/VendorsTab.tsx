"use client";
// ============================================================
// Accountant · Vendors tab (Phase 2, migration 0047).
//
// Vendor / supplier master: list with search + status/category filters,
// create / edit, and status management (active / inactive / blacklisted).
// Self-contained — loads + saves via lib/accounting/vendors.ts (client
// session, RLS-gated). Categories come from the configurable lookup.
//
// Edit rights: MANAGE_VENDORS. Read for everyone with VIEW_ACCOUNTING.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { useApp } from "@/lib/app-context";
import { CardHead, EmptyState, FilterBar, Modal } from "../../shared";
import {
  fetchVendors, createVendor, updateVendor, setVendorStatus, fetchVendorCategories,
  VENDOR_CATEGORY_FALLBACK, VENDOR_STATUS_LABEL,
  type Vendor, type VendorStatus, type VendorInput,
} from "@/lib/accounting/vendors";
import type { AccountingLookup } from "@/lib/accounting/settings";

type StatusFilter = "all" | VendorStatus;

const STATUS_BADGE: Record<VendorStatus, string> = {
  active: "badge-success",
  inactive: "badge-outline",
  blacklisted: "badge-danger",
};

export function VendorsTab({ canManage }: { canManage: boolean }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [categories, setCategories] = useState<AccountingLookup[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true); setErr(null);
    const [v, c] = await Promise.all([fetchVendors(), fetchVendorCategories()]);
    setLoading(false);
    if (!v.ok) { setErr(v.error); return; }
    setVendors(v.data);
    if (c.ok) setCategories(c.data);
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // code → label, preferring the configurable lookup, then the fallback.
  const categoryLabel = (code: string): string => {
    const found = categories.find(c => c.code === code);
    return found?.label ?? VENDOR_CATEGORY_FALLBACK[code] ?? code;
  };

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return vendors.filter(v => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
      if (t && !(`${v.name} ${v.vendorCode} ${v.contactPerson ?? ""}`.toLowerCase().includes(t))) return false;
      return true;
    });
  }, [vendors, statusFilter, categoryFilter, search]);

  const statusTabs: { value: StatusFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: vendors.length },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "blacklisted", label: "Blacklisted" },
  ];

  return (
    <>
      <div className="row between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <FilterBar<StatusFilter> value={statusFilter} onChange={setStatusFilter} options={statusTabs} />
        </div>
        {canManage && (
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New vendor
          </button>
        )}
      </div>

      {/* Search + category filter */}
      <div className="row gap-2" style={{ marginBottom: 12, flexWrap: "wrap" }}>
        <div className="row" style={{ alignItems: "center", gap: 6, flex: 1, minWidth: 200,
          border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: "0 10px" }}>
          <Icon name="search" size={14} />
          <input className="input" style={{ border: "none", padding: "8px 0", flex: 1, background: "transparent" }}
            placeholder="Search name, code or contact" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ maxWidth: 220 }} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map(c => <option key={c.id} value={c.code}>{c.label}</option>)}
        </select>
      </div>

      {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)", marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ font: "var(--t-small)", color: "var(--ink-mute)", padding: 8 }}>Loading vendors…</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="building" title={vendors.length === 0 ? "No vendors yet" : "Nothing in this view"}
          sub={canManage && vendors.length === 0 ? "Add the first supplier." : undefined} />
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead><tr>
                <th>Code</th><th>Name</th>
                <th className="hide-mobile">Category</th>
                <th className="hide-mobile">Contact</th>
                <th className="hide-mobile">Phone</th>
                <th>Status</th>
                {canManage && <th style={{ width: 64 }}></th>}
              </tr></thead>
              <tbody>
                {filtered.map(v => (
                  <tr key={v.id}>
                    <td data-th="Code" style={{ fontWeight: 600, font: "var(--t-small)" }}>{v.vendorCode}</td>
                    <td data-th="Name" style={{ font: "var(--t-small)" }}>{v.name}</td>
                    <td data-th="Category" className="hide-mobile" style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>{categoryLabel(v.category)}</td>
                    <td data-th="Contact" className="hide-mobile" style={{ font: "var(--t-small)" }}>{v.contactPerson ?? "—"}</td>
                    <td data-th="Phone" className="hide-mobile" style={{ font: "var(--t-small)" }}>{v.phone ?? "—"}</td>
                    <td data-th="Status"><span className={"badge " + STATUS_BADGE[v.status]}>{VENDOR_STATUS_LABEL[v.status]}</span></td>
                    {canManage && (
                      <td data-th="">
                        <button className="btn btn-ghost btn-sm" aria-label="Edit" onClick={() => setEditing(v)}>
                          <Icon name="pen" size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && (
        <VendorFormDialog categories={categories} onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void load(); }} />
      )}
      {editing && (
        <VendorFormDialog vendor={editing} categories={categories} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }} />
      )}
    </>
  );
}

/* ─── Create / edit dialog ───────────────────────────────── */
function VendorFormDialog({ vendor, categories, onClose, onSaved }: {
  vendor?: Vendor;
  categories: AccountingLookup[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me, fireToast } = useApp();
  const isEdit = !!vendor;
  const [name, setName] = useState(vendor?.name ?? "");
  const [category, setCategory] = useState(vendor?.category ?? "other");
  const [contactPerson, setContactPerson] = useState(vendor?.contactPerson ?? "");
  const [phone, setPhone] = useState(vendor?.phone ?? "");
  const [email, setEmail] = useState(vendor?.email ?? "");
  const [address, setAddress] = useState(vendor?.address ?? "");
  const [trn, setTrn] = useState(vendor?.trn ?? "");
  const [foreignTaxNumber, setForeignTaxNumber] = useState(vendor?.foreignTaxNumber ?? "");
  const [bankAccount, setBankAccount] = useState(vendor?.bankAccount ?? "");
  const [paymentTermsDays, setPaymentTermsDays] = useState(vendor?.paymentTermsDays != null ? String(vendor.paymentTermsDays) : "");
  const [country, setCountry] = useState(vendor?.country ?? "United Arab Emirates");
  const [notes, setNotes] = useState(vendor?.notes ?? "");
  const [status, setStatus] = useState<VendorStatus>(vendor?.status ?? "active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Category options: the configurable lookup, or the fallback four if it
  // hasn't loaded (e.g. migration not applied).
  const catOptions = categories.length
    ? categories.map(c => ({ code: c.code, label: c.label }))
    : Object.entries(VENDOR_CATEGORY_FALLBACK).map(([code, label]) => ({ code, label }));

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Vendor name is required."); return; }
    setBusy(true);
    const input: VendorInput = {
      name, category, contactPerson, phone, email, address, trn,
      foreignTaxNumber, bankAccount, country, notes,
      paymentTermsDays: paymentTermsDays.trim() === "" ? null : Number(paymentTermsDays),
    };
    const res = isEdit ? await updateVendor(vendor!.id, input) : await createVendor(input, me.id);
    if (!res.ok) { setBusy(false); setErr(res.error); return; }
    // On edit, apply a status change too if it differs.
    if (isEdit && status !== vendor!.status) {
      const sres = await setVendorStatus(vendor!.id, status);
      if (!sres.ok) { setBusy(false); setErr(sres.error); return; }
    }
    setBusy(false);
    fireToast(isEdit ? "Vendor updated" : `Vendor ${res.data.vendorCode} created`);
    onSaved();
  };

  const label = { font: "var(--t-micro)", color: "var(--ink-mute)" } as const;

  return (
    <Modal open onClose={onClose}>
      <div className="col gap-3" style={{ padding: 22 }}>
        <div style={{ font: "var(--t-h3)" }}>{isEdit ? `Edit ${vendor!.vendorCode}` : "New vendor"}</div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Vendor name<span style={{ color: "var(--dan-700)" }}>*</span></label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoFocus placeholder="e.g. Gulf Electricals LLC" />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Category</label>
            <select className="input" value={category} onChange={e => setCategory(e.target.value)}>
              {catOptions.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>
          {isEdit && (
            <div className="col" style={{ gap: 4 }}>
              <label style={label}>Status</label>
              <select className="input" value={status} onChange={e => setStatus(e.target.value as VendorStatus)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Contact person</label>
            <input className="input" value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Phone</label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Address</label>
          <textarea className="textarea" rows={2} value={address} onChange={e => setAddress(e.target.value)} />
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>TRN (UAE)</label>
            <input className="input" value={trn} onChange={e => setTrn(e.target.value)} placeholder="15-digit TRN" />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Foreign tax / reg. no.</label>
            <input className="input" value={foreignTaxNumber} onChange={e => setForeignTaxNumber(e.target.value)} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Country of registration</label>
            <input className="input" value={country} onChange={e => setCountry(e.target.value)} />
          </div>
        </div>

        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Bank account details</label>
            <input className="input" value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder="Account / IBAN / bank" />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <label style={label}>Payment terms (days)</label>
            <input className="input numeric" type="number" min={0} value={paymentTermsDays}
              onChange={e => setPaymentTermsDays(e.target.value)} placeholder="Blank → org default" />
          </div>
        </div>

        <div className="col" style={{ gap: 4 }}>
          <label style={label}>Notes</label>
          <textarea className="textarea" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {err && <div style={{ font: "var(--t-small)", color: "var(--dan-700)" }}><Icon name="alertCircle" size={13} /> {err}</div>}
        <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            <Icon name="check" size={14} /> {isEdit ? "Save vendor" : "Create vendor"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
