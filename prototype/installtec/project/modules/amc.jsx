// ============================================================
// AMC module - list + detail (per contract) + reactivation modal
// ============================================================

function AmcModule() {
  const { route, openAmc, setModal, fireToast } = window.useApp();
  const [filter, setFilter] = React.useState('all');
  const id = route.params && route.params.id;
  if (id) return <AmcDetail id={id} />;

  const all = Object.values(window.DB.AMCS);
  let list = all;
  if (filter !== 'all') list = list.filter(c => c.state === filter);

  const counts = {
    all: all.length,
    PENDING_REACTIVATION: all.filter(c => c.state === 'PENDING_REACTIVATION').length,
    ACTIVE: all.filter(c => c.state === 'ACTIVE').length,
    BLOCKED: all.filter(c => c.state === 'BLOCKED').length,
    RENEWAL_DUE: all.filter(c => c.state === 'RENEWAL_DUE').length,
  };

  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="The strategic gold mine" title="AMC contracts"
        sub="Quarterly maintenance services, recurring revenue, payment-gated execution."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> New AMC</button>} />

      {/* Reactivation alert (if any) */}
      {counts.PENDING_REACTIVATION > 0 && <ReactivationBanner onOpen={() => setModal({ kind: 'reactivation', data: { id: 'amc_091' } })} />}

      {/* KPI strip */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Active contracts" value={counts.ACTIVE} sub="+6 this quarter" trend="up" />
        <window.KPI label="Annualised value" value="AED 1.84M">
          <div className="progress" style={{ marginTop: 8 }}><div style={{ width: '72%' }}></div></div>
        </window.KPI>
        <window.KPI label="Blocked · payment" value={counts.BLOCKED} sub="AED 134K at risk" trend="down" />
        <window.KPI accent="violet" label="Renewal pipeline · 60d" value={counts.RENEWAL_DUE} sub="AED 384K possible" />
      </div>

      <div className="card card-pad" style={{ padding: 14, marginBottom: 16 }}>
        <window.FilterBar value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'PENDING_REACTIVATION', label: 'Reactivation', count: counts.PENDING_REACTIVATION },
          { value: 'ACTIVE', label: 'Active', count: counts.ACTIVE },
          { value: 'BLOCKED', label: 'Blocked', count: counts.BLOCKED },
          { value: 'RENEWAL_DUE', label: 'Renewal due', count: counts.RENEWAL_DUE },
        ]} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 100 }}>Code</th>
                <th>Customer · Site</th>
                <th className="hide-mobile" style={{ width: 140 }}>Services</th>
                <th className="hide-mobile" style={{ width: 120 }}>Next due</th>
                <th className="hide-mobile" style={{ width: 110 }}>Value</th>
                <th style={{ width: 140 }}>State</th>
              </tr>
            </thead>
            <tbody>
              {list.map(c => <AmcRow key={c.id} c={c} onClick={() =>
                c.state === 'PENDING_REACTIVATION' ? setModal({ kind: 'reactivation', data: { id: c.id } }) : openAmc(c.id)} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AmcRow({ c, onClick }) {
  const cust = window.DB.CUSTOMERS[c.customer];
  const site = window.DB.SITES[c.site];
  const isReact = c.state === 'PENDING_REACTIVATION';
  return (
    <tr onClick={onClick} style={{ background: isReact ? 'var(--pri-50)' : undefined }}>
      <td data-th="Code" className="numeric" style={{ fontFamily: 'var(--font-mono)', font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{c.code}</td>
      <td data-th="Customer">
        <div style={{ font: 'var(--t-body-md)' }}>{cust.name}</div>
        <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{site.name}</div>
      </td>
      <td data-th="Services" className="hide-mobile">
        <div className="numeric" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{c.services.done}/{c.services.total}</div>
        <div className="progress progress-thin" style={{ marginTop: 4 }}><div style={{ width: (c.services.done / c.services.total) * 100 + '%' }}></div></div>
      </td>
      <td data-th="Next due" className="hide-mobile">
        <div className="numeric" style={{ font: 'var(--t-small)' }}>{c.nextDue}</div>
        {c.overdueDays > 0 && <div style={{ font: 'var(--t-micro)', color: 'var(--dan-700)' }}>{c.overdueDays}d overdue</div>}
      </td>
      <td data-th="Value" className="hide-mobile numeric" style={{ font: 'var(--t-body-md)', fontWeight: 600 }}>AED {(c.value / 1000).toFixed(0)}K</td>
      <td data-th="State"><window.StatusBadge state={c.state} /></td>
    </tr>
  );
}

function ReactivationBanner({ onOpen }) {
  return (
    <div className="card card-accent card-pad" style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 20 }}>
      <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--bg-elev)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pri-700)' }}>
        <Icon name="refresh" size={24} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="row gap-2">
          <span className="badge" style={{ background: 'var(--pri-500)', color: '#fff' }}>System trigger</span>
          <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>14 min ago</span>
        </div>
        <div style={{ font: 'var(--t-h3)', marginTop: 6 }}>AMC-091 · DAMAC Properties - payment cleared, reactivation needed</div>
        <div style={{ font: 'var(--t-body)', color: 'var(--ink-soft)', marginTop: 2 }}>
          AED 48,000 reconciled this morning. Q2 service WO-3284 is on hold pending your approval.
        </div>
      </div>
      <button onClick={onOpen} className="btn btn-primary btn-lg hide-mobile">
        Review & reactivate <Icon name="arrowRight" size={16} />
      </button>
      <button onClick={onOpen} className="btn btn-primary btn-sm show-mobile">Review</button>
    </div>
  );
}

