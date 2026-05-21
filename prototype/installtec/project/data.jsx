// ============================================================
// Installtec OS - Relational mock data
// One source of truth shared across all modules.
// ============================================================

// ── USERS ───────────────────────────────────────────────────
const USERS = {
  u_rashid: { id: 'u_rashid', name: 'Rashid Al-Hashimi', role: 'manager', email: 'rashid@installtec.ae', phone: '+971 50 482 1108', initials: 'RH', tint: 'primary', mgr: 'u_amir', team: null, skills: [], region: 'UAE' },
  u_amir: { id: 'u_amir', name: 'Amir Hadid', role: 'md', email: 'amir@installtec.ae', phone: '+971 50 110 4221', initials: 'AH', tint: 'violet', mgr: null, team: null, skills: [], region: 'UAE' },
  u_admin: { id: 'u_admin', name: 'Ops Admin', role: 'admin', email: 'admin@installtec.ae', phone: '+971 50 999 0000', initials: 'OA', tint: 'peach', mgr: null, team: null, skills: [], region: 'UAE' },
  u_arvind: { id: 'u_arvind', name: 'Arvind Krishnan', role: 'lead_worker', email: 'arvind@installtec.ae', phone: '+971 55 220 3344', initials: 'AK', tint: 'primary', mgr: 'u_rashid', team: 't_alpha', skills: ['CCTV', 'ACS', 'SCS'], region: 'UAE' },
  u_bilal: { id: 'u_bilal', name: 'Bilal Sayed', role: 'worker', email: 'bilal@installtec.ae', phone: '+971 56 880 1212', initials: 'BS', tint: 'warm', mgr: 'u_arvind', team: 't_alpha', skills: ['CCTV', 'Fiber'], region: 'UAE' },
  u_joseph: { id: 'u_joseph', name: 'Joseph Mathew', role: 'worker', email: 'joseph@installtec.ae', phone: '+971 54 330 7788', initials: 'JM', tint: 'info', mgr: 'u_arvind', team: 't_alpha', skills: ['ACS', 'Fiber'], region: 'UAE' },
  u_karthik: { id: 'u_karthik', name: 'Karthik Iyer', role: 'driver', email: 'karthik@installtec.ae', phone: '+971 50 412 8800', initials: 'KI', tint: 'warm', mgr: 'u_rashid', team: null, skills: ['Driving'], region: 'UAE' },
  u_saif: { id: 'u_saif', name: 'Saif Ibrahim', role: 'subcontractor', email: 'saif@gmail.com', phone: '+971 56 110 2233', initials: 'SI', tint: 'peach', mgr: 'u_arvind', team: null, skills: ['Cable Pulling'], region: 'UAE' },
  u_pooja: { id: 'u_pooja', name: 'Pooja Menon', role: 'service_support', email: 'pooja@installtec.ae', phone: '+971 50 224 8867', initials: 'PM', tint: 'violet', mgr: 'u_rashid', team: null, skills: [], region: 'UAE' },
  u_priya: { id: 'u_priya', name: 'Priya Nair', role: 'accounts', email: 'priya@installtec.ae', phone: '+971 50 887 9911', initials: 'PN', tint: 'info', mgr: 'u_amir', team: null, skills: [], region: 'UAE' },
  u_noor: { id: 'u_noor', name: 'Noor El-Sayed', role: 'sales', email: 'noor@installtec.ae', phone: '+971 55 999 3322', initials: 'NE', tint: 'peach', mgr: 'u_rashid', team: null, skills: [], region: 'UAE' },
  u_sara: { id: 'u_sara', name: 'Sara Anand', role: 'estimator', email: 'sara@installtec.ae', phone: '+971 50 220 1144', initials: 'SA', tint: 'primary', mgr: 'u_rashid', team: null, skills: [], region: 'UAE' },
};

const TEAMS = {
  t_alpha: { id: 't_alpha', name: 'ELV Installation Alpha', lead: 'u_arvind', manager: 'u_rashid', members: ['u_bilal', 'u_joseph'], skills: ['CCTV', 'ACS', 'SCS', 'Fiber'], region: 'UAE' },
};

