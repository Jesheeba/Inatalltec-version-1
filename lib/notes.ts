// ============================================================
// Important Notes - per-user CRUD.
// All operations go through Supabase under RLS (user_id = fn_my_id()).
// Browser-side anon-key client is fine: RLS guarantees scope.
// ============================================================

import { supabaseBrowser } from "./supabase/client";

export interface UserNote {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listNotes(): Promise<Result<UserNote[]>> {
  const { data, error } = await supabaseBrowser()
    .from("user_notes")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as UserNote[] };
}

export interface NoteInput {
  title: string;
  body: string;
  is_pinned?: boolean;
  organization_id?: string | null;
}

export async function createNote(input: NoteInput): Promise<Result<UserNote>> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!body) return { ok: false, error: "Note body is required." };

  // user_id is set server-side via RLS check - we pass fn_my_id()'s value
  // by reading the signed-in user's public row first.
  const supa = supabaseBrowser();
  const { data: me } = await supa.from("users").select("id, organization_id").maybeSingle();
  if (!me?.id) return { ok: false, error: "Could not resolve your user profile." };

  const { data, error } = await supa.from("user_notes").insert({
    user_id: me.id,
    organization_id: input.organization_id ?? me.organization_id ?? null,
    title, body,
    is_pinned: input.is_pinned ?? false,
  }).select("*").single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as UserNote };
}

export async function updateNote(id: string, patch: Partial<NoteInput>): Promise<Result<UserNote>> {
  const next: Record<string, unknown> = {};
  if (typeof patch.title === "string") {
    const t = patch.title.trim();
    if (!t) return { ok: false, error: "Title is required." };
    next.title = t;
  }
  if (typeof patch.body === "string") {
    const b = patch.body.trim();
    if (!b) return { ok: false, error: "Note body is required." };
    next.body = b;
  }
  if (typeof patch.is_pinned === "boolean") next.is_pinned = patch.is_pinned;

  if (Object.keys(next).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error } = await supabaseBrowser()
    .from("user_notes")
    .update(next)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: data as UserNote };
}

export async function togglePinNote(id: string, pinned: boolean): Promise<Result<UserNote>> {
  return updateNote(id, { is_pinned: pinned });
}

export async function deleteNote(id: string): Promise<Result<null>> {
  const { error } = await supabaseBrowser().from("user_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// "2 minutes ago" style relative time, matching the rest of the app's tone.
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const s = Math.floor(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}
