// ============================================================
// Installtec OS - App shell (sidebar + topbar + bottom nav)
// One context, one navigation, one role-aware permission model.
// ============================================================

// ── Navigation map (filtered per-role) ────────────────────
const NAV_GROUPS = [
  {
    label: 'Workspace', items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: '*' },
      { id: 'workorders', label: 'Work orders', icon: 'briefcase', roles: '*', countKey: 'open_wo' },
      { id: 'feed', label: 'Live feed', icon: 'feed', roles: ['admin', 'md', 'manager', 'service_support'] },
      { id: 'scheduling', label: 'Scheduling', icon: 'calendar', roles: ['admin', 'manager', 'lead_worker'] },
      { id: 'approvals', label: 'Approvals', icon: 'inbox', roles: ['admin', 'md', 'manager', 'lead_worker', 'accounts'], countKey: 'approvals_count' },
    ]
  },
  {
    label: 'Operations', items: [
      { id: 'projects', label: 'Projects', icon: 'briefcase', roles: ['admin', 'md', 'manager', 'estimator', 'lead_worker'] },
      { id: 'amc', label: 'AMC contracts', icon: 'shieldCheck', roles: ['admin', 'md', 'manager', 'sales', 'accounts'] },
      { id: 'repair', label: 'Repair tickets', icon: 'wrench', roles: ['admin', 'md', 'manager', 'service_support', 'lead_worker', 'worker'] },
      { id: 'inventory', label: 'Inventory', icon: 'package', roles: ['admin', 'manager', 'lead_worker', 'driver'] },
      { id: 'logistics', label: 'Logistics', icon: 'truck', roles: ['admin', 'manager', 'driver'] },
    ]
  },
  {
    label: 'Relationships', items: [
      { id: 'customers', label: 'Customers', icon: 'building', roles: ['admin', 'md', 'manager', 'sales', 'service_support'] },
      { id: 'team', label: 'Team', icon: 'users', roles: ['admin', 'md', 'manager', 'lead_worker'] },
      { id: 'reports', label: 'Reports', icon: 'chartBar', roles: ['admin', 'md', 'manager', 'accounts'] },
    ]
  },
  {
    label: 'System', items: [
      { id: 'admin', label: 'Admin · Users', icon: 'cog', roles: ['admin'] },
    ]
  },
];

function navForRole(role) {
  return NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(i => i.roles === '*' || i.roles.includes(role)),
  })).filter(g => g.items.length > 0);
}

// ── Context ───────────────────────────────────────────────
const AppCtx = React.createContext(null);
function useApp() { return React.useContext(AppCtx); }