// Role label map (UI-friendly)
const ROLE_LABELS = {
  admin: 'Admin',
  md: 'Managing Director',
  manager: 'Operations Manager',
  sales: 'Sales',
  estimator: 'Pre-Sales / Estimator',
  lead_worker: 'Lead Technician',
  worker: 'Technician',
  driver: 'Driver',
  subcontractor: 'Subcontractor',
  service_support: 'Service Support',
  accounts: 'Accounts',
};

// ── CUSTOMERS ───────────────────────────────────────────────
const CUSTOMERS = {
  c_damac: { id: 'c_damac', name: 'DAMAC Properties', tier: 'Strategic', region: 'UAE', sector: 'Real Estate', owner: 'u_noor', since: '2014-03', tags: ['ACS', 'CCTV', 'SCS'] },
  c_mag: { id: 'c_mag', name: 'MAG Group', tier: 'Strategic', region: 'UAE', sector: 'Real Estate', owner: 'u_noor', since: '2017-08', tags: ['CCTV', 'SCS'] },
  c_azizi: { id: 'c_azizi', name: 'Azizi Developments', tier: 'Key', region: 'UAE', sector: 'Real Estate', owner: 'u_noor', since: '2019-05', tags: ['CCTV', 'Fiber'] },
  c_manipal: { id: 'c_manipal', name: 'Manipal University Dubai', tier: 'Key', region: 'UAE', sector: 'Education', owner: 'u_noor', since: '2018-11', tags: ['ACS', 'CCTV', 'AV'] },
  c_csh: { id: 'c_csh', name: 'Canadian Specialist Hospital', tier: 'Key', region: 'UAE', sector: 'Healthcare', owner: 'u_noor', since: '2016-04', tags: ['CCTV', 'Nurse Call'] },
  c_nmc: { id: 'c_nmc', name: 'NMC Hospital', tier: 'Standard', region: 'UAE', sector: 'Healthcare', owner: 'u_noor', since: '2020-02', tags: ['CCTV'] },
  c_burj: { id: 'c_burj', name: 'Emaar Mgmt - Burj District', tier: 'Key', region: 'UAE', sector: 'Hospitality', owner: 'u_noor', since: '2021-09', tags: ['CCTV'] },
  c_difc: { id: 'c_difc', name: 'DIFC Authority', tier: 'Strategic', region: 'UAE', sector: 'Government', owner: 'u_noor', since: '2015-06', tags: ['ACS', 'Compliance'] },
};

const SITES = {
  s_burj: { id: 's_burj', name: 'Burj Vista Tower 2', customer: 'c_damac', area: 'Downtown Dubai', access: 'Rear loading bay · Security desk B' },
  s_mag318: { id: 's_mag318', name: 'MAG 318 - Business Bay', customer: 'c_mag', area: 'Business Bay', access: 'Service entrance · Mr. Khan' },
  s_difc: { id: 's_difc', name: 'DIFC Gate Avenue West', customer: 'c_difc', area: 'DIFC', access: 'Concierge · Block 4' },
  s_manipal: { id: 's_manipal', name: 'Manipal Campus', customer: 'c_manipal', area: 'Dubai Academic City', access: 'Maintenance gate 2' },
  s_csh: { id: 's_csh', name: 'CSH Deira - Main Block', customer: 'c_csh', area: 'Deira', access: 'Goods lift · Basement B1' },
  s_azizi: { id: 's_azizi', name: 'Azizi Riviera Phase 5', customer: 'c_azizi', area: 'MBR City', access: 'Site office trailer' },
  s_nmc: { id: 's_nmc', name: 'NMC Deira Branch', customer: 'c_nmc', area: 'Deira', access: 'Reception escort required' },
};

