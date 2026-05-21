// ============================================================
// Installtec OS - Shared components used everywhere
// ============================================================

// ─── KPI ────────────────────────────────────────────────
function KPI({ label, value, sub, accent, trend, spark, icon, children }) {
  const cls = 'kpi' + (accent === 'primary' ? ' card-accent'
    : accent === 'violet' ? ' card-violet'
      : accent === 'peach' ? ' card-peach' : '');
  return (
    <div className={cls}>
      <div className="row between">
        <div className="kpi-label">{label}</div>
        {icon && <Icon name={icon} size={14} style={{ color: 'var(--ink-quiet)' }} />}
      </div>
      <div className="kpi-value numeric">{value}</div>
      {sub && (
        <div className={'kpi-sub' + (trend === 'up' ? ' kpi-trend-up' : trend === 'down' ? ' kpi-trend-down' : '')}>
          {trend === 'up' && '↑ '}{trend === 'down' && '↓ '}{sub}
        </div>
      )}
      {spark && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28, marginTop: 8 }}>
          {spark.map((h, i) => (
            <span key={i} style={{
              flex: 1, borderRadius: 2,
              background: i === spark.length - 1
                ? 'var(--pri-500)'
                : 'color-mix(in srgb, var(--pri-500) 32%, transparent)',
              height: (h / Math.max(...spark) * 100) + '%',
            }}></span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── WO Card ────────────────────────────────────────────
function WoCard({ wo, onClick, compact }) {
  const customer = window.DB.CUSTOMERS[wo.customer];
  const site = window.DB.SITES[wo.site];
  const typeMap = {
    AMC: { label: 'AMC', cls: 'badge-primary' },
    PROJECT: { label: 'PROJECT', cls: 'badge-info' },
    REPAIR: { label: 'REPAIR', cls: 'badge-warning' },
    DELIVERY: { label: 'DELIVERY', cls: 'badge-outline' },
    SURVEY: { label: 'SURVEY', cls: 'badge-violet' },
  };
  const stateMap = {
    'Scheduled': { dot: 'dot', text: 'Scheduled' },
    'Assigned': { dot: 'dot', text: 'Assigned' },
    'In Transit': { dot: 'dot-info', text: 'In Transit' },
    'In Progress': { dot: 'dot-primary dot-pulse', text: 'Live' },
    'Closed': { dot: 'dot-success', text: 'Closed' },
    'Completed': { dot: 'dot-success', text: 'Completed' },
  };
  const t = typeMap[wo.type] || typeMap.PROJECT;
  const s = stateMap[wo.status] || { dot: 'dot', text: wo.status };
  const isLive = wo.status === 'In Progress';
  const startTime = wo.scheduledStart ? wo.scheduledStart.split('T')[1].slice(0, 5) : '';
  const endTime = wo.scheduledEnd ? wo.scheduledEnd.split('T')[1].slice(0, 5) : '';

  return (
    <div className="card card-hover" onClick={onClick} style={{
      padding: compact ? 14 : 16,
      borderLeft: isLive ? '3px solid var(--pri-500)' : '1px solid var(--border)',
      paddingLeft: isLive ? 13 : (compact ? 14 : 16),
    }}>
      <div className="row between">
        <div className="row gap-2">
          <span className={'badge ' + t.cls} style={{ fontWeight: 600 }}>{t.label}</span>
          <span className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', fontFamily: 'var(--font-mono)' }}>{wo.code}</span>
        </div>
        <span className="row gap-1" style={{ font: 'var(--t-small)', color: isLive ? 'var(--pri-700)' : 'var(--ink-mute)' }}>
          <span className={'dot ' + s.dot}></span>
          {s.text}
        </span>
      </div>
      <div style={{ font: 'var(--t-h4)', color: 'var(--ink)', marginTop: 8 }} className="truncate">{wo.title}</div>
      <div className="row gap-2" style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 4 }}>
        <Icon name="mapPin" size={13} />
        <span className="truncate">{customer ? customer.name : ''} · {site ? site.name : ''}</span>
      </div>
      {wo.flagged && (
        <div style={{
          marginTop: 10, padding: '7px 10px',
          background: 'var(--dan-50)', color: 'var(--dan-700)',
          borderRadius: 'var(--r-sm)', font: 'var(--t-small)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="alertTriangle" size={14} /> {wo.flagged}
        </div>
      )}
      <div className="row between" style={{ marginTop: 12 }}>
        <div className="row gap-2">
          <Icon name="clock" size={13} style={{ color: 'var(--ink-quiet)' }} />
          <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>{startTime} – {endTime}</span>
        </div>
        <div className="avatar-stack">
          {(wo.assigned || []).slice(0, 3).map(uid => {
            const u = window.DB.user(uid);
            return <span key={uid} className={'avatar avatar-sm avatar-' + (u.tint || '')}>{u.initials}</span>;
          })}
          {wo.assigned && wo.assigned.length > 3 && (
            <span className="avatar avatar-sm" style={{ background: 'var(--bg-muted)', color: 'var(--ink-mute)' }}>+{wo.assigned.length - 3}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Feed Item ──────────────────────────────────────────
function FeedItem({ item, onClick }) {
  const tagMap = {
    success: { bg: 'var(--suc-100)', ink: 'var(--suc-700)' },
    warning: { bg: 'var(--warn-100)', ink: 'var(--warn-700)' },
    danger: { bg: 'var(--dan-100)', ink: 'var(--dan-700)' },
    info: { bg: 'var(--info-100)', ink: 'var(--info-700)' },
    primary: { bg: 'var(--pri-100)', ink: 'var(--pri-700)' },
    neutral: { bg: 'var(--bg-muted)', ink: 'var(--ink-soft)' },
  };
  const tag = tagMap[item.tag] || tagMap.neutral;
  const iconMap = {
    'check-in': 'mapPin',
    'sla': 'clock',
    'material': 'package',
    'reactivation': 'refresh',
    'signoff': 'signature',
    'flag': 'flag',
    'approval': 'inbox',
    'ticket': 'wrench',
    'invoice': 'receipt',
    'leave': 'calendar',
  };
  const who = item.who === 'system' ? 'System' : window.DB.user(item.who).name;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 12px',
      borderRadius: 'var(--r-md)',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background .14s',
    }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--bg-muted)'; }}
      onMouseLeave={e => { if (onClick) e.currentTarget.style.background = ''; }}>
      <div style={{
        width: 34, height: 34, borderRadius: 11,
        background: tag.bg, color: tag.ink,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name={iconMap[item.kind] || 'feed'} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: 'var(--t-body)', color: 'var(--ink)' }} className="truncate">
          <span style={{ fontWeight: 600 }}>{who}</span>{' '}{item.text}
        </div>
        <div style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', marginTop: 2 }}>{item.t}</div>
      </div>
    </div>
  );
}

// ─── Approval Card ─────────────────────────────────────
function ApprovalCard({ ap, onClick, onApprove, onReject }) {
  const requester = ap.requester === 'system' ? { name: 'System', initials: 'SY', tint: 'primary' } : window.DB.user(ap.requester);
  const kindCls = ap.kind === 'AMC Reactivation' ? 'badge-primary'
    : ap.kind === 'Variation Order' ? 'badge-violet'
      : ap.kind === 'Material Request' ? 'badge-info'
        : ap.kind === 'Leave Request' ? 'badge-peach'
          : 'badge-outline';
  return (
    <div className="card" style={{
      padding: 16,
      borderLeft: ap.priority === 'high' ? '3px solid var(--pri-500)' : '1px solid var(--border)',
      paddingLeft: ap.priority === 'high' ? 13 : 16,
      cursor: onClick ? 'pointer' : 'default',
    }} onClick={onClick}>
      <div className="row between">
        <div className="row gap-2">
          <span className={'badge ' + kindCls}>{ap.kind}</span>
          <span className="numeric" style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)', fontFamily: 'var(--font-mono)' }}>{ap.code}</span>
        </div>
        <span style={{ font: 'var(--t-micro)', color: 'var(--ink-quiet)' }}>{ap.openedAt}</span>
      </div>
      <div style={{ font: 'var(--t-body-md)', color: 'var(--ink)', marginTop: 8 }}>{ap.context}</div>
      <div className="row gap-2" style={{ marginTop: 8 }}>
        <span className={'avatar avatar-sm avatar-' + (requester.tint || 'primary')}>{requester.initials}</span>
        <span style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }}>
          {requester.name}
          {ap.amount ? <span> · <span className="numeric" style={{ color: 'var(--ink)', fontWeight: 600 }}>AED {ap.amount.toLocaleString()}</span></span> : ''}
        </span>
      </div>
      {(onApprove || onReject) && (
        <div className="row gap-2" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onApprove && onApprove(); }}>
            <Icon name="check" size={14} /> Approve
          </button>
          <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); onReject && onReject(); }}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Approval Chain Visualization ──────────────────────
function ApprovalChain({ chain }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {chain.map((step, i) => {
        const u = window.DB.user(step.user);
        const isApproved = step.state === 'approved';
        const isPending = step.state === 'pending';
        const isQueued = step.state === 'queued';
        return (
          <React.Fragment key={step.step}>
            <div style={{
              padding: '8px 12px',
              borderRadius: 'var(--r-md)',
              background: isApproved ? 'var(--suc-50)' : isPending ? 'var(--pri-50)' : 'var(--bg-muted)',
              border: '1px solid ' + (isApproved ? 'var(--suc-100)' : isPending ? 'var(--pri-200)' : 'var(--border)'),
              display: 'flex', alignItems: 'center', gap: 8,
              opacity: isQueued ? 0.6 : 1,
            }}>
              <span className={'avatar avatar-sm avatar-' + (u.tint || 'primary')}>{u.initials}</span>
              <div>
                <div style={{ font: 'var(--t-small)', color: 'var(--ink)', fontWeight: 600 }}>{u.name}</div>
                <div style={{ font: 'var(--t-micro)', color: 'var(--ink-mute)', textTransform: 'capitalize' }}>{step.role.replace('_', ' ')}</div>
              </div>
              <div style={{ marginLeft: 4 }}>
                {isApproved && <Icon name="check" size={14} style={{ color: 'var(--suc-600)' }} />}
                {isPending && <span className="dot dot-primary dot-pulse"></span>}
              </div>
            </div>
            {i < chain.length - 1 && <Icon name="chevronRight" size={14} style={{ color: 'var(--ink-quiet)' }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Slide-Over (right drawer) ─────────────────────────
function SlideOver({ open, onClose, title, sub, children, foot }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="slideover-back" onClick={onClose}></div>
      <div className="slideover">
        <div className="slideover-head">
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: 'var(--t-h3)' }} className="truncate">{title}</div>
            {sub && <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)' }} className="truncate">{sub}</div>}
          </div>
        </div>
        <div className="slideover-body">{children}</div>
        {foot && <div className="slideover-foot">{foot}</div>}
      </div>
    </>
  );
}

// ─── Modal ──────────────────────────────────────────────
function Modal({ open, onClose, children, lg }) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className={'modal' + (lg ? ' modal-lg' : '')} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ─── FilterBar (chips) ─────────────────────────────────
function FilterBar({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
      {options.map(opt => (
        <button key={opt.value} className="chip" data-on={String(value === opt.value)} onClick={() => onChange(opt.value)}>
          {opt.label}{opt.count != null && <span style={{ color: value === opt.value ? 'rgba(255,255,255,0.7)' : 'var(--ink-quiet)' }}>· {opt.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ─── Status Badge for WO/AMC states ────────────────────
function StatusBadge({ state }) {
  const map = {
    // WO
    'Scheduled': { cls: 'badge-outline', dot: 'dot' },
    'Assigned': { cls: 'badge-outline', dot: 'dot' },
    'In Transit': { cls: 'badge-info', dot: 'dot-info' },
    'In Progress': { cls: 'badge-primary', dot: 'dot-primary' },
    'Closed': { cls: 'badge-success', dot: 'dot-success' },
    'Completed': { cls: 'badge-success', dot: 'dot-success' },
    // AMC
    'ACTIVE': { cls: 'badge-success', dot: 'dot-success', label: 'Active' },
    'PENDING_REACTIVATION': { cls: 'badge-primary', dot: 'dot-primary', label: 'Reactivation' },
    'BLOCKED': { cls: 'badge-danger', dot: 'dot-danger', label: 'Blocked' },
    'RENEWAL_DUE': { cls: 'badge-warning', dot: 'dot-warning', label: 'Renewal' },
    // Project
    'On Track': { cls: 'badge-success', dot: 'dot-success' },
    'Awaiting VO Approval': { cls: 'badge-warning', dot: 'dot-warning' },
    'Delayed': { cls: 'badge-danger', dot: 'dot-danger' },
    // Repair
    'New': { cls: 'badge-info', dot: 'dot-info' },
    'Resolved': { cls: 'badge-success', dot: 'dot-success' },
  };
  const m = map[state] || { cls: 'badge-outline', dot: 'dot' };
  return <span className={'badge ' + m.cls}><span className={'dot ' + m.dot}></span> {m.label || state}</span>;
}

// ─── PageHeader ────────────────────────────────────────
function PageHeader({ eyebrow, title, sub, right }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

// ─── EmptyState ────────────────────────────────────────
function EmptyState({ icon = 'inbox', title, sub, action }) {
  return (
    <div style={{
      padding: '60px 24px', textAlign: 'center',
      color: 'var(--ink-mute)',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18,
        background: 'var(--bg-muted)', color: 'var(--ink-quiet)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 14,
      }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ font: 'var(--t-h3)', color: 'var(--ink)' }}>{title}</div>
      {sub && <div style={{ font: 'var(--t-body)', marginTop: 6, maxWidth: 360, margin: '6px auto 0' }}>{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

// ─── Section + Card heading helpers ────────────────────
function CardHead({ title, sub, right }) {
  return (
    <div className="row between" style={{ marginBottom: 12 }}>
      <div>
        <div style={{ font: 'var(--t-h3)', color: 'var(--ink)' }}>{title}</div>
        {sub && <div style={{ font: 'var(--t-small)', color: 'var(--ink-mute)', marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// Exports
Object.assign(window, {
  KPI, WoCard, FeedItem, ApprovalCard, ApprovalChain, SlideOver, Modal,
  FilterBar, StatusBadge, PageHeader, EmptyState, CardHead,
});