// ─── AMC Detail ────────────────────────────────────────
function AmcDetail({ id }) {
  const { go, openWO, setModal } = window.useApp();
  const c = window.DB.AMCS[id];
  if (!c) return <window.EmptyState icon="alertCircle" title="AMC not found" action={<button className="btn btn-primary" onClick={() => go('amc')}>Back to AMC</button>} />;
  const cust = window.DB.CUSTOMERS[c.customer];
  const site = window.DB.SITES[c.site];
  const wos = window.DB.byAmc(id).wos;
  const mgr = window.DB.user(c.manager);

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go('amc')} style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All AMC contracts
        </a>
      </div>
      <window.PageHeader
        eyebrow={'AMC · ' + c.code}
        title={cust.name}
        sub={site.name + ' · ' + site.area}
        right={
          <div className="row gap-2">
            {c.state === 'PENDING_REACTIVATION' && (
              <button className="btn btn-primary" onClick={() => setModal({ kind: 'reactivation', data: { id } })}>
                <Icon name="refresh" size={14} /> Reactivate
              </button>
            )}
            <window.StatusBadge state={c.state} />
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI label="Annual value" value={'AED ' + (c.value / 1000).toFixed(0) + 'K'} />
        <window.KPI label="Services" value={c.services.done + ' / ' + c.services.total} sub={'Next: ' + c.nextDue} />
        <window.KPI label="Free calls used" value={c.freeCalls} sub="of 10 included" />
        <window.KPI label="Expires" value={c.expiresAt} />
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card card-pad">
          <window.CardHead title="Service schedule" sub="4 quarterly services per contract year" />
          <div className="col gap-3">
            {[1, 2, 3, 4].map(q => {
              const done = q <= c.services.done;
              const next = q === c.services.done + 1;
              return (
                <div key={q} className="row gap-3" style={{ padding: 12, borderRadius: 'var(--r-md)', background: done ? 'var(--suc-50)' : next ? 'var(--pri-50)' : 'var(--bg-muted)', border: '1px solid ' + (done ? 'var(--suc-100)' : next ? 'var(--pri-200)' : 'var(--border)') }}>
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: done ? 'var(--suc-500)' : next ? 'var(--pri-500)' : 'var(--bg-deep)', color: done || next ? '#fff' : 'var(--ink-mute)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <Icon name="check" size={18} strokeWidth={2.5} /> : <span style={{ font: '600 14px/1', fontFamily: 'var(--font-display)' }}>Q{q}</span>}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: 'var(--t-body-md)' }}>Quarter {q} service</div>
                    <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>
                      {done ? 'Completed' : next ? c.nextDue + ' · ' + (c.state === 'PENDING_REACTIVATION' ? 'Awaiting reactivation' : 'Scheduled') : 'Auto-scheduled'}
                    </div>
                  </div>
                  {next && c.state === 'PENDING_REACTIVATION' && <span className="badge badge-primary">Hold</span>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="card card-pad">
          <window.CardHead title="Contract metadata" />
          <div className="col gap-3">
            <MetaRow k="Customer" v={cust.name} onClick={() => window.useApp().openCustomer(c.customer)} />
            <MetaRow k="Site" v={site.name} sub={site.area} />
            <MetaRow k="Manager" v={mgr.name} sub={window.DB.ROLE_LABELS[mgr.role]} />
            <MetaRow k="Value" v={'AED ' + c.value.toLocaleString()} />
            <MetaRow k="Expires" v={c.expiresAt} />
            <MetaRow k="State" v={<window.StatusBadge state={c.state} />} />
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <window.CardHead title={'Linked work orders · ' + wos.length} sub="One WO per quarterly service · plus any free-call visits" />
        {wos.length === 0 ? (
          <window.EmptyState icon="briefcase" title="No work orders linked yet" />
        ) : (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {wos.map(w => <window.WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          </div>
        )}
      </section>
    </div>
  );
}

function MetaRow({ k, v, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k}</div>
      <div style={{ font: 'var(--t-body-md)', marginTop: 3 }}>{v} {onClick && <Icon name="externalLink" size={11} style={{ color: 'var(--ink-quiet)', marginLeft: 4, verticalAlign: 'middle' }} />}</div>
      {sub && <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─── Reactivation modal ────────────────────────────────
function ReactivationModal() {
  const { modal, setModal, fireToast } = window.useApp();
  const [stage, setStage] = React.useState('review');
  React.useEffect(() => { setStage('review'); }, [modal]);
  if (!modal || modal.kind !== 'reactivation') return null;
  const c = window.DB.AMCS[modal.data.id];
  if (!c) return null;

  const approve = () => {
    setStage('approving');
    setTimeout(() => setStage('done'), 1100);
  };
  const close = () => { setModal(null); if (stage === 'done') fireToast('AMC-091 reactivated · WO-3284 unlocked'); };

  return (
    <window.Modal open={true} onClose={close}>
      {stage !== 'done' && (
        <>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'var(--pri-100)', color: 'var(--pri-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="refresh" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ font: 'var(--t-h3)' }}>Approve AMC reactivation</div>
              <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{c.code} · {window.DB.CUSTOMERS[c.customer].name}</div>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={close}><Icon name="x" size={16} /></button>
          </div>
          <div style={{ padding: 22 }}>
            <div className="card card-pad" style={{ background: 'var(--bg-muted)', border: 'none', padding: 16, marginBottom: 16 }}>
              <KvRow k="Contract value" v={'AED ' + c.value.toLocaleString()} />
              <KvRow k="Payment received" v={'AED ' + c.value.toLocaleString() + ' · today'} good />
              <KvRow k="Days overdue" v={c.overdueDays + ' days'} warn />
              <KvRow k="Next service" v="WO-3284 · Today 09:00" />
            </div>
            <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 8 }}>Reactivation effects</div>
            <div className="col gap-2">
              <Effect icon="checkCircle" text="Contract → ACTIVE" />
              <Effect icon="calendar" text="3 remaining quarterly services restored to schedule" />
              <Effect icon="bell" text="Customer notified via WhatsApp + email" />
              <Effect icon="fileText" text="Audit log entry under your name" />
            </div>
            <textarea className="textarea" placeholder="Optional note to customer & team…" style={{ marginTop: 16 }} />
          </div>
          <div style={{ padding: '14px 22px', borderTop: '1px solid var(--divider)', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={close}>Reject & block</button>
            <button className="btn btn-primary" onClick={approve} disabled={stage === 'approving'}>
              {stage === 'approving' ? <><Icon name="loader" size={14} style={{ animation: 'spin 1s linear infinite' }} /> Reactivating…</> : <><Icon name="check" size={14} /> Approve reactivation</>}
            </button>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
      {stage === 'done' && (
        <div style={{ padding: 44, textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px', background: 'var(--suc-100)', color: 'var(--suc-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="check" size={32} strokeWidth={2.5} />
          </div>
          <div style={{ font: 'var(--t-h2)' }}>Contract reactivated</div>
          <div style={{ font: 'var(--t-body)', color: 'var(--ink-mute)', marginTop: 8, maxWidth: 340, margin: '8px auto 0' }}>
            {c.code} is active. WO-3284 is unlocked and the team is already on site.
          </div>
          <button onClick={close} className="btn btn-primary btn-lg" style={{ marginTop: 22 }}>Done</button>
        </div>
      )}
    </window.Modal>
  );
}

function KvRow({ k, v, good, warn }) {
  return (
    <div className="row between" style={{ padding: '6px 0' }}>
      <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{k}</span>
      <span className="numeric" style={{ font: 'var(--t-body-md)', color: good ? 'var(--suc-700)' : warn ? 'var(--warn-700)' : 'var(--ink)', fontWeight: 600 }}>
        {good && <Icon name="check" size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
        {v}
      </span>
    </div>
  );
}

function Effect({ icon, text }) {
  return (
    <div className="row gap-3" style={{ padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 'var(--r-sm)' }}>
      <Icon name={icon} size={15} style={{ color: 'var(--pri-600)' }} />
      <span style={{ font: 'var(--t-small)', color: 'var(--ink-soft)' }}>{text}</span>
    </div>
  );
}

Object.assign(window, { AmcModule, ReactivationModal });
