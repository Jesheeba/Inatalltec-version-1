"use client";
// ============================================================
// AppShell - wraps the route content in the persistent
// sidebar + topbar + bottom-nav + overlay portals.
// (Ported from prototype/app.jsx)
// ============================================================

import { AppProvider, useApp } from "@/lib/app-context";
import type { User } from "@/lib/types";
import type { HydrationBundle } from "@/lib/hydrate";
import { Sidebar, Topbar, BottomNav } from "./Shell";
import {
  CommandPalette, NotifDrawer, Toast,
  WoSlideover, ApprovalSlideover, ReactivationModal,
} from "./Overlays";
import { CreateModalsHost } from "./CreateModals";
import { NotesPanel } from "./notes";

export function AppShell({ children, currentUser, initialUsers, initialBundle }: {
  children: React.ReactNode;
  currentUser?: User;
  initialUsers?: User[];
  initialBundle?: HydrationBundle;
}) {
  return (
    <AppProvider currentUser={currentUser} initialUsers={initialUsers} initialBundle={initialBundle}>
      <AppShellInner>{children}</AppShellInner>
    </AppProvider>
  );
}

// Inner shell needs to read the collapse state from context, so it has to
// live below AppProvider.
function AppShellInner({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, setSidebarCollapsed } = useApp();
  return (
    <div className={"app" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
      <div className="app-side"><Sidebar /></div>
      <div className="app-top"><Topbar /></div>
      <main className="app-main">{children}</main>

      {/* Mobile backdrop - only when sidebar is open over the content. */}
      {!sidebarCollapsed && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={() => setSidebarCollapsed(true)}
          aria-hidden="true"
        />
      )}

      <BottomNav />
      <CommandPalette />
      <NotifDrawer />
      <NotesPanel />
      <Toast />
      <WoSlideover />
      <ApprovalSlideover />
      <ReactivationModal />
      <CreateModalsHost />
    </div>
  );
}
