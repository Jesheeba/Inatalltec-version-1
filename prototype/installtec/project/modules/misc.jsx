// ============================================================
// Remaining modules - scheduling, projects, repair, inventory,
// logistics, team, reports, admin, live feed.
// Each is functional but lighter than the hero modules.
// ============================================================

// ─── Scheduling ────────────────────────────────────────
function Scheduling() {
  const { openWO } = window.useApp();
  const hours = [];
  for (let h = 7; h <= 19; h++) hours.push(h);
  const wos = Object.values(window.DB.WORK_ORDERS).filter(w => w.scheduledStart.startsWith('2025-05-16'));

  // group by lead
  const leads = [...new Set(wos.map(w => w.assignedLead))];

  const colorMap = (type) => {
    if (type === 'AMC') return { bg: 'var(--pri-100)', bar: 'var(--pri-500)', ink: 'var(--pri-700)' };
    if (type === 'PROJECT') return { bg: 'var(--info-100)', bar: 'var(--info-500)', ink: 'var(--info-700)' };
    if (type === 'REPAIR') return { bg: 'var(--warn-100)', bar: 'var(--warn-500)', ink: 'var(--warn-700)' };
    if (type === 'DELIVERY') return { bg: 'var(--bg-muted)', bar: 'var(--ink-quiet)', ink: 'var(--ink-mute)' };
    if (type === 'SURVEY') return { bg: 'var(--sec-100)', bar: 'var(--sec-500)', ink: 'var(--sec-700)' };
    return { bg: 'var(--bg-muted)', bar: 'var(--ink-quiet)', ink: 'var(--ink-mute)' };
  };

  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Today · 16 May" title="Scheduling & dispatch"
        sub="Unified calendar · drag-drop on desktop, tap-to-select on mobile · conflict detection live."
        right={
          <div className="row gap-2">
            <div className="seg hide-mobile">
              <button data-on="true">Day</button>
              <button>Week</button>
              <button>Month</button>
            </div>
            <button className="btn btn-primary"><Icon name="plus" size={14} /> Schedule WO</button>
          </div>
        }
      />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Today" value={wos.length} sub="scheduled WOs" />
        <window.KPI label="In progress" value={wos.filter(w => w.status === 'In Progress').length} />
        <window.KPI label="Crew on duty" value={leads.length} sub={leads.length + ' leads · 7 techs'} />
        <window.KPI label="Conflicts" value="0" sub="all clear" trend="up" />
      </div>

      <div className="card card-pad">
        {/* Hour rule */}
        <div className="row" style={{ gap: 0, paddingBottom: 8, borderBottom: '1px solid var(--divider)', marginBottom: 14 }}>
          <div style={{ width: 200, flexShrink: 0 }}></div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${hours.length}, 1fr)` }}>
            {hours.map(h => (
              <div key={h} className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>
                {h}:00
              </div>
            ))}
          </div>
        </div>

        {leads.map(uid => {
          const u = window.DB.user(uid);
          const myWOs = wos.filter(w => w.assignedLead === uid);
          return (
            <div key={uid} className="row" style={{ gap: 0, marginBottom: 10 }}>
              <div className="row gap-2" style={{ width: 200, flexShrink: 0, paddingRight: 12 }}>
                <span className={'avatar avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                <div>
                  <div style={{ font: 'var(--t-small)', fontWeight: 600 }} className="truncate">{u.name}</div>
                  <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{window.DB.ROLE_LABELS[u.role]}</div>
                </div>
              </div>
              <div style={{ flex: 1, position: 'relative', height: 56, background: 'var(--bg-muted)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
                {/* grid lines */}
                <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${hours.length}, 1fr)`, pointerEvents: 'none' }}>
                  {hours.map((_, i) => <div key={i} style={{ borderRight: '1px solid var(--bg-elev)' }}></div>)}
                </div>
                {myWOs.map(w => {
                  const sh = parseInt(w.scheduledStart.split('T')[1].slice(0, 2));
                  const sm = parseInt(w.scheduledStart.split('T')[1].slice(3, 5));
                  const eh = parseInt(w.scheduledEnd.split('T')[1].slice(0, 2));
                  const em = parseInt(w.scheduledEnd.split('T')[1].slice(3, 5));
                  const start = sh + sm / 60 - 7;
                  const end = eh + em / 60 - 7;
                  const left = (start / hours.length) * 100;
                  const width = ((end - start) / hours.length) * 100;
                  const c = colorMap(w.type);
                  return (
                    <div key={w.id} onClick={() => openWO(w.id)} style={{
                      position: 'absolute',
                      left: `${left}%`, width: `calc(${width}% - 4px)`,
                      top: 6, bottom: 6,
                      background: c.bg, color: c.ink,
                      borderLeft: '3px solid ' + c.bar,
                      borderRadius: 8,
                      padding: '6px 10px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', justifyContent: 'center',
                    }}>
                      <div className="truncate" style={{ font: 'var(--t-small)', fontWeight: 600 }}>{w.title}</div>
                      <div className="truncate" style={{ font: 'var(--t-micro)', opacity: 0.7 }}>{w.code} · {window.DB.CUSTOMERS[w.customer].name}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Projects ─────────────────────────────────────────
function Projects() {
  const { route, openProject, openWO, go } = window.useApp();
  const id = route.params && route.params.id;
  if (id) return <ProjectDetail id={id} />;
  const all = Object.values(window.DB.PROJECTS);

  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Engineering" title="Projects"
        sub="Contractor projects - lead → DLP → AMC handoff. Multi-month, milestone-driven."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> New project</button>} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Active" value={all.length} />
        <window.KPI label="Value in flight" value={'AED ' + (all.reduce((a, b) => a + b.value, 0) / 1000000).toFixed(2) + 'M'} />
        <window.KPI label="At risk" value={all.filter(p => p.status.includes('Awaiting')).length} sub="VO approval blocking" trend="down" />
        <window.KPI label="Variation orders" value="4" sub="this month" />
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {all.map(p => <ProjectCard key={p.id} p={p} onClick={() => openProject(p.id)} />)}
      </div>
    </div>
  );
}

function ProjectCard({ p, onClick }) {
  const cust = window.DB.CUSTOMERS[p.customer];
  const mgr = window.DB.user(p.manager);
  return (
    <div className="card card-hover card-pad" onClick={onClick}>
      <div className="row between">
        <span className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)' }}>{p.code}</span>
        <window.StatusBadge state={p.status} />
      </div>
      <div style={{ font: 'var(--t-h4)', marginTop: 8 }}>{p.name}</div>
      <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 2 }}>{cust.name}</div>
      <div className="row between" style={{ marginTop: 14 }}>
        <span className="numeric" style={{ font: 'var(--t-small)' }}>AED {(p.value / 1000).toFixed(0)}K</span>
        <span className="numeric" style={{ font: 'var(--t-small)', fontWeight: 600 }}>{p.progress}%</span>
      </div>
      <div className="progress" style={{ marginTop: 6 }}><div style={{ width: p.progress + '%' }}></div></div>
      <div className="row between" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        <div className="row gap-2">
          <span className={'avatar avatar-sm avatar-' + (mgr.tint || 'primary')}>{mgr.initials}</span>
          <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{p.stage}</span>
        </div>
        <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>Due {p.dueAt.slice(5).replace('-', '/')}</span>
      </div>
    </div>
  );
}