// ── PROJECTS ────────────────────────────────────────────────
const PROJECTS = {
  p_difc4: {
    id: 'p_difc4', code: 'PRJ-2025-014', name: 'DIFC Gate Ave West - ELV Upgrade',
    customer: 'c_difc', site: 's_difc', manager: 'u_rashid', team: 't_alpha',
    status: 'In Progress', stage: 'Installation', progress: 62,
    value: 1840000, startedAt: '2025-02-10', dueAt: '2025-07-30',
    milestones: [
      { id: 'm1', name: 'Mobilisation', done: true, pct: 10 },
      { id: 'm2', name: 'Cable pulling', done: true, pct: 30 },
      { id: 'm3', name: 'Containment', done: true, pct: 50 },
      { id: 'm4', name: 'Device install', done: false, pct: 75 },
      { id: 'm5', name: 'T&C', done: false, pct: 95 },
      { id: 'm6', name: 'Handover · As-built', done: false, pct: 100 },
    ],
  },
  p_azizi: {
    id: 'p_azizi', code: 'PRJ-2025-022', name: 'Azizi Riviera Ph.5 - CCTV + Fiber Backbone',
    customer: 'c_azizi', site: 's_azizi', manager: 'u_rashid', team: 't_alpha',
    status: 'In Progress', stage: 'Installation', progress: 38,
    value: 920000, startedAt: '2025-03-22', dueAt: '2025-08-15',
    milestones: [
      { id: 'm1', name: 'Survey', done: true, pct: 10 },
      { id: 'm2', name: 'Cable pulling', done: false, pct: 40 },
      { id: 'm3', name: 'Termination', done: false, pct: 70 },
      { id: 'm4', name: 'T&C + Handover', done: false, pct: 100 },
    ],
  },
  p_manipal: {
    id: 'p_manipal', code: 'PRJ-2025-009', name: 'Manipal Campus - Phase 2 ACS Expansion',
    customer: 'c_manipal', site: 's_manipal', manager: 'u_rashid', team: 't_alpha',
    status: 'Awaiting VO Approval', stage: 'Variation', progress: 78,
    value: 540000, startedAt: '2025-01-08', dueAt: '2025-06-12',
    milestones: [
      { id: 'm1', name: 'Mobilisation', done: true, pct: 12 },
      { id: 'm2', name: 'Hardware fit', done: true, pct: 60 },
      { id: 'm3', name: 'VO scope add', done: false, pct: 80 },
      { id: 'm4', name: 'T&C + Handover', done: false, pct: 100 },
    ],
  },
  p_mag: {
    id: 'p_mag', code: 'PRJ-2025-018', name: 'MAG 318 - Phase A Tenant Floors',
    customer: 'c_mag', site: 's_mag318', manager: 'u_rashid', team: 't_alpha',
    status: 'On Track', stage: 'Termination', progress: 84,
    value: 690000, startedAt: '2025-02-01', dueAt: '2025-06-04',
    milestones: [
      { id: 'm1', name: 'Survey + BOQ', done: true, pct: 10 },
      { id: 'm2', name: 'Cabling', done: true, pct: 55 },
      { id: 'm3', name: 'Termination', done: true, pct: 80 },
      { id: 'm4', name: 'T&C', done: false, pct: 100 },
    ],
  },
};

// ── AMC CONTRACTS ───────────────────────────────────────────
const AMCS = {
  amc_091: { id: 'amc_091', code: 'AMC-091', customer: 'c_damac', site: 's_burj', manager: 'u_rashid', state: 'PENDING_REACTIVATION', value: 48000, services: { done: 1, total: 4 }, nextDue: 'Today', overdueDays: 12, freeCalls: 3, expiresAt: '2025-12-31' },
  amc_092: { id: 'amc_092', code: 'AMC-092', customer: 'c_mag', site: 's_mag318', manager: 'u_rashid', state: 'ACTIVE', value: 36000, services: { done: 2, total: 4 }, nextDue: 'May 28', overdueDays: 0, freeCalls: 5, expiresAt: '2025-11-15' },
  amc_088: { id: 'amc_088', code: 'AMC-088', customer: 'c_manipal', site: 's_manipal', manager: 'u_rashid', state: 'BLOCKED', value: 64000, services: { done: 0, total: 4 }, nextDue: '-', overdueDays: 34, freeCalls: 0, expiresAt: '2026-01-30' },
  amc_085: { id: 'amc_085', code: 'AMC-085', customer: 'c_nmc', site: 's_nmc', manager: 'u_rashid', state: 'ACTIVE', value: 22000, services: { done: 3, total: 4 }, nextDue: 'Jun 02', overdueDays: 0, freeCalls: 2, expiresAt: '2025-10-08' },
  amc_080: { id: 'amc_080', code: 'AMC-080', customer: 'c_azizi', site: 's_azizi', manager: 'u_rashid', state: 'RENEWAL_DUE', value: 41000, services: { done: 4, total: 4 }, nextDue: 'Jun 14', overdueDays: 0, freeCalls: 7, expiresAt: '2025-06-22' },
  amc_079: { id: 'amc_079', code: 'AMC-079', customer: 'c_csh', site: 's_csh', manager: 'u_rashid', state: 'ACTIVE', value: 28000, services: { done: 2, total: 4 }, nextDue: 'Jun 05', overdueDays: 0, freeCalls: 1, expiresAt: '2025-12-10' },
};