function AppProvider({ children }) {
  const [userId, setUserId] = React.useState('u_rashid');
  const [route, setRoute] = React.useState({ name: 'dashboard', params: {} });
  const [cmdkOpen, setCmdk] = React.useState(false);
  const [notifOpen, setNotif] = React.useState(false);
  const [slideover, setSlideover] = React.useState(null); // { kind, id }
  const [modal, setModal] = React.useState(null);     // { kind, data }
  const [toast, setToast] = React.useState(null);
  const [notifications, setNotifications] = React.useState(window.DB.NOTIFICATIONS);

  const me = window.DB.user(userId);
  const role = me.role;

  // Cmd/Ctrl-K opens command palette
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdk(o => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = (name, params = {}) => { setRoute({ name, params }); setSlideover(null); };
  const openWO = (id) => setSlideover({ kind: 'wo', id });
  const openApproval = (id) => setSlideover({ kind: 'approval', id });
  const openCustomer = (id) => { setRoute({ name: 'customers', params: { id } }); setSlideover(null); };
  const openProject = (id) => { setRoute({ name: 'projects', params: { id } }); setSlideover(null); };
  const openAmc = (id) => { setRoute({ name: 'amc', params: { id } }); setSlideover(null); };

  // Generic "go to entity"
  const followTarget = (target) => {
    if (!target) return;
    switch (target.kind) {
      case 'wo': return openWO(target.id);
      case 'approval': return openApproval(target.id);
      case 'customer': return openCustomer(target.id);
      case 'project': return openProject(target.id);
      case 'amc': return openAmc(target.id);
      case 'repair': return go('repair', { id: target.id });
      default: return;
    }
  };

  const dismissToast = () => setToast(null);
  const fireToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const markAllRead = () => setNotifications(notifications.map(n => ({ ...n, read: true })));
  const unreadCount = notifications.filter(n => !n.read).length;

  const ctx = {
    me, userId, setUserId, role,
    route, go,
    cmdkOpen, setCmdk,
    notifOpen, setNotif,
    slideover, setSlideover, openWO, openApproval, openCustomer, openProject, openAmc, followTarget,
    modal, setModal,
    toast, fireToast, dismissToast,
    notifications, setNotifications, markAllRead, unreadCount,
  };
  return <AppCtx.Provider value={ctx}>{children}</AppCtx.Provider>;
}

// ── Sidebar ───────────────────────────────────────────────
function Sidebar() {
  const { route, go, me, role, setUserId } = useApp();
  const groups = navForRole(role);

  return (
    <aside className="side">
      <div className="side-brand">
        <div className="side-brand-logo">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" fill="white" opacity="0.18" />
            <path d="M8 11l3 3 5-5" />
          </svg>
        </div>
        <div className="side-brand-text">
          <div className="title">Installtec</div>
          <div className="sub">Operations · Dubai</div>
        </div>
      </div>

      <div className="side-scroll">
        {groups.map(g => (
          <div key={g.label}>
            <div className="side-group">{g.label}</div>
            {g.items.map(i => {
              const count = i.countKey ? window.DB.KPI_OPS[i.countKey] : null;
              return (
                <div key={i.id}
                  className={'side-item' + (route.name === i.id ? ' active' : '')}
                  onClick={() => go(i.id)}>
                  <Icon name={i.icon} size={18} />
                  <span className="label">{i.label}</span>
                  {count != null && <span className="badge-count">{count}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="side-foot">
        <div className="side-user">
          <span className={'avatar avatar-' + (me.tint || 'primary')}>{me.initials}</span>
          <div className="side-user-info">
            <div className="name truncate">{me.name}</div>
            <div className="role truncate">{window.DB.ROLE_LABELS[me.role] || me.role}</div>
          </div>
          <Icon name="chevronDown" size={14} style={{ color: 'var(--ink-quiet)' }} />
        </div>
      </div>
    </aside>
  );
}

// ── Topbar ────────────────────────────────────────────────
function Topbar() {
  const { route, setCmdk, setNotif, unreadCount, me, setUserId, role } = useApp();
  const [roleMenuOpen, setRoleMenuOpen] = React.useState(false);

  const titleMap = {
    dashboard: 'Dashboard',
    workorders: 'Work orders',
    feed: 'Live operations feed',
    scheduling: 'Scheduling & dispatch',
    approvals: 'Approvals',
    projects: 'Projects',
    amc: 'AMC contracts',
    repair: 'Repair tickets',
    inventory: 'Inventory',
    logistics: 'Logistics',
    customers: 'Customers',
    team: 'Team',
    reports: 'Reports',
    admin: 'Admin · Users',
  };

  // Build candidate roles for the role switcher (every distinct role in the DB).
  const roleSamples = {
    admin: 'u_admin', md: 'u_amir', manager: 'u_rashid',
    sales: 'u_noor', lead_worker: 'u_arvind', worker: 'u_bilal',
    driver: 'u_karthik', service_support: 'u_pooja', accounts: 'u_priya',
    estimator: 'u_sara', subcontractor: 'u_saif',
  };

  return (
    <header className="topbar">
      <div className="topbar-bread">
        <span className="crumb">Installtec</span>
        <span className="sep">/</span>
        <span className="crumb active">{titleMap[route.name] || route.name}</span>
      </div>

      <div className="topbar-cmd input-search-wrap" style={{ position: 'relative' }}>
        <Icon name="search" size={14} />
        <input className="input" placeholder="Search anything - Cmd K" onFocus={() => setCmdk(true)} readOnly />
        <span className="kbd"><span>⌘</span><span>K</span></span>
      </div>

      <div style={{ flex: 1 }} className="hide-mobile" />

      {/* Role switcher */}
      <div style={{ position: 'relative' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setRoleMenuOpen(o => !o)} title="Switch role">
          <Icon name="user" size={14} />
          <span className="hide-mobile">{window.DB.ROLE_LABELS[role]}</span>
          <Icon name="chevronDown" size={12} />
        </button>
        {roleMenuOpen && (
          <>
            <div onClick={() => setRoleMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }}></div>
            <div style={{
              position: 'absolute', top: '110%', right: 0, zIndex: 20,
              background: 'var(--bg-elev)', borderRadius: 'var(--r-md)',
              boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
              padding: 6, minWidth: 240,
            }}>
              <div style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', padding: '6px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Switch role - preview
              </div>
              {Object.entries(roleSamples).map(([r, uid]) => {
                const u = window.DB.user(uid);
                return (
                  <div key={r} onClick={() => { setUserId(uid); setRoleMenuOpen(false); }}
                    style={{
                      padding: '8px 10px', borderRadius: 'var(--r-sm)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      background: role === r ? 'var(--bg-muted)' : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-muted)'}
                    onMouseLeave={e => e.currentTarget.style.background = role === r ? 'var(--bg-muted)' : 'transparent'}>
                    <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: 'var(--t-small)', fontWeight: 600 }} className="truncate">{u.name}</div>
                      <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{window.DB.ROLE_LABELS[r]}</div>
                    </div>
                    {role === r && <Icon name="check" size={14} style={{ color: 'var(--pri-600)' }} />}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <button className="btn btn-ghost btn-icon" style={{ position: 'relative' }} onClick={() => setNotif(o => !o)}>
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 6, right: 6,
            width: 8, height: 8, borderRadius: 4,
            background: 'var(--pri-500)',
            border: '1.5px solid var(--bg)',
          }}></span>
        )}
      </button>

      <button className="btn btn-primary btn-sm hide-mobile">
        <Icon name="plus" size={14} /> Create
      </button>
    </header>
  );
}

// ── Bottom nav (mobile) ───────────────────────────────────
function BottomNav() {
  const { route, go, role } = useApp();
  // Pick top 5 most-used by role
  const isField = role === 'worker' || role === 'lead_worker' || role === 'driver';
  const items = isField
    ? ['dashboard', 'workorders', 'feed', 'team', 'customers']
    : ['dashboard', 'workorders', 'feed', 'approvals', 'customers'];

  return (
    <nav className="bnav">
      <button data-on={String(route.name === items[0])} onClick={() => go(items[0])}>
        <Icon name="dashboard" size={20} /><span>Home</span>
      </button>
      <button data-on={String(route.name === items[1])} onClick={() => go(items[1])}>
        <Icon name="briefcase" size={20} /><span>WO</span>
      </button>
      <button className="fab" onClick={() => go('workorders')}><Icon name="plus" size={22} /></button>
      <button data-on={String(route.name === items[3])} onClick={() => go(items[3])}>
        <Icon name={items[3] === 'team' ? 'users' : 'inbox'} size={20} />
        <span>{items[3] === 'team' ? 'Team' : 'Approve'}</span>
      </button>
      <button data-on={String(route.name === items[4])} onClick={() => go(items[4])}>
        <Icon name="building" size={20} /><span>Customers</span>
      </button>
    </nav>
  );
}

// ── Command Palette (Cmd-K) ───────────────────────────────
function CommandPalette() {
  const { cmdkOpen, setCmdk, go, followTarget, openWO } = useApp();
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (cmdkOpen) {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
      setQ(''); setActive(0);
    }
  }, [cmdkOpen]);

  if (!cmdkOpen) return null;

  // Build searchable items
  const nav = [
    { id: 'dashboard', label: 'Dashboard', kind: 'Page', icon: 'dashboard' },
    { id: 'workorders', label: 'Work orders', kind: 'Page', icon: 'briefcase' },
    { id: 'amc', label: 'AMC contracts', kind: 'Page', icon: 'shieldCheck' },
    { id: 'approvals', label: 'Approvals', kind: 'Page', icon: 'inbox' },
    { id: 'scheduling', label: 'Scheduling', kind: 'Page', icon: 'calendar' },
    { id: 'customers', label: 'Customers', kind: 'Page', icon: 'building' },
    { id: 'repair', label: 'Repair tickets', kind: 'Page', icon: 'wrench' },
    { id: 'inventory', label: 'Inventory', kind: 'Page', icon: 'package' },
    { id: 'projects', label: 'Projects', kind: 'Page', icon: 'briefcase' },
    { id: 'reports', label: 'Reports', kind: 'Page', icon: 'chartBar' },
  ].map(x => ({ ...x, type: 'nav' }));

  const wos = Object.values(window.DB.WORK_ORDERS).map(w => ({
    type: 'wo', id: w.id, label: w.code + ' - ' + w.title,
    kind: 'Work order', meta: window.DB.CUSTOMERS[w.customer].name, icon: 'briefcase',
  }));
  const customers = Object.values(window.DB.CUSTOMERS).map(c => ({
    type: 'customer', id: c.id, label: c.name, kind: 'Customer', meta: c.tier, icon: 'building',
  }));
  const amcs = Object.values(window.DB.AMCS).map(a => ({
    type: 'amc', id: a.id, label: a.code + ' - ' + window.DB.CUSTOMERS[a.customer].name,
    kind: 'AMC', meta: a.state.replace('_', ' '), icon: 'shieldCheck',
  }));

  const all = [...nav, ...wos, ...customers, ...amcs];
  const lq = q.toLowerCase().trim();
  const results = lq ? all.filter(x => x.label.toLowerCase().includes(lq) || (x.meta || '').toLowerCase().includes(lq)).slice(0, 14) : all.slice(0, 12);

  const fire = (item) => {
    setCmdk(false);
    if (item.type === 'nav') go(item.id);
    else if (item.type === 'wo') openWO(item.id);
    else if (item.type === 'customer') followTarget({ kind: 'customer', id: item.id });
    else if (item.type === 'amc') followTarget({ kind: 'amc', id: item.id });
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === 'Enter') { e.preventDefault(); results[active] && fire(results[active]); }
    if (e.key === 'Escape') { setCmdk(false); }
  };

  return (
    <div className="cmdk-back" onClick={() => setCmdk(false)}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} className="cmdk-input" placeholder="Search work orders, customers, AMCs, pages…" value={q} onChange={e => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
        <div className="cmdk-list">
          {results.map((item, i) => (
            <div key={item.type + ':' + item.id} className={'cmdk-item' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)}
              onClick={() => fire(item)}>
              <Icon name={item.icon} size={16} style={{ color: 'var(--ink-mute)' }} />
              <span className="truncate" style={{ flex: 1 }}>{item.label}</span>
              <span className="meta">{item.kind}{item.meta ? ' · ' + item.meta : ''}</span>
            </div>
          ))}
          {results.length === 0 && <div style={{ padding: 30, textAlign: 'center', color: 'var(--ink-mute)' }}>No matches.</div>}
        </div>
      </div>
    </div>
  );
}

// ── Notification Drawer ───────────────────────────────────
function NotifDrawer() {
  const { notifOpen, setNotif, notifications, markAllRead, followTarget } = useApp();
  if (!notifOpen) return null;
  return (
    <>
      <div onClick={() => setNotif(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }}></div>
      <div className="notif">
        <div className="notif-head">
          <div>
            <div style={{ font: 'var(--t-h3)' }}>Notifications</div>
            <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)' }}>{notifications.filter(n => !n.read).length} unread</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>
        </div>
        <div className="notif-list">
          {notifications.map(n => (
            <div key={n.id} className={'notif-item' + (n.read ? '' : ' unread')}
              onClick={() => { followTarget(n.target); setNotif(false); }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: n.kind === 'approval' ? 'var(--pri-100)' : n.kind === 'sla' ? 'var(--warn-100)' : 'var(--bg-muted)',
                color: n.kind === 'approval' ? 'var(--pri-700)' : n.kind === 'sla' ? 'var(--warn-700)' : 'var(--ink-soft)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={n.kind === 'approval' ? 'inbox' : n.kind === 'sla' ? 'clock' : 'bell'} size={16} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: 'var(--t-body-md)', color: 'var(--ink)' }}>{n.title}</div>
                <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 1 }} className="truncate">{n.body}</div>
                <div style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', marginTop: 2 }}>{n.t}</div>
              </div>
              {!n.read && <span className="dot dot-primary" style={{ marginTop: 6 }}></span>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── Toast ─────────────────────────────────────────────────
function Toast() {
  const { toast, dismissToast } = useApp();
  if (!toast) return null;
  return (
    <div onClick={dismissToast} style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 95, background: 'var(--ink)', color: 'white',
      padding: '12px 18px', borderRadius: 'var(--r-pill)',
      boxShadow: 'var(--shadow-xl)', font: 'var(--t-body-md)',
      display: 'flex', alignItems: 'center', gap: 10,
      animation: 'slideInUp .22s cubic-bezier(.2,.7,.3,1)',
    }}>
      <Icon name="checkCircle" size={16} style={{ color: 'var(--pri-300)' }} />
      {toast}
    </div>
  );
}

Object.assign(window, { AppProvider, AppCtx, useApp, Sidebar, Topbar, BottomNav, CommandPalette, NotifDrawer, Toast, navForRole });