function ProjectDetail({ id }) {
  const { go, openWO } = window.useApp();
  const p = window.DB.PROJECTS[id];
  if (!p) return <window.EmptyState icon="alertCircle" title="Project not found" action={<button className="btn btn-primary" onClick={() => go('projects')}>Back</button>} />;
  const cust = window.DB.CUSTOMERS[p.customer];
  const site = window.DB.SITES[p.site];
  const team = window.DB.TEAMS[p.team];
  const wos = window.DB.byProject(id).wos;

  return (
    <div className="main-pad">
      <div style={{ marginBottom: 16 }}>
        <a onClick={() => go('projects')} style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Icon name="chevronLeft" size={14} /> All projects
        </a>
      </div>
      <window.PageHeader eyebrow={p.code} title={p.name} sub={cust.name + ' · ' + site.name} right={<window.StatusBadge state={p.status} />} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Project value" value={'AED ' + (p.value / 1000).toFixed(0) + 'K'} />
        <window.KPI label="Progress" value={p.progress + '%'}><div className="progress" style={{ marginTop: 8 }}><div style={{ width: p.progress + '%' }}></div></div></window.KPI>
        <window.KPI label="Stage" value={p.stage} />
        <window.KPI label="Due" value={p.dueAt} />
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card card-pad">
          <window.CardHead title="Milestones" sub="Standard UAE payment-term ladder" />
          <div style={{ position: 'relative', paddingTop: 12, paddingBottom: 12 }}>
            {/* Timeline */}
            <div style={{ position: 'absolute', left: 22, top: 32, bottom: 32, width: 2, background: 'var(--divider)' }}></div>
            <div className="col" style={{ gap: 12 }}>
              {p.milestones.map(m => (
                <div key={m.id} className="row gap-3">
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: m.done ? 'var(--suc-500)' : 'var(--bg-elev)', border: m.done ? 'none' : '2px solid var(--border-strong)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>
                    {m.done ? <Icon name="check" size={20} strokeWidth={2.5} /> : <span style={{ font: '600 12px/1', color: 'var(--ink-mute)' }} className="numeric">{m.pct}%</span>}
                  </div>
                  <div style={{ flex: 1, padding: 12, background: m.done ? 'var(--suc-50)' : 'var(--bg-muted)', borderRadius: 'var(--r-md)', border: '1px solid ' + (m.done ? 'var(--suc-100)' : 'var(--border)') }}>
                    <div style={{ font: 'var(--t-body-md)' }}>{m.name}</div>
                    <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 2 }}>
                      {m.done ? 'Completed' : 'Pending'} · payment at {m.pct}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card card-pad">
          <window.CardHead title="Team & metadata" />
          <div className="col gap-3">
            {team && <div className="row gap-3" style={{ padding: 10, background: 'var(--bg-muted)', borderRadius: 'var(--r-md)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: 'var(--pri-100)', color: 'var(--pri-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="users" size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ font: 'var(--t-body-md)' }}>{team.name}</div>
                <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{team.members.length + 1} members · {team.skills.join(', ')}</div>
              </div>
            </div>}
            <div className="row between"><span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>Started</span><span className="numeric" style={{ font: 'var(--t-small)' }}>{p.startedAt}</span></div>
            <div className="row between"><span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>Due</span><span className="numeric" style={{ font: 'var(--t-small)' }}>{p.dueAt}</span></div>
            <div className="row between"><span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>Customer</span><a onClick={() => window.useApp().openCustomer(p.customer)} style={{ font: 'var(--t-small)', cursor: 'pointer', color: 'var(--pri-700)' }}>{cust.name}</a></div>
          </div>
        </section>
      </div>

      <section className="card card-pad" style={{ marginTop: 20 }}>
        <window.CardHead title={'Work orders · ' + wos.length} />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {wos.map(w => <window.WoCard key={w.id} wo={w} compact onClick={() => openWO(w.id)} />)}
          {wos.length === 0 && <window.EmptyState icon="briefcase" title="No work orders yet" />}
        </div>
      </section>
    </div>
  );
}

// ─── Repair tickets ────────────────────────────────────
function Repair() {
  const { go } = window.useApp();
  const all = Object.values(window.DB.REPAIRS);
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Service support" title="Repair tickets" sub="Own products + 3rd-party · multi-visit · SLA-tracked"
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> Log ticket</button>} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Open" value={all.filter(t => t.state !== 'Resolved').length} />
        <window.KPI label="SLA at risk" value="2" trend="down" />
        <window.KPI label="Avg TAT" value="3.2h" />
        <window.KPI label="Repeat-failure" value="1" sub="CAM-B-204" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th style={{ width: 90 }}>Code</th><th>Title</th><th className="hide-mobile">Customer · Site</th><th className="hide-mobile" style={{ width: 140 }}>Classification</th><th className="hide-mobile" style={{ width: 100 }}>SLA</th><th style={{ width: 110 }}>State</th></tr></thead>
            <tbody>
              {all.map(t => {
                const c = window.DB.CUSTOMERS[t.customer];
                const s = window.DB.SITES[t.site];
                const slaPct = (t.sla.elapsed / t.sla.target) * 100;
                return (
                  <tr key={t.id} onClick={() => { }}>
                    <td data-th="Code" className="numeric" style={{ fontFamily: 'var(--font-mono)', font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{t.code}</td>
                    <td data-th="Title">
                      <div style={{ font: 'var(--t-body-md)' }}>{t.title}</div>
                      {t.flagged && <span className="badge badge-danger" style={{ marginTop: 4 }}>{t.flagged}</span>}
                    </td>
                    <td data-th="Customer" className="hide-mobile">
                      <div style={{ font: 'var(--t-small)' }}>{c.name}</div>
                      <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{s.name}</div>
                    </td>
                    <td data-th="Class" className="hide-mobile"><span className="badge badge-outline">{t.classification}</span></td>
                    <td data-th="SLA" className="hide-mobile">
                      <div className={'progress' + (slaPct > 85 ? ' progress-warning' : ' progress-success') + ' progress-thin'}><div style={{ width: Math.min(100, slaPct) + '%' }}></div></div>
                      <div className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', marginTop: 4 }}>{t.sla.elapsed}/{t.sla.target}m</div>
                    </td>
                    <td data-th="State"><window.StatusBadge state={t.state} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Inventory ─────────────────────────────────────────
function Inventory() {
  const all = window.DB.INVENTORY;
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Materials" title="Inventory"
        sub="Central · vehicle · site stock · BOQ reconciliation · serial number tracking."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> Material request</button>} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Stock value" value={'AED ' + (all.reduce((a, b) => a + b.value, 0) / 1000).toFixed(0) + 'K'} />
        <window.KPI label="SKUs tracked" value={all.length} />
        <window.KPI label="Low stock" value={all.filter(i => i.central <= i.reorderAt).length} trend="down" />
        <window.KPI label="In transit" value="2" sub="from supplier" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>SKU</th><th>Item</th><th className="hide-mobile" style={{ width: 90 }}>Central</th><th className="hide-mobile" style={{ width: 90 }}>Vehicles</th><th className="hide-mobile" style={{ width: 80 }}>Sites</th><th style={{ width: 120 }}>Status</th></tr></thead>
            <tbody>
              {all.map(i => {
                const low = i.central <= i.reorderAt;
                return (
                  <tr key={i.id}>
                    <td data-th="SKU" className="numeric" style={{ fontFamily: 'var(--font-mono)', font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{i.sku}</td>
                    <td data-th="Item">{i.name}</td>
                    <td data-th="Central" className="hide-mobile numeric" style={{ fontWeight: 600 }}>{i.central}</td>
                    <td data-th="Vehicles" className="hide-mobile numeric">{i.vehicles}</td>
                    <td data-th="Sites" className="hide-mobile numeric">{i.sites}</td>
                    <td data-th="Status">
                      {low ? <span className="badge badge-warning"><span className="dot dot-warning"></span> Reorder</span> : <span className="badge badge-success"><span className="dot dot-success"></span> OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Logistics ─────────────────────────────────────────
function Logistics() {
  const deliveries = Object.values(window.DB.WORK_ORDERS).filter(w => w.type === 'DELIVERY');
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Drivers & vehicles" title="Logistics"
        sub="Material delivery work orders · pickup tasks · vehicle stock."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> New delivery</button>} />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="In transit" value={deliveries.filter(d => d.status === 'In Transit').length} />
        <window.KPI label="Today's deliveries" value={deliveries.length} />
        <window.KPI label="Vehicles" value="3" sub="2 active" />
        <window.KPI label="On time %" value="96%" trend="up" />
      </div>
      <div className="card card-pad">
        <window.CardHead title="Delivery work orders" />
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {deliveries.map(w => <window.WoCard key={w.id} wo={w} compact onClick={() => window.useApp().openWO(w.id)} />)}
        </div>
      </div>
    </div>
  );
}

// ─── Team ──────────────────────────────────────────────
function Team() {
  const users = Object.values(window.DB.USERS).filter(u => u.role !== 'admin' && u.role !== 'subcontractor');
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Workforce" title="Team"
        sub="Skill tags · availability calendar · capacity heatmap."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> Add member</button>} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Active staff" value={users.length} />
        <window.KPI label="Utilisation" value="87%" trend="up" />
        <window.KPI label="Subcontractors" value="3" />
        <window.KPI label="On leave today" value="0" />
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {users.map(u => <UserCard key={u.id} u={u} />)}
      </div>
    </div>
  );
}

function UserCard({ u }) {
  const myWOs = Object.values(window.DB.WORK_ORDERS).filter(w => w.assigned && w.assigned.includes(u.id));
  const activeWO = myWOs.find(w => w.status === 'In Progress' || w.status === 'In Transit');
  return (
    <div className="card card-hover card-pad">
      <div className="row gap-3">
        <span className={'avatar avatar-lg avatar-' + (u.tint || 'primary')}>{u.initials}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--t-body-md)' }} className="truncate">{u.name}</div>
          <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{window.DB.ROLE_LABELS[u.role]}</div>
        </div>
        {activeWO ? <span className="badge badge-success"><span className="dot dot-success dot-pulse"></span> Live</span> : <span className="badge badge-outline">Idle</span>}
      </div>
      {u.skills.length > 0 && (
        <div className="row gap-2" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          {u.skills.map(s => <span key={s} className="badge">{s}</span>)}
        </div>
      )}
      <div className="row between" style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--divider)' }}>
        <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{myWOs.length} WOs · 32h this week</span>
        <button className="btn btn-ghost btn-icon btn-sm"><Icon name="messageCircle" size={13} /></button>
      </div>
    </div>
  );
}

// ─── Reports ───────────────────────────────────────────
function Reports() {
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Analytics" title="Reports"
        sub="Project, technician, customer, operational reporting." />
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="MTD revenue" value="AED 1.28M" sub="8.2% vs LM" trend="up" />
        <window.KPI label="Avg WO cost" value="AED 2,840" sub="margin 38%" />
        <window.KPI label="Free-call conversion" value="62%" trend="up" />
        <window.KPI label="Customer rating" value="4.6 ★" />
      </div>

      <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}>
        <section className="card card-pad">
          <window.CardHead title="Revenue trend · 12 weeks" />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200 }}>
            {[42, 55, 48, 62, 58, 70, 66, 82, 75, 88, 92, 100].map((h, i) => (
              <div key={i} style={{ flex: 1, height: h + '%', background: 'linear-gradient(to top, var(--pri-500), var(--pri-300))', borderRadius: '6px 6px 0 0', opacity: i === 11 ? 1 : 0.85 }}></div>
            ))}
          </div>
        </section>
        <section className="card card-pad">
          <window.CardHead title="Margin by stream" />
          <div className="col gap-3">
            {[{ k: 'Projects', v: 38, c: 'var(--pri-500)' }, { k: 'AMC', v: 52, c: 'var(--sec-500)' }, { k: 'Repair', v: 28, c: 'var(--acc-500)' }].map(r => (
              <div key={r.k}>
                <div className="row between" style={{ marginBottom: 6 }}><span style={{ font: 'var(--t-small)' }}>{r.k}</span><span className="numeric" style={{ font: 'var(--t-small)', fontWeight: 600 }}>{r.v}%</span></div>
                <div className="progress"><div style={{ width: r.v + '%', background: r.c }}></div></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── Live feed (full-page) ─────────────────────────────
function LiveFeed() {
  const { followTarget } = window.useApp();
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="Realtime" title="Live operations feed"
        sub="Every event from the field, in order. Scope-filtered to your projects."
        right={<div className="seg"><button data-on="true">All</button><button>Check-ins</button><button>SLA</button><button>Approvals</button></div>}
      />
      <div className="card" style={{ padding: 8 }}>
        {window.DB.FEED.map(f => <window.FeedItem key={f.id} item={f} onClick={() => followTarget(f.target)} />)}
      </div>
    </div>
  );
}

// ─── Admin (users) ────────────────────────────────────
function Admin() {
  const all = Object.values(window.DB.USERS);
  return (
    <div className="main-pad">
      <window.PageHeader eyebrow="System administration" title="Users & roles"
        sub="Create users, assign roles, configure permissions and scope - the foundation of the platform."
        right={<button className="btn btn-primary"><Icon name="plus" size={14} /> New user</button>} />

      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', marginBottom: 20 }}>
        <window.KPI accent="primary" label="Active users" value={all.length} />
        <window.KPI label="Roles in use" value="11" />
        <window.KPI label="Teams" value={Object.keys(window.DB.TEAMS).length} />
        <window.KPI label="2FA enabled" value="9 / 12" trend="down" />
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>User</th><th>Role</th><th className="hide-mobile">Manager</th><th className="hide-mobile">Region</th><th style={{ width: 100 }}>Status</th><th style={{ width: 60 }}></th></tr></thead>
            <tbody>
              {all.map(u => {
                const mgr = u.mgr ? window.DB.user(u.mgr) : null;
                return (
                  <tr key={u.id}>
                    <td data-th="User">
                      <div className="row gap-3">
                        <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                        <div><div style={{ font: 'var(--t-body-md)' }}>{u.name}</div><div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{u.email}</div></div>
                      </div>
                    </td>
                    <td data-th="Role"><span className="badge badge-outline">{window.DB.ROLE_LABELS[u.role]}</span></td>
                    <td data-th="Manager" className="hide-mobile" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{mgr ? mgr.name : '-'}</td>
                    <td data-th="Region" className="hide-mobile" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{u.region}</td>
                    <td data-th="Status"><span className="badge badge-success"><span className="dot dot-success"></span> Active</span></td>
                    <td><button className="btn btn-ghost btn-icon btn-sm"><Icon name="ellipsis" size={14} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Scheduling, Projects, Repair, Inventory, Logistics, Team, Reports, LiveFeed, Admin });