// ── REPAIR TICKETS ──────────────────────────────────────────
const REPAIRS = {
  r_412: { id: 'r_412', code: 'TKT-412', title: 'Reception camera offline', customer: 'c_mag', site: 's_mag318', state: 'In Progress', sla: { target: 240, elapsed: 142, breach: false }, classification: 'AMC free-call', priority: 'high', openedAt: '2025-05-15 14:20', assigned: 'u_bilal', visits: 2 },
  r_410: { id: 'r_410', code: 'TKT-410', title: 'NVR rack - power supply fault', customer: 'c_csh', site: 's_csh', state: 'Resolved', sla: { target: 240, elapsed: 95, breach: false }, classification: 'Chargeable', priority: 'normal', openedAt: '2025-05-13 09:30', assigned: 'u_joseph', visits: 1 },
  r_408: { id: 'r_408', code: 'TKT-408', title: 'ACS reader stuck - main lobby', customer: 'c_difc', site: 's_difc', state: 'New', sla: { target: 120, elapsed: 18, breach: false }, classification: 'AMC free-call', priority: 'high', openedAt: '2025-05-16 08:40', assigned: null, visits: 0 },
  r_405: { id: 'r_405', code: 'TKT-405', title: 'AC unit alarm - server room', customer: 'c_azizi', site: 's_azizi', state: 'Resolved', sla: { target: 240, elapsed: 188, breach: false }, classification: 'Warranty', priority: 'normal', openedAt: '2025-05-09 11:00', assigned: 'u_arvind', visits: 1 },
  r_402: { id: 'r_402', code: 'TKT-402', title: 'CAM-B-204 third failure', customer: 'c_mag', site: 's_mag318', state: 'Resolved', sla: { target: 240, elapsed: 220, breach: false }, classification: 'AMC free-call', priority: 'high', openedAt: '2025-05-02 10:15', assigned: 'u_bilal', visits: 3, flagged: 'Repeat failure' },
};

