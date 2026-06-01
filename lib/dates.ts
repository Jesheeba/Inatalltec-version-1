// ============================================================
// Installtec OS — locale-stable date formatters.
//
// `toLocaleDateString()` / `toLocaleString()` are RUNTIME-locale
// dependent. Node.js (SSR) defaults to en-US while the browser
// uses the user's OS locale, so the same `<span>` can produce
// "Tue, May 19" on the server and "Tue, 19 May" on the client.
// React detects the mismatch, throws away the server HTML, and
// re-renders the whole tree on the client — which is slow and
// triggers a "Text content did not match" console warning.
//
// Everything in this file produces the SAME string regardless of
// host locale. Day/month names are hard-coded in English (the
// app's only supported language; the org may bring its own
// number/currency formatting via the Organization record, but
// dates stay English to keep audit logs and CSV exports stable).
// ============================================================

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const LONG_MONTHS  = ["January", "February", "March", "April", "May", "June",
                      "July", "August", "September", "October", "November", "December"] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "Tue, 19 May" — day-month order, no year. */
export function formatShortDate(d: Date): string {
  return `${SHORT_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** "Tue, 19 May 2026" — full short date including the year. */
export function formatLongDate(d: Date): string {
  return `${SHORT_WEEKDAYS[d.getDay()]}, ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "19 May" — no weekday, no year. */
export function formatMonthDay(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** "May 2026" — month and year only (for calendar headers). */
export function formatMonthYear(d: Date): string {
  return `${LONG_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "May" — short month name (3-letter). */
export function formatShortMonth(d: Date): string {
  return SHORT_MONTHS[d.getMonth()];
}

/** "Tue" — 3-letter weekday. */
export function formatShortWeekday(d: Date): string {
  return SHORT_WEEKDAYS[d.getDay()];
}

/** "19 May, 14:30" — short date + 24h time. */
export function formatDateTime(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "19 May 2026, 14:30" — short date with year + 24h time. */
export function formatLongDateTime(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Parse an ISO/timestamp string and format with the named helper.
 *  Returns "—" for null/empty/invalid input. */
export function formatIsoShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatShortDate(d);
}

export function formatIsoMonthDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatMonthDay(d);
}

export function formatIsoDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatDateTime(d);
}

export function formatIsoLongDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : formatLongDateTime(d);
}

/** "10:30 AM" / "10:30 PM" — locale-stable 12-hour clock. */
export function formatTimeOfDay(d: Date): string {
  const h24 = d.getHours();
  const m = d.getMinutes();
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:${pad2(m)} ${period}`;
}

/** "today" / "yesterday" / "19 May" — for one-line "started X at Y" lines. */
export function formatRelativeDay(d: Date, now: Date = new Date()): string {
  const sameDay = d.getFullYear() === now.getFullYear()
              && d.getMonth() === now.getMonth()
              && d.getDate() === now.getDate();
  if (sameDay) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const wasYesterday = d.getFullYear() === yesterday.getFullYear()
                    && d.getMonth() === yesterday.getMonth()
                    && d.getDate() === yesterday.getDate();
  if (wasYesterday) return "yesterday";
  return formatMonthDay(d);
}

/** "1h 15m" / "45m" / "—" — short duration label from raw minutes. */
export function formatDurationMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
