// ============================================================
// Installtec OS - root app
// One shell, one route map, one design system, one data model.
// ============================================================

function Shell() {
  const ctx = window.useApp();
  const route = ctx.route.name;
  const Page = ROUTES[route] || ROUTES.dashboard;

  return (
    <div className="app">
      <div className="app-side">
        <window.Sidebar />
      </div>
      <div className="app-top">
        <window.Topbar />
      </div>
      <main className="app-main">
        <Page />
      </main>

      <window.BottomNav />
      <window.CommandPalette />
      <window.NotifDrawer />
      <window.Toast />
      <window.WoSlideover />
      <window.ApprovalSlideover />
      <window.ReactivationModal />
    </div>
  );
}

// Route table - single source of truth
const ROUTES = {
  dashboard: () => window.Dashboard(),
  workorders: () => window.WorkOrders(),
  feed: () => window.LiveFeed(),
  scheduling: () => window.Scheduling(),
  approvals: () => window.Approvals(),
  projects: () => window.Projects(),
  amc: () => window.AmcModule(),
  repair: () => window.Repair(),
  inventory: () => window.Inventory(),
  logistics: () => window.Logistics(),
  customers: () => window.Customers(),
  team: () => window.Team(),
  reports: () => window.Reports(),
  admin: () => window.Admin(),
};

function Root() {
  return (
    <window.AppProvider>
      <Shell />
    </window.AppProvider>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root />);