// ── WORK ORDERS ─────────────────────────────────────────────
const WORK_ORDERS = {
  wo_3284: {
    id: 'wo_3284', code: 'WO-3284', type: 'AMC', priority: 'Standard',
    title: 'Q2 Quarterly Service - CCTV + ACS',
    source: { kind: 'amc', id: 'amc_091' },
    customer: 'c_damac', site: 's_burj',
    scheduledStart: '2025-05-16T09:00', scheduledEnd: '2025-05-16T11:30',
    status: 'In Progress', assignedLead: 'u_arvind', assigned: ['u_arvind', 'u_bilal'],
    progress: 60, slaMin: 240, elapsedMin: 142, materials: ['Lens cleaning kit', 'NVR HDD test', 'ACS reader spare'],
    tasks: [
      { id: 't1', label: 'Check-in & site walk', done: true },
      { id: 't2', label: 'Inspect 24× IP cameras', done: true, count: '24/24' },
      { id: 't3', label: 'Test NVR & storage', done: true },
      { id: 't4', label: 'Inspect 6× ACS readers', done: false, count: '4/6' },
      { id: 't5', label: 'Customer walk-through', done: false },
      { id: 't6', label: 'Service report + sign-off', done: false },
    ],
  },
  wo_3285: {
    id: 'wo_3285', code: 'WO-3285', type: 'REPAIR', priority: 'High',
    title: 'Reception camera offline - Visit 2',
    source: { kind: 'repair', id: 'r_412' },
    customer: 'c_mag', site: 's_mag318',
    scheduledStart: '2025-05-16T13:00', scheduledEnd: '2025-05-16T14:30',
    status: 'Assigned', assignedLead: 'u_bilal', assigned: ['u_bilal'],
    progress: 0, slaMin: 180, elapsedMin: 12, materials: ['Replacement 4MP dome cam', 'PoE injector'],
    flagged: 'Repeat failure - 3 visits in 90 days',
  },
  wo_3286: {
    id: 'wo_3286', code: 'WO-3286', type: 'PROJECT', priority: 'Standard',
    title: 'Cable pulling - L4 to L6 risers',
    source: { kind: 'project', id: 'p_azizi' },
    customer: 'c_azizi', site: 's_azizi',
    scheduledStart: '2025-05-16T15:00', scheduledEnd: '2025-05-16T18:00',
    status: 'Scheduled', assignedLead: 'u_joseph', assigned: ['u_joseph', 'u_saif'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: ['Cat6A 305m drum', 'Containment', 'Tie wraps'],
  },
  wo_3287: {
    id: 'wo_3287', code: 'WO-3287', type: 'DELIVERY', priority: 'Standard',
    title: 'Site delivery - Cat6A drums & patch panels',
    source: { kind: 'project', id: 'p_manipal' },
    customer: 'c_manipal', site: 's_manipal',
    scheduledStart: '2025-05-16T10:30', scheduledEnd: '2025-05-16T11:30',
    status: 'In Transit', assignedLead: 'u_karthik', assigned: ['u_karthik'],
    progress: 35, slaMin: null, elapsedMin: 22, materials: ['Cat6A drum × 4', 'Patch panel × 8', 'Cable ties'],
  },
  wo_3288: {
    id: 'wo_3288', code: 'WO-3288', type: 'PROJECT', priority: 'Standard',
    title: 'ACS device fit - Block A floors 3-5',
    source: { kind: 'project', id: 'p_manipal' },
    customer: 'c_manipal', site: 's_manipal',
    scheduledStart: '2025-05-17T08:30', scheduledEnd: '2025-05-17T17:00',
    status: 'Scheduled', assignedLead: 'u_arvind', assigned: ['u_arvind', 'u_joseph', 'u_bilal'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: ['12× ACS readers', 'Cabling kit'],
  },
  wo_3279: {
    id: 'wo_3279', code: 'WO-3279', type: 'AMC', priority: 'Standard',
    title: 'CSH AMC service Q2',
    source: { kind: 'amc', id: 'amc_079' },
    customer: 'c_csh', site: 's_csh',
    scheduledStart: '2025-05-15T08:00', scheduledEnd: '2025-05-15T11:00',
    status: 'Closed', assignedLead: 'u_joseph', assigned: ['u_joseph'],
    progress: 100, slaMin: 240, elapsedMin: 180, materials: [],
  },
  wo_3290: {
    id: 'wo_3290', code: 'WO-3290', type: 'SURVEY', priority: 'Standard',
    title: 'Site survey - DIFC Gate Ave variation order',
    source: { kind: 'project', id: 'p_difc4' },
    customer: 'c_difc', site: 's_difc',
    scheduledStart: '2025-05-16T14:00', scheduledEnd: '2025-05-16T16:00',
    status: 'Scheduled', assignedLead: 'u_sara', assigned: ['u_sara', 'u_rashid'],
    progress: 0, slaMin: null, elapsedMin: 0, materials: [],
  },
  wo_3271: {
    id: 'wo_3271', code: 'WO-3271', type: 'REPAIR', priority: 'High',
    title: 'ACS reader stuck - NMC main lobby',
    source: { kind: 'repair', id: 'r_408' },
    customer: 'c_nmc', site: 's_nmc',
    scheduledStart: '2025-05-16T09:30', scheduledEnd: '2025-05-16T11:00',
    status: 'In Progress', assignedLead: 'u_bilal', assigned: ['u_bilal'],
    progress: 30, slaMin: 120, elapsedMin: 108, materials: ['Reader spare', 'Tooling'],
  },
};

// ── APPROVALS ──────────────────────────────────────────────
const APPROVALS = {
  ap_441: { id: 'ap_441', code: 'AP-441', kind: 'AMC Reactivation', amount: null, context: 'AMC-091 - payment AED 48,000 cleared today', requester: 'system', target: { kind: 'amc', id: 'amc_091' }, openedAt: '14m ago', priority: 'high', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }], notes: 'Customer expecting Q2 service to start immediately. WO-3284 ready and team on site.' },
  ap_440: { id: 'ap_440', code: 'AP-440', kind: 'Material Request', amount: 6200, context: 'Cat6A bulk + accessories for Azizi Riviera', requester: 'u_joseph', target: { kind: 'project', id: 'p_azizi' }, openedAt: '38m ago', priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'lead_worker', user: 'u_arvind', state: 'approved', at: '24m ago' }, { step: 2, role: 'manager', user: 'u_rashid', state: 'pending' }] },
  ap_439: { id: 'ap_439', code: 'AP-439', kind: 'Variation Order', amount: 28400, context: 'Add 2× corner cameras - Manipal Phase 2', requester: 'u_noor', target: { kind: 'project', id: 'p_manipal' }, openedAt: '1h 12m', priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }, { step: 2, role: 'md', user: 'u_amir', state: 'queued' }] },
  ap_438: { id: 'ap_438', code: 'AP-438', kind: 'Subcontractor Payment', amount: 4800, context: 'Saif Ibrahim - 3 days, Riviera fiber pulling', requester: 'u_priya', target: { kind: 'project', id: 'p_azizi' }, openedAt: '2h 04m', priority: 'normal', pendingFor: 'u_rashid', chain: [{ step: 1, role: 'manager', user: 'u_rashid', state: 'pending' }, { step: 2, role: 'accounts', user: 'u_priya', state: 'queued' }, { step: 3, role: 'md', user: 'u_amir', state: 'queued' }] },
  ap_437: { id: 'ap_437', code: 'AP-437', kind: 'Leave Request', amount: null, context: 'Bilal Sayed - May 20-22 - 2 WO conflicts', requester: 'u_bilal', target: { kind: 'user', id: 'u_bilal' }, openedAt: '3h 28m', priority: 'normal', pendingFor: 'u_arvind', chain: [{ step: 1, role: 'lead_worker', user: 'u_arvind', state: 'pending' }, { step: 2, role: 'manager', user: 'u_rashid', state: 'queued' }] },
};

