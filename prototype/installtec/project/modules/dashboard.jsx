// ============================================================
// Dashboard module - role-aware
// One <Dashboard /> component renders a different layout based on
// the logged-in user's role + scope. Built on shared components.
// ============================================================

function Dashboard() {
  const { role } = window.useApp();

  if (role === 'worker' || role === 'lead_worker' || role === 'driver' || role === 'subcontractor') return <FieldDashboard />;
  if (role === 'md') return <MdDashboard />;
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'service_support') return <SupportDashboard />;
  if (role === 'accounts') return <AccountsDashboard />;
  if (role === 'sales') return <SalesDashboard />;
  return <ManagerDashboard />;
}

// ─── Manager / default Ops dashboard ──────────────────
function ManagerDashboard() {
  const { me, openApproval, openWO, setModal, followTarget, go } = window.useApp();
  const { KPI_OPS, FEED, RISKS, APPROVALS, WORK_ORDERS } = window.DB;
  const [feedFilter, setFeedFilter] = React.useState('all');

  const feed = feedFilter === 'all' ? FEED : feedFilter === 'sla' ? FEED.filter(f => f.tag === 'warning' || f.tag === 'danger') : FEED.filter(f => f.kind === 'check-in');
  const approvals = Object.values(APPROVALS).slice(0, 3);
  const todayWOs = Object.values(WORK_ORDERS).filter(w => w.scheduledStart.startsWith('2025-05-16')).sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart));

  return (
    <div className="main-pad">
      <window.PageHeader
        eyebrow={'Thursday · 16 May · 09:42 GST'}
        title={'Morning, ' + me.name.split(' ')[0] + '.'}
        sub={<><span style={{ color: 'var(--ink)', fontWeight: 600 }}>4 decisions</span> waiting · 1 SLA at risk · DAMAC AMC-091 cleared payment overnight.</>}
        right={
          <div className="seg hide-mobile">
            <button data-on="true">Today</button>
            <button>Week</button>
            <button>Month</button>
            <button>Quarter</button>
          </div>
        }
      />

      {/* KPI strip */}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
        <window.KPI label="Open work orders" value={KPI_OPS.open_wo} accent="primary">
          <div className="row gap-2" style={{ marginTop: 6 }}>
            <span className="badge badge-warning"><span className="dot dot-warning"></span> {KPI_OPS.sla_at_risk} over SLA</span>
          </div>
        </window.KPI>
        <window.KPI label="SLA compliance" value={KPI_OPS.sla_pct + '%'}>
          <div className="progress progress-success" style={{ marginTop: 8 }}><div style={{ width: KPI_OPS.sla_pct + '%' }}></div></div>
        </window.KPI>
        <window.KPI label="AMC revenue · Q2" value={'AED 482K'} sub={(KPI_OPS.amc_growth * 100).toFixed(1) + '% vs Q1'} trend="up" />
        <window.KPI label="Technician utilisation" value={Math.round(KPI_OPS.utilization * 100) + '%'} spark={KPI_OPS.util_spark} />
      </div>

      {/* Two columns: feed + side widgets */}
      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>

        {/* Feed */}
        <section className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="row between" style={{ padding: '18px 20px 8px' }}>
            <div>
              <div className="row gap-2" style={{ font: 'var(--t-h3)' }}>
                <span className="dot dot-success dot-pulse"></span> Live operations feed
              </div>
              <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>Scoped to your projects · auto-refresh</div>
            </div>
            <div className="seg">
              <button data-on={String(feedFilter === 'all')} onClick={() => setFeedFilter('all')}>All</button>
              <button data-on={String(feedFilter === 'check')} onClick={() => setFeedFilter('check')}>Check-ins</button>
              <button data-on={String(feedFilter === 'sla')} onClick={() => setFeedFilter('sla')}>SLA</button>
            </div>
          </div>
          <div style={{ padding: '0 8px 12px' }}>
            {feed.map(f => <window.FeedItem key={f.id} item={f} onClick={() => followTarget(f.target)} />)}
          </div>
        </section>

        {/* Side: Approvals + Risks */}
        <div className="col" style={{ gap: 20 }}>
          <section className="card card-pad">
            <window.CardHead title={'Approvals · ' + approvals.length} sub="Routed to you" right={<a onClick={() => go('approvals')} style={{ font: 'var(--t-small)', color: 'var(--pri-700)', cursor: 'pointer', fontWeight: 500 }}>See all</a>} />
            <div className="col gap-2">
              {approvals.map(a => <window.ApprovalCard key={a.id} ap={a} onClick={() => openApproval(a.id)} />)}
            </div>
          </section>

          <section className="card card-pad">
            <window.CardHead title="Forecasted risks" sub="3-week horizon" right={<span className="badge badge-outline">Auto</span>} />
            <div className="col" style={{ gap: 10 }}>
              {RISKS.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: r.severity === 'danger' ? 'var(--dan-100)' : r.severity === 'warning' ? 'var(--warn-100)' : 'var(--info-100)',
                    color: r.severity === 'danger' ? 'var(--dan-700)' : r.severity === 'warning' ? 'var(--warn-700)' : 'var(--info-700)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={r.kind === 'Material' ? 'package' : r.kind === 'Manpower' ? 'users' : r.kind === 'AMC' ? 'shieldCheck' : 'alertCircle'} size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ font: 'var(--t-body-md)' }}>{r.label}</div>
                    <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{r.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Today's schedule */}
      <section className="card card-pad" style={{ marginTop: 20 }}>
        <window.CardHead title={"Today's schedule · " + todayWOs.length + ' work orders'} sub="Tap any card to see the work order"
          right={<button className="btn btn-ghost btn-sm" onClick={() => go('scheduling')}><Icon name="calendar" size={14} /> Open calendar</button>} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {todayWOs.map(wo => <window.WoCard key={wo.id} wo={wo} compact onClick={() => openWO(wo.id)} />)}
        </div>
      </section>
    </div>
  );
}

// ─── Field worker dashboard ───────────────────────────
function FieldDashboard() {
  const { me, openWO, role } = window.useApp();
  const myWOs = Object.values(window.DB.WORK_ORDERS).filter(w =>
    w.assigned && w.assigned.includes(me.id) && w.scheduledStart.startsWith('2025-05-16')
  );
  const upcoming = Object.values(window.DB.WORK_ORDERS).filter(w =>
    w.assigned && w.assigned.includes(me.id) && w.scheduledStart > '2025-05-16'
  );
  const live = myWOs.find(w => w.status === 'In Progress' || w.status === 'In Transit');

  return (
    <div className="main-pad">
      <window.PageHeader
        eyebrow={'Thursday · 16 May'}
        title={'My day, ' + me.name.split(' ')[0]}
        sub={`${myWOs.length} work orders · est. 7h 30m on site`}
      />

      {live && (
        <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
          <div className="row gap-2" style={{ marginBottom: 6 }}>
            <span className="dot dot-primary dot-pulse"></span>
            <span style={{ font: 'var(--t-micro)', color: 'var(--pri-700)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Live</span>
          </div>
          <div style={{ font: 'var(--t-h3)' }}>{live.title}</div>
          <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 4 }}>
            {window.DB.SITES[live.site].name} · {live.scheduledStart.split('T')[1].slice(0, 5)} – {live.scheduledEnd.split('T')[1].slice(0, 5)}
          </div>
          <div className="row gap-2" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => openWO(live.id)}>Continue work <Icon name="arrowRight" size={14} /></button>
            <button className="btn btn-ghost"><Icon name="navigation" size={14} /> Navigate</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 24 }}>
        <window.KPI label="Today" value={myWOs.length} sub="work orders" />
        <window.KPI label="This week" value="12" sub="est. 38h" />
        <window.KPI label="Pending leave" value="0" sub="all clear" />
      </div>

      <h3 style={{ font: 'var(--t-h2)', margin: '0 0 12px' }}>Next up</h3>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {myWOs.filter(w => w.status !== 'In Progress' && w.status !== 'In Transit').map(wo => (
          <window.WoCard key={wo.id} wo={wo} onClick={() => openWO(wo.id)} />
        ))}
      </div>

      {upcoming.length > 0 && (
        <>
          <h3 style={{ font: 'var(--t-h2)', margin: '24px 0 12px' }}>Upcoming</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {upcoming.map(wo => <window.WoCard key={wo.id} wo={wo} compact onClick={() => openWO(wo.id)} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ─── MD strategic dashboard ───────────────────────────
function MdDashboard() {
  const { me, go } = window.useApp();
  const { FEED, RISKS } = window.DB;
  return (
    <div className="main-pad">
      <window.PageHeader
        eyebrow="Strategic overview · Q2 2025"
        title={'Good morning, ' + me.name.split(' ')[0]}
        sub="14 active projects · 42 AMCs live · 6 countries"
      />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
        <window.KPI accent="primary" label="MTD revenue" value="AED 1.28M" sub="8.2% vs LM" trend="up" />
        <window.KPI label="AMC base" value="AED 1.84M" sub="42 contracts · 78% renewal rate" />
        <window.KPI accent="violet" label="Project pipeline" value="AED 14.2M" sub="11 quotes in review" />
        <window.KPI label="DSO" value="48 days" sub="↑ 4d vs target" trend="down" />
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card card-pad">
          <window.CardHead title="Revenue by stream" sub="Last 6 months" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 220, padding: '12px 0' }}>
            {[
              { m: 'Dec', proj: 720, amc: 280, rep: 140 },
              { m: 'Jan', proj: 880, amc: 320, rep: 110 },
              { m: 'Feb', proj: 940, amc: 360, rep: 180 },
              { m: 'Mar', proj: 1020, amc: 380, rep: 140 },
              { m: 'Apr', proj: 1140, amc: 420, rep: 160 },
              { m: 'May', proj: 1280, amc: 482, rep: 190 },
            ].map((b, i) => {
              const max = 2000;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: '100%', maxWidth: 56, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 3 }}>
                    <div style={{ background: 'var(--pri-500)', height: (b.proj / max) * 100 + '%', borderRadius: '6px 6px 0 0' }}></div>
                    <div style={{ background: 'var(--sec-500)', height: (b.amc / max) * 100 + '%' }}></div>
                    <div style={{ background: 'var(--acc-500)', height: (b.rep / max) * 100 + '%' }}></div>
                  </div>
                  <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{b.m}</div>
                </div>
              );
            })}
          </div>
          <div className="row gap-3" style={{ marginTop: 8, font: 'var(--t-small)', color: 'var(--ink-mute)' }}>
            <span><span className="dot dot-primary"></span> Projects</span>
            <span><span className="dot" style={{ background: 'var(--sec-500)' }}></span> AMC</span>
            <span><span className="dot" style={{ background: 'var(--acc-500)' }}></span> Repair</span>
          </div>
        </section>

        <section className="card card-pad">
          <window.CardHead title="High-value escalations" sub="MD-level only" />
          <div className="col gap-2">
            <window.ApprovalCard ap={window.DB.APPROVALS.ap_439} onClick={() => window.useApp().openApproval('ap_439')} />
            <window.ApprovalCard ap={window.DB.APPROVALS.ap_438} onClick={() => window.useApp().openApproval('ap_438')} />
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', marginTop: 20 }}>
        <section className="card card-pad">
          <window.CardHead title="Country revenue split" />
          <div className="col" style={{ gap: 10 }}>
            {[
              { c: 'UAE', v: 1820, pct: 71, color: 'var(--pri-500)' },
              { c: 'KSA', v: 380, pct: 15, color: 'var(--sec-500)' },
              { c: 'Ethiopia', v: 180, pct: 7, color: 'var(--acc-500)' },
              { c: 'India', v: 120, pct: 5, color: 'var(--info-500)' },
              { c: 'Uganda', v: 60, pct: 2, color: 'var(--warn-500)' },
            ].map(r => (
              <div key={r.c}>
                <div className="row between" style={{ marginBottom: 6 }}>
                  <span style={{ font: 'var(--t-small)' }}>{r.c}</span>
                  <span className="numeric" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>AED {r.v}K · {r.pct}%</span>
                </div>
                <div className="progress"><div style={{ width: r.pct + '%', background: r.color }}></div></div>
              </div>
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <window.CardHead title="Compliance" />
          <div className="col" style={{ gap: 10 }}>
            <ComplianceRow label="SIRA registration" sub="Renews 23 Jun · 38 days" ok />
            <ComplianceRow label="Trade license" sub="Renews 14 Sep" ok />
            <ComplianceRow label="3 staff visas" sub="2 expiring within 60 days" warn />
            <ComplianceRow label="Insurance" sub="Auto-renew · valid" ok />
          </div>
        </section>
      </div>
    </div>
  );
}

function ComplianceRow({ label, sub, ok, warn }) {
  return (
    <div className="row gap-3" style={{ padding: '10px 12px', background: 'var(--bg-muted)', borderRadius: 'var(--r-md)' }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: warn ? 'var(--warn-100)' : 'var(--suc-100)',
        color: warn ? 'var(--warn-700)' : 'var(--suc-700)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={warn ? 'alertCircle' : 'shieldCheck'} size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ font: 'var(--t-body-md)' }}>{label}</div>
        <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Service Support dashboard ────────────────────────
function SupportDashboard() {
  const { go } = window.useApp();
  const tickets = Object.values(window.DB.REPAIRS);
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Service desk" title="Repair queue" sub={tickets.filter(t => t.state !== 'Resolved').length + ' open tickets · 2 SLA at risk'} />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 24 }}>
        <window.KPI accent="primary" label="Open tickets" value={tickets.filter(t => t.state !== 'Resolved').length} />
        <window.KPI label="SLA at risk" value="2" sub="next breach in 12m" trend="down" />
        <window.KPI label="Avg resolution" value="3.2h" />
        <window.KPI label="Repeat-failure flags" value="1" sub="CAM-B-204" />
      </div>
      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: 16 }}>
          <h3 style={{ font: 'var(--t-h3)', margin: 0 }}>All tickets</h3>
          <button className="btn btn-primary btn-sm" onClick={() => go('repair')}>Open repair module</button>
        </div>
        <div style={{ padding: 12 }}>
          <div className="col gap-2">
            {tickets.map(t => <RepairRow key={t.id} t={t} onClick={() => go('repair')} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RepairRow({ t, onClick }) {
  const c = window.DB.CUSTOMERS[t.customer];
  return (
    <div className="card card-hover" style={{ padding: 14 }} onClick={onClick}>
      <div className="row between">
        <div className="row gap-2">
          <span className="numeric" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>{t.code}</span>
          <window.StatusBadge state={t.state} />
          {t.flagged && <span className="badge badge-danger">{t.flagged}</span>}
        </div>
        <span style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)' }}>{t.openedAt}</span>
      </div>
      <div style={{ font: 'var(--t-body-md)', marginTop: 6 }}>{t.title}</div>
      <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{c.name}</div>
    </div>
  );
}

// ─── Accounts dashboard ───────────────────────────────
function AccountsDashboard() {
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Finance" title="Accounts overview" sub="Invoicing, payments, AMC billing" />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
        <window.KPI accent="primary" label="Outstanding AR" value="AED 2.84M" sub="48d DSO" trend="down" />
        <window.KPI label="MTD invoiced" value="AED 1.28M" sub="8.2% vs LM" trend="up" />
        <window.KPI label="AMC due billing" value="11" sub="AED 384K" />
        <window.KPI label="Approval queue" value="4" />
      </div>
      <window.EmptyState icon="receipt" title="Invoicing dashboard coming online"
        sub="The full accounts module surfaces AR aging, payment reconciliation against AMC contracts, free-call → invoice conversion, and the AMC reactivation queue. Hooked in next sprint."
        action={<button className="btn btn-ghost">Read spec</button>} />
    </div>
  );
}

// ─── Sales dashboard ──────────────────────────────────
function SalesDashboard() {
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Sales" title="My pipeline" sub="11 quotes in flight · AED 14.2M pipeline" />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 24 }}>
        <window.KPI accent="primary" label="Open quotations" value="11" sub="AED 14.2M" />
        <window.KPI label="AMC renewals · 60d" value="11" sub="AED 384K possible" />
        <window.KPI label="Win rate (TTM)" value="62%" trend="up" />
        <window.KPI label="Lead aging" value="5" sub="leads >14 days" trend="down" />
      </div>
      <window.EmptyState icon="trendingUp" title="Sales workspace" sub="Pipeline, quotation pipeline, AMC renewal queue, lead aging, and your communication timeline live here. Wired in next sprint." />
    </div>
  );
}

// ─── Admin dashboard ──────────────────────────────────
function AdminDashboard() {
  const { go } = window.useApp();
  const users = Object.values(window.DB.USERS);
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="System administration" title="Installtec OS" sub="Users, roles, permissions, approval chains, audit log" right={<button className="btn btn-primary" onClick={() => go('admin')}><Icon name="plus" size={14} /> New user</button>} />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 24 }}>
        <window.KPI accent="primary" label="Active users" value={users.filter(u => u.role !== 'subcontractor').length} sub="across 11 roles" />
        <window.KPI label="Approval chains" value="8" sub="all active" />
        <window.KPI label="2FA enabled" value="9 / 12" sub="3 pending" trend="down" />
        <window.KPI label="Audit events (24h)" value="148" />
      </div>
      <section className="card card-pad">
        <window.CardHead title="Recently added" right={<button className="btn btn-ghost btn-sm" onClick={() => go('admin')}>Manage users</button>} />
        <div className="col gap-2">
          {users.slice(0, 5).map(u => (
            <div key={u.id} className="row gap-3" style={{ padding: '10px 12px', borderRadius: 'var(--r-md)' }}>
              <span className={'avatar avatar-md avatar-' + (u.tint || 'primary')}>{u.initials}</span>
              <div style={{ flex: 1 }}>
                <div style={{ font: 'var(--t-body-md)' }}>{u.name}</div>
                <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{window.DB.ROLE_LABELS[u.role]} · {u.email}</div>
              </div>
              <span className="badge badge-success"><span className="dot dot-success"></span> Active</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

window.Dashboard = Dashboard;
