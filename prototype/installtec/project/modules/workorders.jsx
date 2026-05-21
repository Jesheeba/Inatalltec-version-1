// ============================================================
// Work Orders module - list + slide-over detail
// The heart of the platform. Every WO connects to a source entity
// (project / AMC / repair) and to assigned users.
// ============================================================

function WorkOrders() {
  const { openWO, go } = window.useApp();
  const [filter, setFilter] = React.useState('all');
  const [view, setView] = React.useState('list');
  const [q, setQ] = React.useState('');

  const all = Object.values(window.DB.WORK_ORDERS);
  const counts = {
    all: all.length,
    today: all.filter(w => w.scheduledStart.startsWith('2025-05-16')).length,
    live: all.filter(w => w.status === 'In Progress' || w.status === 'In Transit').length,
    scheduled: all.filter(w => w.status === 'Scheduled' || w.status === 'Assigned').length,
    closed: all.filter(w => w.status === 'Closed' || w.status === 'Completed').length,
  };

  let list = all;
  if (filter === 'today') list = list.filter(w => w.scheduledStart.startsWith('2025-05-16'));
  if (filter === 'live') list = list.filter(w => w.status === 'In Progress' || w.status === 'In Transit');
  if (filter === 'scheduled') list = list.filter(w => w.status === 'Scheduled' || w.status === 'Assigned');
  if (filter === 'closed') list = list.filter(w => w.status === 'Closed' || w.status === 'Completed');
  if (q.trim()) {
    const lq = q.toLowerCase();
    list = list.filter(w =>
      w.code.toLowerCase().includes(lq) || w.title.toLowerCase().includes(lq) ||
      (window.DB.CUSTOMERS[w.customer].name.toLowerCase().includes(lq))
    );
  }

  return (
    <div className="main-pad">
      <window.PageHeader
        eyebrow="The execution layer"
        title="Work orders"
        sub="Every field activity - projects, AMC services, repair visits, deliveries, surveys - runs through here."
        right={
          <div className="row gap-2">
            <button className="btn btn-ghost btn-sm hide-mobile" onClick={() => go('scheduling')}>
              <Icon name="calendar" size={14} /> Schedule view
            </button>
            <button className="btn btn-primary"><Icon name="plus" size={14} /> New work order</button>
          </div>
        }
      />

      <div className="card card-pad" style={{ padding: 16, marginBottom: 16 }}>
        <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="input-search-wrap" style={{ flex: 1, minWidth: 240, maxWidth: 360 }}>
            <Icon name="search" size={14} />
            <input className="input input-sm" placeholder="Search by code, title, customer…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="seg hide-mobile">
            <button data-on={String(view === 'list')} onClick={() => setView('list')}>
              <Icon name="list" size={14} /> List
            </button>
            <button data-on={String(view === 'cards')} onClick={() => setView('cards')}>
              <Icon name="grid" size={14} /> Cards
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <window.FilterBar
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'today', label: 'Today', count: counts.today },
              { value: 'live', label: 'Live', count: counts.live },
              { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
              { value: 'closed', label: 'Completed', count: counts.closed },
            ]}
          />
        </div>
      </div>

      {list.length === 0 ? (
        <window.EmptyState icon="briefcase" title="No work orders match" sub="Try a different filter or clear the search." />
      ) : view === 'list' ? (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Code</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th>Title</th>
                  <th className="hide-mobile">Customer</th>
                  <th className="hide-mobile" style={{ width: 140 }}>Window</th>
                  <th className="hide-mobile" style={{ width: 130 }}>Assigned</th>
                  <th style={{ width: 130 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map(wo => <WoTableRow key={wo.id} wo={wo} onClick={() => openWO(wo.id)} />)}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {list.map(wo => <window.WoCard key={wo.id} wo={wo} onClick={() => openWO(wo.id)} />)}
        </div>
      )}
    </div>
  );
}