// ── ACTIVITY FEED ──────────────────────────────────────────
const FEED = [
  { id: 'f1', t: '2m ago', kind: 'check-in', who: 'u_arvind', text: 'checked in at Burj Vista Tower 2', tag: 'success', target: { kind: 'wo', id: 'wo_3284' } },
  { id: 'f2', t: '6m ago', kind: 'sla', who: 'system', text: 'TKT-408 response SLA - 12 min remaining', tag: 'warning', target: { kind: 'repair', id: 'r_408' } },
  { id: 'f3', t: '14m ago', kind: 'material', who: 'u_joseph', text: 'requested approval for AED 6,200 cable run', tag: 'info', target: { kind: 'approval', id: 'ap_440' } },
  { id: 'f4', t: '18m ago', kind: 'reactivation', who: 'system', text: 'DAMAC AMC-091 - payment received, reactivation pending', tag: 'primary', target: { kind: 'amc', id: 'amc_091' } },
  { id: 'f5', t: '22m ago', kind: 'signoff', who: 'u_joseph', text: 'CSH Deira customer signed off WO-3279', tag: 'success', target: { kind: 'wo', id: 'wo_3279' } },
  { id: 'f6', t: '34m ago', kind: 'flag', who: 'system', text: 'CAM-B-204 - repeat-failure flag (3 in 90 days)', tag: 'danger', target: { kind: 'wo', id: 'wo_3285' } },
  { id: 'f7', t: '41m ago', kind: 'check-in', who: 'u_karthik', text: 'departed warehouse → Manipal Campus', tag: 'info', target: { kind: 'wo', id: 'wo_3287' } },
  { id: 'f8', t: '52m ago', kind: 'ticket', who: 'u_pooja', text: 'opened TKT-408 - Azizi AC alarm', tag: 'info', target: { kind: 'repair', id: 'r_408' } },
  { id: 'f9', t: '1h 14m', kind: 'invoice', who: 'u_priya', text: 'issued INV-2241 - AED 18,400 for DAMAC', tag: 'info', target: { kind: 'customer', id: 'c_damac' } },
  { id: 'f10', t: '1h 38m', kind: 'leave', who: 'u_bilal', text: 'submitted leave request May 20–22', tag: 'info', target: { kind: 'approval', id: 'ap_437' } },
];

