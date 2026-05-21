// ============================================================
// Approvals module - queue + chain visualization + detail slide-over
// Admin-configured chains, dynamic approver resolution.
// ============================================================

function Approvals() {
  const { openApproval, setModal } = window.useApp();
  const [filter, setFilter] = React.useState('pending');
  const [kindFilter, setKindFilter] = React.useState('all');

  const all = Object.values(window.DB.APPROVALS);
  let list = all;
  if (kindFilter !== 'all') list = list.filter(a => a.kind === kindFilter);

  const kinds = [...new Set(all.map(a => a.kind))];

  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Workflow" title="Approvals"
        sub="Universal approval router · admin-configured chains · dynamic approver resolution."
        right={
          <div className="seg hide-mobile">
            <button data-on={String(filter === 'pending')} onClick={() => setFilter('pending')}>Awaiting me · {all.length}</button>
            <button data-on={String(filter === 'all')} onClick={() => setFilter('all')}>All</button>
            <button data-on={String(filter === 'config')} onClick={() => setFilter('config')}>Chain config</button>
          </div>
        }
      />

      {/* Configuration view */}
      {filter === 'config' ? <ChainConfig /> : (
        <>
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 20 }}>
            <window.KPI accent="primary" label="Awaiting you" value={all.length} />
            <window.KPI label="High priority" value={all.filter(a => a.priority === 'high').length} />
            <window.KPI label="Avg cycle time" value="2h 14m" trend="up" sub="↓ 28% MoM" />
            <window.KPI label="Approved this week" value="42" />
          </div>

          <div className="card card-pad" style={{ padding: 14, marginBottom: 16 }}>
            <window.FilterBar value={kindFilter} onChange={setKindFilter}
              options={[{ value: 'all', label: 'All kinds' }, ...kinds.map(k => ({ value: k, label: k }))]} />
          </div>

          {/* Two columns: queue + selected detail preview */}
          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            <div className="col gap-3">
              {list.map(a => <ApprovalQueueCard key={a.id} ap={a} onClick={() =>
                a.kind === 'AMC Reactivation' ? setModal({ kind: 'reactivation', data: { id: a.target.id } }) : openApproval(a.id)} />)}
              {list.length === 0 && <window.EmptyState icon="inbox" title="All caught up" sub="No approvals awaiting your action." />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ApprovalQueueCard({ ap, onClick }) {
  const requester = ap.requester === 'system' ? { name: 'System', initials: 'SY', tint: 'primary' } : window.DB.user(ap.requester);
  const kindCls = ap.kind === 'AMC Reactivation' ? 'badge-primary'
    : ap.kind === 'Variation Order' ? 'badge-violet'
      : ap.kind === 'Material Request' ? 'badge-info'
        : ap.kind === 'Leave Request' ? 'badge-peach'
          : 'badge-outline';
  return (
    <div className="card card-hover" style={{
      padding: 18,
      borderLeft: ap.priority === 'high' ? '3px solid var(--pri-500)' : '1px solid var(--border)',
      paddingLeft: ap.priority === 'high' ? 15 : 18,
    }} onClick={onClick}>
      <div className="row between">
        <div className="row gap-2">
          <span className={'badge ' + kindCls}>{ap.kind}</span>
          <span className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>{ap.code}</span>
          {ap.priority === 'high' && <span className="badge badge-danger">High</span>}
        </div>
        <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{ap.openedAt}</span>
      </div>
      <div style={{ font: 'var(--t-body-md)', marginTop: 8, color: 'var(--ink)' }}>{ap.context}</div>
      <div className="row gap-2" style={{ marginTop: 8 }}>
        <span className={'avatar avatar-sm avatar-' + (requester.tint || 'primary')}>{requester.initials}</span>
        <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>
          {requester.name}{ap.amount ? <> · <span className="numeric" style={{ color: 'var(--ink)', fontWeight: 600 }}>AED {ap.amount.toLocaleString()}</span></> : ''}
        </span>
      </div>
      {/* Chain preview */}
      <div className="row gap-1" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        <span style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Chain</span>
        <div style={{ flex: 1 }} className="row gap-1">
          {ap.chain.map((s, i) => {
            const u = window.DB.user(s.user);
            return (
              <React.Fragment key={s.step}>
                <div title={u.name + ' · ' + s.state} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 'var(--r-pill)',
                  background: s.state === 'approved' ? 'var(--suc-50)' : s.state === 'pending' ? 'var(--pri-50)' : 'var(--bg-muted)',
                  border: '1px solid ' + (s.state === 'approved' ? 'var(--suc-100)' : s.state === 'pending' ? 'var(--pri-200)' : 'var(--border)'),
                  opacity: s.state === 'queued' ? 0.6 : 1,
                  font: 'var(--t-micro)',
                  color: s.state === 'approved' ? 'var(--suc-700)' : s.state === 'pending' ? 'var(--pri-700)' : 'var(--ink-mute)',
                }}>
                  <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')} style={{ width: 18, height: 18, fontSize: 9, border: 'none' }}>{u.initials}</span>
                  <span style={{ fontWeight: 600 }}>{u.name.split(' ')[0]}</span>
                  {s.state === 'approved' && <Icon name="check" size={11} />}
                  {s.state === 'pending' && <span className="dot dot-primary"></span>}
                </div>
                {i < ap.chain.length - 1 && <Icon name="chevronRight" size={12} style={{ color: 'var(--ink-quiet)' }} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Approval Slide-Over ────────────────────────────────
function ApprovalSlideover() {
  const { slideover, setSlideover, fireToast } = window.useApp();
  if (!slideover || slideover.kind !== 'approval') return null;
  const ap = window.DB.APPROVALS[slideover.id];
  if (!ap) return null;
  const requester = ap.requester === 'system' ? { name: 'System', initials: 'SY', tint: 'primary' } : window.DB.user(ap.requester);
  const targetLabel = labelForTarget(ap.target);
  const onClose = () => setSlideover(null);

  return (
    <window.SlideOver open onClose={onClose} title={ap.kind}
      sub={<span style={{ fontFamily: 'var(--font-mono)' }}>{ap.code}</span>}
      foot={
        <>
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-danger" onClick={() => { fireToast('Approval rejected · ' + ap.code); onClose(); }}>
            Reject
          </button>
          <button className="btn btn-primary" onClick={() => { fireToast('Approved ' + ap.code); onClose(); }}>
            <Icon name="check" size={14} /> Approve
          </button>
        </>
      }
    >
      <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
        <div className="row between gap-3">
          <div className="row gap-2">
            <span className="badge badge-primary">{ap.kind}</span>
            {ap.priority === 'high' && <span className="badge badge-danger">High priority</span>}
          </div>
          <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>opened {ap.openedAt}</span>
        </div>
        <div style={{ font: 'var(--t-h3)', marginTop: 10 }}>{ap.context}</div>
        {ap.amount != null && <div className="numeric" style={{ font: '600 28px/1.1 var(--font-display)', color: 'var(--ink)', marginTop: 8 }}>AED {ap.amount.toLocaleString()}</div>}
      </div>

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <window.CardHead title="Requester" />
        <div className="row gap-3" style={{ padding: '10px 0' }}>
          <span className={'avatar avatar-md avatar-' + (requester.tint || 'primary')}>{requester.initials}</span>
          <div style={{ flex: 1 }}>
            <div style={{ font: 'var(--t-body-md)' }}>{requester.name}</div>
            <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>
              {ap.requester === 'system' ? 'Automated trigger' : window.DB.ROLE_LABELS[requester.role]}
            </div>
          </div>
        </div>
        {ap.notes && <div style={{ padding: 12, background: 'var(--bg-muted)', borderRadius: 'var(--r-md)', font: 'var(--t-small)', color: 'var(--ink-soft)' }}>{ap.notes}</div>}
      </section>

      {targetLabel && (
        <section className="card card-pad" style={{ marginBottom: 16 }}>
          <window.CardHead title="Linked entity" />
          <div onClick={() => window.useApp().followTarget(ap.target)} className="row gap-3" style={{ padding: 10, borderRadius: 'var(--r-md)', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
            onMouseLeave={e => e.currentTarget.style.background = ''}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--bg-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={targetLabel.icon} size={16} style={{ color: 'var(--ink-mute)' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: 'var(--t-body-md)' }}>{targetLabel.title}</div>
              <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{targetLabel.sub}</div>
            </div>
            <Icon name="chevronRight" size={14} style={{ color: 'var(--ink-quiet)' }} />
          </div>
        </section>
      )}

      <section className="card card-pad" style={{ marginBottom: 16 }}>
        <window.CardHead title="Approval chain" sub="Admin-configured · dynamically resolved" />
        <div className="col gap-2">
          {ap.chain.map((step, i) => {
            const u = window.DB.user(step.user);
            return (
              <div key={step.step} className="row gap-3" style={{ padding: 12, borderRadius: 'var(--r-md)', background: step.state === 'approved' ? 'var(--suc-50)' : step.state === 'pending' ? 'var(--pri-50)' : 'var(--bg-muted)', border: '1px solid ' + (step.state === 'approved' ? 'var(--suc-100)' : step.state === 'pending' ? 'var(--pri-200)' : 'var(--border)'), opacity: step.state === 'queued' ? 0.7 : 1 }}>
                <span style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', fontWeight: 600, width: 24 }}>0{step.step}</span>
                <span className={'avatar avatar-md avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ font: 'var(--t-body-md)' }}>{u.name}</div>
                  <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', textTransform: 'capitalize' }}>{step.role.replace('_', ' ')}</div>
                </div>
                <div>
                  {step.state === 'approved' && <span className="badge badge-success"><Icon name="check" size={11} /> Approved · {step.at}</span>}
                  {step.state === 'pending' && <span className="badge badge-primary"><span className="dot dot-primary dot-pulse"></span> Pending</span>}
                  {step.state === 'queued' && <span className="badge badge-outline">Queued</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card card-pad">
        <window.CardHead title="Comment" sub="Optional note attached to your decision" />
        <textarea className="textarea" placeholder="Why are you approving / rejecting this?" />
      </section>
    </window.SlideOver>
  );
}

function labelForTarget(target) {
  if (!target) return null;
  switch (target.kind) {
    case 'amc': { const a = window.DB.AMCS[target.id]; return a && { icon: 'shieldCheck', title: a.code, sub: window.DB.CUSTOMERS[a.customer].name }; }
    case 'project': { const p = window.DB.PROJECTS[target.id]; return p && { icon: 'briefcase', title: p.code + ' · ' + p.name, sub: window.DB.CUSTOMERS[p.customer].name }; }
    case 'wo': { const w = window.DB.WORK_ORDERS[target.id]; return w && { icon: 'briefcase', title: w.code + ' · ' + w.title, sub: window.DB.CUSTOMERS[w.customer].name }; }
    case 'repair': { const r = window.DB.REPAIRS[target.id]; return r && { icon: 'wrench', title: r.code + ' · ' + r.title, sub: window.DB.CUSTOMERS[r.customer].name }; }
    case 'user': { const u = window.DB.user(target.id); return { icon: 'user', title: u.name, sub: window.DB.ROLE_LABELS[u.role] }; }
  }
  return null;
}

// ─── Chain configuration view (admin-controlled) ─────
function ChainConfig() {
  const CHAINS = [
    { type: 'Quotation', cond: 'Value < AED 50K', steps: ['sales (Sales Mgr)'] },
    { type: 'Quotation', cond: 'AED 50K – 200K', steps: ['sales (Sales Mgr)', 'manager (Ops Mgr)'] },
    { type: 'Quotation', cond: '> AED 200K', steps: ['sales (Sales Mgr)', 'manager (Ops Mgr)', 'md (MD)'] },
    { type: 'AMC Reactivation', cond: 'Any', steps: ['manager (assigned)'] },
    { type: 'AMC Block Override', cond: 'Any', steps: ['md (MD)'] },
    { type: 'Material Request', cond: '< AED 5K', steps: ['lead_worker (Lead)'] },
    { type: 'Material Request', cond: '≥ AED 5K', steps: ['lead_worker (Lead)', 'manager (Ops Mgr)'] },
    { type: 'Overtime Request', cond: 'Any', steps: ['lead_worker (Lead)', 'manager (Ops Mgr)'] },
    { type: 'Variation Order', cond: 'Any', steps: ['manager (Ops Mgr)', 'md (MD)'] },
    { type: 'Subcontractor Payment', cond: 'Any', steps: ['manager', 'accounts', 'md'] },
    { type: 'Leave Request', cond: 'Any', steps: ['lead_worker (Lead)', 'manager (Ops Mgr)'] },
    { type: 'Invoice Approval', cond: 'Any', steps: ['accounts', 'manager (Ops Mgr)'] },
  ];
  return (
    <>
      <window.PageHeader title="Approval chain configuration"
        sub="Define who approves what. Chains are admin-configured; the system resolves the actual approver dynamically using the requester's scope (team, manager, customer assignment)."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> Add chain</button>} />
      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th style={{ width: 200 }}>Approval type</th><th style={{ width: 180 }}>Conditions</th><th>Chain</th><th style={{ width: 80 }}></th></tr></thead>
            <tbody>
              {CHAINS.map((c, i) => (
                <tr key={i}>
                  <td data-th="Type"><span style={{ font: 'var(--t-body-md)' }}>{c.type}</span></td>
                  <td data-th="Conditions" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{c.cond}</td>
                  <td data-th="Chain">
                    <div className="row gap-2" style={{ flexWrap: 'wrap' }}>
                      {c.steps.map((s, j) => (
                        <React.Fragment key={j}>
                          <span className="badge badge-outline">{s}</span>
                          {j < c.steps.length - 1 && <Icon name="chevronRight" size={12} style={{ color: 'var(--ink-quiet)' }} />}
                        </React.Fragment>
                      ))}
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-icon btn-sm"><Icon name="pen" size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { Approvals, ApprovalSlideover });