function WoTableRow({ wo, onClick }) {
  const cust = window.DB.CUSTOMERS[wo.customer];
  const site = window.DB.SITES[wo.site];
  const time = wo.scheduledStart.split('T')[1].slice(0, 5) + ' – ' + wo.scheduledEnd.split('T')[1].slice(0, 5);
  const typeMap = {
    AMC: 'badge-primary', PROJECT: 'badge-info', REPAIR: 'badge-warning',
    DELIVERY: 'badge-outline', SURVEY: 'badge-violet',
  };
  return (
    <tr onClick={onClick}>
      <td data-th="Code" className="numeric" style={{ fontFamily: 'var(--font-mono)', font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{wo.code}</td>
      <td data-th="Type"><span className={'badge ' + (typeMap[wo.type] || '')}>{wo.type}</span></td>
      <td data-th="Title">
        <div style={{ font: 'var(--t-body-md)', color: 'var(--ink)' }}>{wo.title}</div>
        <div className="show-mobile" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{cust.name} · {site.name}</div>
      </td>
      <td data-th="Customer" className="hide-mobile">
        <div style={{ font: 'var(--t-small)' }}>{cust.name}</div>
        <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{site.name}</div>
      </td>
      <td data-th="Window" className="hide-mobile numeric" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{time}</td>
      <td data-th="Assigned" className="hide-mobile">
        <div className="avatar-stack">
          {(wo.assigned || []).slice(0, 3).map(uid => {
            const u = window.DB.user(uid);
            return <span key={uid} className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>;
          })}
        </div>
      </td>
      <td data-th="Status"><window.StatusBadge state={wo.status} /></td>
    </tr>
  );
}

// ─── WO Slide-over detail ──────────────────────────────
function WoSlideover() {
  const ctx = window.useApp();
  const { slideover, setSlideover, fireToast, followTarget } = ctx;
  if (!slideover || slideover.kind !== 'wo') return null;
  const wo = window.DB.WORK_ORDERS[slideover.id];
  if (!wo) return null;
  return <WoDetail wo={wo} onClose={() => setSlideover(null)} fireToast={fireToast} followTarget={followTarget} />;
}

function WoDetail({ wo, onClose, fireToast, followTarget }) {
  const [tasks, setTasks] = React.useState(wo.tasks || []);
  const [tab, setTab] = React.useState('overview');
  const cust = window.DB.CUSTOMERS[wo.customer];
  const site = window.DB.SITES[wo.site];
  const lead = window.DB.user(wo.assignedLead);
  const doneCount = tasks.filter(t => t.done).length;
  const totalTasks = tasks.length;

  const typeMap = {
    AMC: 'badge-primary', PROJECT: 'badge-info', REPAIR: 'badge-warning',
    DELIVERY: 'badge-outline', SURVEY: 'badge-violet',
  };

  return (
    <window.SlideOver open={true} onClose={onClose}
      title={wo.title}
      sub={<span className="numeric" style={{ fontFamily: 'var(--font-mono)' }}>{wo.code} · {wo.type}</span>}
      foot={
        <>
          <button className="btn btn-soft" onClick={onClose}>Close</button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost"><Icon name="messageCircle" size={14} /> Message team</button>
          {wo.status !== 'Closed' && (
            <button className="btn btn-primary" onClick={() => { fireToast('Work order marked complete · service report queued'); onClose(); }}>
              <Icon name="checkCircle" size={14} /> Mark complete
            </button>
          )}
        </>
      }
    >
      {/* Hero strip */}
      <div className="card card-accent card-pad" style={{ marginBottom: 16 }}>
        <div className="row between gap-3">
          <div className="row gap-2">
            <span className={'badge ' + (typeMap[wo.type] || '')} style={{ fontWeight: 600 }}>{wo.type}</span>
            <window.StatusBadge state={wo.status} />
            {wo.priority === 'High' && <span className="badge badge-danger">High priority</span>}
          </div>
          <span style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>SLA target {wo.slaMin || '-'}m</span>
        </div>
        <div style={{ font: 'var(--t-h2)', marginTop: 10 }}>{wo.title}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <DetailField icon="building" label="Customer" value={cust.name} onClick={() => followTarget({ kind: 'customer', id: wo.customer })} />
          <DetailField icon="mapPin" label="Site" value={site.name} sub={site.area} />
          <DetailField icon="clock" label="Window" value={wo.scheduledStart.split('T')[1].slice(0, 5) + ' – ' + wo.scheduledEnd.split('T')[1].slice(0, 5)} sub="Today" />
          <DetailField icon="layers" label="Source" value={sourceLabel(wo.source)} onClick={() => followTarget(wo.source)} />
        </div>

        {wo.slaMin && (
          <div style={{ marginTop: 16 }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <span style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>SLA</span>
              <span className="numeric" style={{ font: 'var(--t-small)', color: wo.elapsedMin > wo.slaMin * 0.85 ? 'var(--warn-700)' : 'var(--ink-mute)' }}>
                {wo.elapsedMin}m elapsed · {Math.max(0, wo.slaMin - wo.elapsedMin)}m remaining
              </span>
            </div>
            <div className={'progress' + (wo.elapsedMin > wo.slaMin * 0.85 ? ' progress-warning' : ' progress-success')}>
              <div style={{ width: Math.min(100, (wo.elapsedMin / wo.slaMin) * 100) + '%' }}></div>
            </div>
          </div>
        )}
      </div>

      {wo.flagged && (
        <div style={{ padding: '12px 14px', background: 'var(--dan-50)', color: 'var(--dan-700)', borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Icon name="alertTriangle" size={16} /> <span style={{ font: 'var(--t-body-md)' }}>{wo.flagged}</span>
        </div>
      )}

      <div className="seg seg-block" style={{ marginBottom: 16 }}>
        <button data-on={String(tab === 'overview')} onClick={() => setTab('overview')}>Overview</button>
        <button data-on={String(tab === 'tasks')} onClick={() => setTab('tasks')}>Tasks {totalTasks ? <span style={{ opacity: 0.6 }}>· {doneCount}/{totalTasks}</span> : null}</button>
        <button data-on={String(tab === 'materials')} onClick={() => setTab('materials')}>Materials</button>
        <button data-on={String(tab === 'thread')} onClick={() => setTab('thread')}>Thread</button>
        <button data-on={String(tab === 'audit')} onClick={() => setTab('audit')}>Audit</button>
      </div>

      {tab === 'overview' && (
        <div className="col gap-4">
          <section className="card card-pad">
            <window.CardHead title="Crew" />
            <div className="col gap-2">
              {(wo.assigned || []).map(uid => {
                const u = window.DB.user(uid);
                return (
                  <div key={uid} className="row gap-3" style={{ padding: '8px 10px', borderRadius: 'var(--r-md)' }}>
                    <span className={'avatar avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ font: 'var(--t-body-md)' }}>{u.name}</div>
                      <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{window.DB.ROLE_LABELS[u.role]}</div>
                    </div>
                    {uid === wo.assignedLead && <span className="badge badge-primary">Lead</span>}
                    <button className="btn btn-ghost btn-icon btn-sm"><Icon name="phone" size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm"><Icon name="messageCircle" size={14} /></button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card card-pad">
            <window.CardHead title="Location"
              right={<button className="btn btn-ghost btn-sm"><Icon name="navigation" size={14} /> Navigate</button>} />
            <div style={{
              height: 140, borderRadius: 'var(--r-md)',
              background: 'linear-gradient(160deg, var(--bg-muted), var(--bg-deep))',
              position: 'relative', overflow: 'hidden',
              border: '1px solid var(--border)',
            }}>
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 300 140" preserveAspectRatio="none">
                <path d="M 40 110 Q 100 90 150 70 T 240 40" stroke="var(--pri-500)" strokeWidth="2" fill="none" strokeDasharray="5 6" strokeLinecap="round" opacity="0.7" />
              </svg>
              <div style={{ position: 'absolute', left: '70%', top: '32%', transform: 'translate(-50%, -100%)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50% 50% 50% 0', background: 'var(--pri-500)', transform: 'rotate(-45deg)', boxShadow: '0 6px 14px color-mix(in srgb, var(--pri-500) 35%, transparent)' }}></div>
              </div>
              <div style={{ position: 'absolute', left: '22%', top: '78%', width: 12, height: 12, borderRadius: '50%', background: 'var(--info-500)', border: '3px solid white', transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 6px color-mix(in srgb, var(--info-500) 25%, transparent)' }}></div>
            </div>
            <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 10 }}>
              {site.access}
            </div>
          </section>
        </div>
      )}

      {tab === 'tasks' && (
        <section className="card card-pad">
          <window.CardHead title="Service checklist" sub={`${doneCount} of ${totalTasks} complete`} />
          {totalTasks === 0 ? (
            <window.EmptyState icon="list" title="No tasks defined" sub="Tasks will appear here once the WO is opened by the technician on site." />
          ) : (
            <>
              <div className="progress progress-success" style={{ marginBottom: 16 }}>
                <div style={{ width: (doneCount / totalTasks) * 100 + '%' }}></div>
              </div>
              <div className="col gap-2">
                {tasks.map(t => (
                  <div key={t.id} className="row gap-3" onClick={() => setTasks(tasks.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}
                    style={{
                      padding: '12px 14px', borderRadius: 'var(--r-md)',
                      background: t.done ? 'var(--bg-muted)' : 'var(--bg-elev)',
                      border: '1px solid var(--border)',
                      cursor: 'pointer',
                      opacity: t.done ? 0.7 : 1,
                    }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: '50%',
                      background: t.done ? 'var(--pri-500)' : 'transparent',
                      border: t.done ? 'none' : '1.5px solid var(--border-strong)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', flexShrink: 0,
                    }}>
                      {t.done && <Icon name="check" size={14} strokeWidth={2.5} />}
                    </div>
                    <span style={{ flex: 1, font: 'var(--t-body-md)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.label}</span>
                    {t.count && <span className="badge">{t.count}</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'materials' && (
        <section className="card card-pad">
          <window.CardHead title="Materials allocated" right={<button className="btn btn-ghost btn-sm"><Icon name="plus" size={14} /> Request more</button>} />
          {(!wo.materials || wo.materials.length === 0) ? (
            <window.EmptyState icon="package" title="No materials allocated" sub="This work order doesn't require materials from stock." />
          ) : (
            <div className="col gap-2">
              {wo.materials.map((m, i) => (
                <div key={i} className="row gap-3" style={{ padding: 12, borderRadius: 'var(--r-md)', background: 'var(--bg-muted)' }}>
                  <Icon name="package" size={16} style={{ color: 'var(--ink-mute)' }} />
                  <span style={{ flex: 1, font: 'var(--t-body)' }}>{m}</span>
                  <span className="badge badge-success"><Icon name="check" size={11} /> Ready</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'thread' && (
        <section className="card card-pad">
          <window.CardHead title="Internal thread · 2 messages" />
          <div className="col" style={{ gap: 14 }}>
            <ThreadMsg who="u_rashid" t="8:14" body="Customer rep on site from 9:30. Use rear loading bay." />
            <ThreadMsg who="u_arvind" t="9:18" body="Confirmed. Loading materials now, ETA on site 9:40." />
          </div>
          <textarea className="textarea" placeholder="Reply to thread…" style={{ marginTop: 16 }} />
          <div className="row gap-2" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm"><Icon name="paperclip" size={14} /> Attach</button>
            <button className="btn btn-primary btn-sm">Send</button>
          </div>
        </section>
      )}

      {tab === 'audit' && (
        <section className="card card-pad">
          <window.CardHead title="Activity log" />
          <div className="col gap-2">
            {[
              { t: '09:42', a: 'checked in', who: 'u_arvind' },
              { t: '08:30', a: 'departed warehouse', who: 'u_arvind' },
              { t: '08:14', a: 'left a note', who: 'u_rashid' },
              { t: 'Yest 16:30', a: 'assigned', who: 'u_rashid' },
              { t: 'Yest 11:05', a: 'created', who: 'system' },
            ].map((e, i) => {
              const u = e.who === 'system' ? { name: 'System', initials: 'SY', tint: 'primary' } : window.DB.user(e.who);
              return (
                <div key={i} className="row gap-3" style={{ padding: '8px 0' }}>
                  <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                  <div style={{ flex: 1, font: 'var(--t-small)' }}>
                    <span style={{ fontWeight: 600 }}>{u.name}</span> {e.a}
                  </div>
                  <span style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)' }}>{e.t}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </window.SlideOver>
  );
}

function sourceLabel(src) {
  if (!src) return '-';
  if (src.kind === 'project') return window.DB.PROJECTS[src.id] ? window.DB.PROJECTS[src.id].code + ' · Project' : 'Project';
  if (src.kind === 'amc') return window.DB.AMCS[src.id] ? window.DB.AMCS[src.id].code + ' · AMC' : 'AMC';
  if (src.kind === 'repair') return window.DB.REPAIRS[src.id] ? window.DB.REPAIRS[src.id].code + ' · Repair' : 'Repair';
  return src.kind;
}

function DetailField({ icon, label, value, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Icon name={icon} size={12} /> {label}
      </div>
      <div style={{ font: 'var(--t-body-md)', marginTop: 3 }} className={onClick ? 'truncate' : 'truncate'}>
        {value} {onClick && <Icon name="externalLink" size={11} style={{ color: 'var(--ink-quiet)', marginLeft: 4, verticalAlign: 'middle' }} />}
      </div>
      {sub && <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function ThreadMsg({ who, t, body }) {
  const u = window.DB.user(who);
  return (
    <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
      <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>
      <div style={{ flex: 1 }}>
        <div className="row gap-2">
          <span style={{ font: 'var(--t-small)', fontWeight: 600 }}>{u.name}</span>
          <span style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)' }}>{t}</span>
        </div>
        <div style={{ font: 'var(--t-body)', color: 'var(--ink-soft)', marginTop: 3 }}>{body}</div>
      </div>
    </div>
  );
}

Object.assign(window, { WorkOrders, WoSlideover });