// ── INVENTORY ──────────────────────────────────────────────
const INVENTORY = [
  { id: 'i1', sku: 'CCTV-DOME-4MP', name: '4MP IP Dome Camera', unit: 'pcs', central: 42, vehicles: 6, sites: 18, reorderAt: 20, value: 38000 },
  { id: 'i2', sku: 'CCTV-BULL-8MP', name: '8MP IP Bullet Camera', unit: 'pcs', central: 18, vehicles: 4, sites: 6, reorderAt: 12, value: 22000 },
  { id: 'i3', sku: 'CAT6A-DRUM', name: 'Cat6A Cable Drum (305m)', unit: 'drum', central: 6, vehicles: 2, sites: 4, reorderAt: 8, value: 14400 },
  { id: 'i4', sku: 'NVR-32CH', name: 'NVR 32-channel 4K', unit: 'pcs', central: 5, vehicles: 1, sites: 12, reorderAt: 3, value: 32500 },
  { id: 'i5', sku: 'ACS-RDR-MIFARE', name: 'Mifare ACS Reader', unit: 'pcs', central: 28, vehicles: 5, sites: 22, reorderAt: 15, value: 11200 },
  { id: 'i6', sku: 'PATCH-PNL-48', name: '48-port patch panel', unit: 'pcs', central: 12, vehicles: 2, sites: 8, reorderAt: 5, value: 8400 },
  { id: 'i7', sku: 'POE-SW-24', name: '24-port PoE+ Switch', unit: 'pcs', central: 8, vehicles: 1, sites: 4, reorderAt: 4, value: 18000 },
];

// ── ASSETS (registry) ──────────────────────────────────────
const ASSETS = [
  { id: 'a1', tag: 'CAM-B-204', model: '4MP IP Dome', site: 's_mag318', installedAt: '2022-03-14', warrantyTo: '2025-03-13', faultCount: 3, status: 'Repeat failure' },
  { id: 'a2', tag: 'NVR-MAIN-1', model: 'NVR 32-channel', site: 's_burj', installedAt: '2021-09-22', warrantyTo: '2024-09-21', faultCount: 0, status: 'Healthy' },
  { id: 'a3', tag: 'ACS-D-12', model: 'Mifare Reader', site: 's_csh', installedAt: '2023-06-01', warrantyTo: '2026-05-30', faultCount: 1, status: 'Healthy' },
];

// ── NOTIFICATIONS ──────────────────────────────────────────
const NOTIFICATIONS = [
  { id: 'n1', t: '2m ago', read: false, kind: 'approval', title: 'AMC-091 reactivation needed', body: 'DAMAC payment cleared, awaiting your approval.', target: { kind: 'approval', id: 'ap_441' } },
  { id: 'n2', t: '12m ago', read: false, kind: 'sla', title: 'TKT-408 SLA · 12m remaining', body: 'Response window closing on NMC reader ticket.', target: { kind: 'repair', id: 'r_408' } },
  { id: 'n3', t: '38m ago', read: false, kind: 'material', title: 'Material request - AED 6,200', body: 'Joseph requested Cat6A bulk for Azizi.', target: { kind: 'approval', id: 'ap_440' } },
  { id: 'n4', t: '1h 04m', read: true, kind: 'signoff', title: 'WO-3279 signed off', body: 'CSH Deira service report accepted.', target: { kind: 'wo', id: 'wo_3279' } },
  { id: 'n5', t: '2h 38m', read: true, kind: 'leave', title: 'Leave request - Bilal Sayed', body: 'May 20–22 · 2 work order conflicts detected.', target: { kind: 'approval', id: 'ap_437' } },
];

