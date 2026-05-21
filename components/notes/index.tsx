"use client";
// ============================================================
// Important Notes panel - slides out next to the sidebar.
// Per-user, persisted in Supabase user_notes (RLS-scoped).
// ============================================================

import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import {
  deleteNote, listNotes, relativeTime, togglePinNote, type UserNote,
} from "@/lib/notes";

export function NotesPanel() {
  const { notesOpen, setNotesOpen, openCreate, fireToast, notesVersion, bumpNotes } = useApp();
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Load notes when the panel opens or after a CRUD bump.
  useEffect(() => {
    if (!notesOpen) return;
    let cancelled = false;
    setLoading(true);
    listNotes().then(res => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) setNotes(res.data);
      else fireToast(res.error);
    });
    return () => { cancelled = true; };
  }, [notesOpen, notesVersion, fireToast]);

  // ESC to close (mirrors the Notification dropdown pattern).
  useEffect(() => {
    if (!notesOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNotesOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notesOpen, setNotesOpen]);

  if (!notesOpen) return null;

  const onTogglePin = async (n: UserNote) => {
    const next = !n.is_pinned;
    // Optimistic update so the reorder is immediate.
    setNotes(ns => ns.map(x => x.id === n.id ? { ...x, is_pinned: next } : x)
      .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)
        || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    const res = await togglePinNote(n.id, next);
    if (!res.ok) { fireToast(res.error); bumpNotes(); }
  };

  const onDelete = async (n: UserNote) => {
    if (!window.confirm(`Delete note "${n.title}"? This can't be undone.`)) return;
    const res = await deleteNote(n.id);
    if (res.ok) {
      setNotes(ns => ns.filter(x => x.id !== n.id));
      fireToast("Note deleted");
    } else {
      fireToast(res.error);
    }
  };

  const onEdit = (n: UserNote) => {
    openCreate("note", { id: n.id, title: n.title, body: n.body, is_pinned: n.is_pinned });
  };

  const onAdd = () => openCreate("note");

  const toggleExpand = (id: string) => {
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className="notes-backdrop" onClick={() => setNotesOpen(false)} />
      <aside className="notes-panel" role="dialog" aria-label="Important notes">
        <div className="notes-head">
          <span className="title">Important Notes</span>
          <button className="btn btn-primary btn-sm" onClick={onAdd}>
            <Icon name="plus" size={13} /> Add note
          </button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setNotesOpen(false)} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>

        {loading && notes.length === 0 ? (
          <div className="notes-empty">
            <Icon name="loader" size={20} style={{ animation: "spin 1s linear infinite", color: "var(--ink-quiet)" }} />
            <div className="s">Loading…</div>
          </div>
        ) : notes.length === 0 ? (
          <div className="notes-empty">
            <div className="ic"><Icon name="fileText" size={24} /></div>
            <div className="h">No notes yet</div>
            <div className="s">Add your first one to keep important info handy.</div>
            <button className="btn btn-primary btn-sm" onClick={onAdd}>
              <Icon name="plus" size={13} /> Add note
            </button>
          </div>
        ) : (
          <div className="notes-list">
            {notes.map(n => {
              const isExpanded = expanded.has(n.id);
              return (
                <article key={n.id} className={"note-card" + (n.is_pinned ? " pinned" : "") + (isExpanded ? " expanded" : "")}>
                  <div className="row1">
                    <span className="title-text">{n.title}</span>
                    <button
                      className={"note-pin-btn" + (n.is_pinned ? " on" : "")}
                      onClick={() => onTogglePin(n)}
                      aria-label={n.is_pinned ? "Unpin note" : "Pin note to top"}
                      title={n.is_pinned ? "Unpin" : "Pin to top"}
                    >
                      <Icon name="star" size={14} />
                    </button>
                  </div>
                  <div className="body-text" onClick={() => toggleExpand(n.id)} style={{ cursor: "pointer" }}>
                    {n.body}
                  </div>
                  <div className="meta-row">
                    <span>{relativeTime(n.updated_at)}</span>
                    <div style={{ flex: 1 }} />
                    <div className="actions">
                      <button className="btn btn-ghost" onClick={() => onEdit(n)} aria-label="Edit note">
                        <Icon name="pen" size={12} />
                      </button>
                      <button className="btn btn-ghost" onClick={() => onDelete(n)} aria-label="Delete note">
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </aside>
    </>
  );
}
