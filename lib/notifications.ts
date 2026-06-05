// ============================================================
// Notification row mapper — converts a `notifications` DB row
// (migration 0001 shape) into the UI-facing Notification type
// (lib/types.ts). Pure + dependency-free so BOTH the server
// hydration path (lib/hydrate.ts) and the client refresh path
// (lib/app-context.tsx) can share one mapping.
// ============================================================

import type { Notification } from "./types";

/** Stable English relative-time label (server + client agree). */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!iso || Number.isNaN(t)) return "";
  const ms = Math.max(0, Date.now() - t);
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

/** Columns to SELECT for a notification (keep server + client in sync). */
export const NOTIFICATION_COLUMNS =
  "id, created_at, read_at, kind, title, body, target_kind, target_id";

export function mapNotificationRow(row: Record<string, unknown>): Notification {
  const created = (row.created_at as string) ?? "";
  return {
    id: row.id as string,
    t: relativeTime(created),
    iso: created,
    read: row.read_at != null,
    kind: ((row.kind as string) ?? "system") as Notification["kind"],
    title: (row.title as string) ?? "",
    body: (row.body as string) ?? "",
    target: {
      kind: (row.target_kind as string) ?? "",
      id: (row.target_id as string) ?? "",
    },
    priority: "normal",
    actions: ["view"],
  };
}