// ── FORECAST RISKS ─────────────────────────────────────────
const RISKS = [
  { id: 'r1', kind: 'Manpower', label: 'CCTV technicians overloaded', detail: 'Week of Jun 02 - 142% capacity', severity: 'warning' },
  { id: 'r2', kind: 'Material', label: 'Cat6A stock running low', detail: '4 active projects, 2.1km on hand', severity: 'warning' },
  { id: 'r3', kind: 'AMC', label: 'Quarterly service cluster', detail: 'Week of Jun 09 - 14 services due', severity: 'info' },
  { id: 'r4', kind: 'SLA', label: 'NMC ticket near breach', detail: 'TKT-408 - 12 min remaining', severity: 'danger' },
];

// ── COMMS TIMELINE ─────────────────────────────────────────
const COMMS = {
  c_damac: [
    { id: 'cm1', t: 'Today 09:42', kind: 'WhatsApp', from: 'DAMAC Site Manager', body: 'Payment for AMC-091 cleared this morning, please reactivate ASAP.' },
    { id: 'cm2', t: 'Today 09:18', kind: 'System', from: 'Payment gateway', body: 'AED 48,000 reconciled against AMC-091' },
    { id: 'cm3', t: 'Yest 16:30', kind: 'Site visit', from: 'Arvind Krishnan', body: 'Preliminary survey complete, photos uploaded' },
    { id: 'cm4', t: 'Yest 11:05', kind: 'Email', from: 'Rashid Al-Hashimi', body: 'Sent reactivation reminder + Q2 schedule preview' },
    { id: 'cm5', t: 'May 12', kind: 'Invoice', from: 'Accounts', body: 'INV-2238 issued - AED 48,000, due May 15' },
  ],
  c_mag: [
    { id: 'cm1', t: 'Today 11:08', kind: 'WhatsApp', from: 'MAG Reception', body: 'Camera at lobby still offline, please escalate.' },
    { id: 'cm2', t: 'Yest 14:40', kind: 'Site visit', from: 'Bilal Sayed', body: 'Replaced PoE injector. Camera still intermittent.' },
  ],
};

// ── BREAKDOWNS ─────────────────────────────────────────────
const KPI_OPS = {
  open_wo: 38, sla_at_risk: 5, sla_pct: 94.2,
  amc_value_q: 482000, amc_growth: 0.124,
  utilization: 0.87, util_spark: [40, 55, 48, 62, 58, 70, 75, 87],
  approvals_count: 5, approvals_high: 1,
  rev_month: 1280000, rev_growth: 0.082,
  active_projects: 14, projects_at_risk: 3,
};

// ── EXPORT ─────────────────────────────────────────────────
window.DB = {
  USERS, TEAMS, ROLE_LABELS,
  CUSTOMERS, SITES, PROJECTS, AMCS, REPAIRS, WORK_ORDERS,
  APPROVALS, FEED, NOTIFICATIONS, RISKS, COMMS, INVENTORY, ASSETS,
  KPI_OPS,
  // Helpers
  user: (id) => USERS[id] || { name: 'Unknown', initials: '?', tint: 'primary' },
  cust: (id) => CUSTOMERS[id] || null,
  site: (id) => SITES[id] || null,
  proj: (id) => PROJECTS[id] || null,
  amc: (id) => AMCS[id] || null,
  wo: (id) => WORK_ORDERS[id] || null,
  byCustomer: (id) => ({
    projects: Object.values(PROJECTS).filter(p => p.customer === id),
    amcs: Object.values(AMCS).filter(a => a.customer === id),
    repairs: Object.values(REPAIRS).filter(r => r.customer === id),
    wos: Object.values(WORK_ORDERS).filter(w => w.customer === id),
  }),
  byProject: (id) => ({
    wos: Object.values(WORK_ORDERS).filter(w => w.source.kind === 'project' && w.source.id === id),
  }),
  byAmc: (id) => ({
    wos: Object.values(WORK_ORDERS).filter(w => w.source.kind === 'amc' && w.source.id === id),
  }),
};
