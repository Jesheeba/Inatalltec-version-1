"use client";
// ============================================================
// Growth Plan — calendar/planner module.
//
// One page, three views (Month / Week / List), one filter bar across
// projects + AMC visits + work orders. Role-scoped via lib/calendar.ts.
//
// Mobile (<768px): defaults to List, filter bar collapses to an
// accordion, day-cell row heights compress. Desktop: all three views,
// full inline filter bar.
//
// Click an event → opens whichever detail surface already exists:
//   project    → openProject(id) (navigates to /projects/[id])
//   amc_visit  → openAmc(amcContractId)
//   work_order → openWO(id) (slideover)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { useApp } from "@/lib/app-context";
import { db } from "@/lib/db";
import { PROJECT_PHASE_COLOR, PROJECT_PHASE_LABEL } from "@/lib/phases";
import {
  CardHead, EmptyState, PageHeader,
} from "../shared";
import {
  dayKey, formatEventTime, getCalendarEvents,
  isMultiDay, rangeForDays, rangeForMonth, rangeForWeek,
  shiftDays, shiftMonths,
} from "@/lib/calendar";
import {
  formatLongDate, formatMonthDay, formatMonthYear, formatShortMonth,
  formatShortWeekday,
} from "@/lib/dates";

// Max visible event lanes per day-cell row. After this, additional
// events on a day collapse into a "+N more" indicator. 3 lanes fits in
// the 110px minHeight cell with the top day-number reserved.
const MONTH_VISIBLE_LANES = 3;
const MONTH_LANE_HEIGHT_PX = 20;
const MONTH_LANE_TOP_PX = 26;
import type {
  CalendarEvent, CalendarFilter, CalendarRange, CalendarView,
} from "@/lib/types";

const VIEWPORT_MOBILE_PX = 768;

const FILTER_OPTIONS: { value: CalendarFilter; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "project",    label: "Projects" },
  { value: "amc_visit",  label: "AMC visits" },
  { value: "work_order", label: "Work orders" },
  { value: "mine",       label: "Mine" },
];

const RANGE_OPTIONS: { value: CalendarRange; label: string }[] = [
  { value: "today",    label: "Today" },
  { value: "week",     label: "This week" },
  { value: "month",    label: "This month" },
  { value: "3months",  label: "Next 3 months" },
  { value: "custom",   label: "Custom" },
];

// ── Hooks ─────────────────────────────────────────────────

/** Tailwind-style breakpoint hook — true when viewport is < 768px. */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window === "undefined" ? false : window.matchMedia(`(max-width: ${VIEWPORT_MOBILE_PX - 1}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${VIEWPORT_MOBILE_PX - 1}px)`);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ── Main component ────────────────────────────────────────

export function GrowthPlan() {
  const { me, role, openProject, openAmc, openWO, fireToast, dataVersion } = useApp();
  void dataVersion;
  const search = useSearchParams();
  const isMobile = useIsMobile();

  // Anchor date drives the visible window. Month view scrolls by month,
  // Week view scrolls by 7 days, List view scrolls by 14 days.
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  // Default view — desktop opens Month, mobile opens List. We DON'T
  // force-switch the user back if they pick a different view on
  // mobile; we only use isMobile to set the *initial* default.
  const [view, setView] = useState<CalendarView>(() =>
    typeof window !== "undefined" && window.matchMedia(`(max-width: ${VIEWPORT_MOBILE_PX - 1}px)`).matches
      ? "list" : "month"
  );

  const [filter, setFilter] = useState<CalendarFilter>("all");
  // Default range is "3months" so chip counts and fetched events cover
  // the next 90 days — matches the page subtitle ("Plan the next 3
  // months") and the spec's emphasis on a 3-month planning horizon.
  // The grid still draws whatever the current view chooses (month grid
  // for Month, week strip for Week); events outside the grid still
  // count in the filter chips so users see "AMC visits · 4" even when
  // the visits land in a future month. Dashboard deep-links via
  // openGrowthPlan(range) can override this on mount.
  const [range, setRange] = useState<CalendarRange>(() => {
    const r = search?.get("range");
    if (r === "today" || r === "week" || r === "month" || r === "3months" || r === "custom") return r;
    return "3months";
  });
  const [customStart, setCustomStart] = useState<string>(() => isoDate(new Date()));
  const [customEnd, setCustomEnd] = useState<string>(() => isoDate(shiftDays(new Date(), 14)));

  // Resolved date window for both the view-rendering AND the event-
  // fetching. The view-grid (month/week) decides its own grid shape,
  // but the *event* set is bounded by `range` so filters like "next 3
  // months" surface all 90 days of events even when the user is on
  // the month-grid for May.
  const eventRange = useMemo(() => resolveRange(range, anchor, customStart, customEnd),
    [range, anchor, customStart, customEnd]);

  // The grid range — what the view actually draws.
  const gridRange = useMemo(() => {
    if (view === "month") return rangeForMonth(anchor);
    if (view === "week")  return rangeForWeek(anchor);
    return eventRange;
  }, [view, anchor, eventRange]);

  // Fetch events for whichever is wider — the user's chip range OR the
  // grid range. That way Month view always paints every event in the
  // visible cells regardless of the chip.
  const fetchRange = useMemo(() => ({
    start: new Date(Math.min(eventRange.start.getTime(), gridRange.start.getTime())),
    end:   new Date(Math.max(eventRange.end.getTime(), gridRange.end.getTime())),
  }), [eventRange, gridRange]);

  const events = useMemo(() => getCalendarEvents({
    role, userId: me.id, rangeStart: fetchRange.start, rangeEnd: fetchRange.end, filter,
  }), [role, me.id, fetchRange.start, fetchRange.end, filter, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter chip counts — recomputed across the same range but with
  // filter = "all" so each chip shows its absolute count, not the count
  // within the currently-active filter.
  const allEvents = useMemo(() => getCalendarEvents({
    role, userId: me.id, rangeStart: fetchRange.start, rangeEnd: fetchRange.end, filter: "all",
  }), [role, me.id, fetchRange.start, fetchRange.end, dataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterCounts: Record<CalendarFilter, number> = {
    all:        allEvents.length,
    project:    allEvents.filter(e => e.kind === "project").length,
    amc_visit:  allEvents.filter(e => e.kind === "amc_visit").length,
    work_order: allEvents.filter(e => e.kind === "work_order").length,
    mine:       allEvents.filter(e => e.leadTechId === me.id || e.assigneeIds.includes(me.id)).length,
  };

  // ── Click handler shared across views ─────────────────
  const onEventClick = (e: CalendarEvent) => {
    if (e.source.table === "projects")      return openProject(e.source.id);
    if (e.source.table === "amc_contracts") return openAmc(e.source.id);
    if (e.source.table === "work_orders")   return openWO(e.source.id);
    fireToast("You don't have access to this event");
  };

  // Navigation helpers.
  const goPrev = () => {
    if (view === "month") return setAnchor(a => shiftMonths(a, -1));
    if (view === "week")  return setAnchor(a => shiftDays(a, -7));
    return setAnchor(a => shiftDays(a, -14));
  };
  const goNext = () => {
    if (view === "month") return setAnchor(a => shiftMonths(a, 1));
    if (view === "week")  return setAnchor(a => shiftDays(a, 7));
    return setAnchor(a => shiftDays(a, 14));
  };
  const goToday = () => setAnchor(new Date());

  return (
    <div className="main-pad">
      <PageHeader
        eyebrow="Workspace"
        title="Growth Plan"
        sub="Plan the next 3 months — projects, AMC visits, work orders, and people"
      />

      <FilterBar
        filter={filter}
        setFilter={setFilter}
        counts={filterCounts}
        range={range}
        setRange={setRange}
        customStart={customStart}
        setCustomStart={setCustomStart}
        customEnd={customEnd}
        setCustomEnd={setCustomEnd}
        view={view}
        setView={setView}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        rangeLabel={formatRangeLabel(view, gridRange.start, gridRange.end, anchor)}
        isMobile={isMobile}
      />

      <section style={{ marginTop: 16 }}>
        {view === "month" && (
          <MonthView anchor={anchor} gridRange={gridRange} events={events}
            onClick={onEventClick}
            onExpandDay={(day) => { setAnchor(day); setView("week"); }} />
        )}
        {view === "week" && (
          <WeekView gridRange={gridRange} events={events} onClick={onEventClick} />
        )}
        {view === "list" && (
          <ListView events={events} range={eventRange} onClick={onEventClick} />
        )}
      </section>
    </div>
  );
}

// ── Filter bar ────────────────────────────────────────────

function FilterBar({
  filter, setFilter, counts,
  range, setRange,
  customStart, setCustomStart, customEnd, setCustomEnd,
  view, setView,
  onPrev, onNext, onToday, rangeLabel,
  isMobile,
}: {
  filter: CalendarFilter; setFilter: (f: CalendarFilter) => void;
  counts: Record<CalendarFilter, number>;
  range: CalendarRange; setRange: (r: CalendarRange) => void;
  customStart: string; setCustomStart: (s: string) => void;
  customEnd: string; setCustomEnd: (s: string) => void;
  view: CalendarView; setView: (v: CalendarView) => void;
  onPrev: () => void; onNext: () => void; onToday: () => void; rangeLabel: string;
  isMobile: boolean;
}) {
  const [expanded, setExpanded] = useState<boolean>(!isMobile);
  // Re-collapse when viewport narrows; never auto-collapse on desktop.
  useEffect(() => { if (!isMobile) setExpanded(true); else setExpanded(false); }, [isMobile]);

  return (
    <section className="card" style={{ padding: 14 }}>
      {/* Top row: range nav + view switcher are always visible */}
      <div className="row between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <button className="btn btn-ghost btn-icon" onClick={onPrev} aria-label="Previous">
            <Icon name="chevronLeft" size={16} />
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onToday}>Today</button>
          <button className="btn btn-ghost btn-icon" onClick={onNext} aria-label="Next">
            <Icon name="chevronRight" size={16} />
          </button>
          <span style={{ font: "var(--t-body-md)", fontWeight: 600, marginLeft: 6 }}>
            {rangeLabel}
          </span>
        </div>
        <div className="row gap-2" style={{ alignItems: "center" }}>
          <div className="seg">
            {(["month", "week", "list"] as CalendarView[]).map(v => (
              <button key={v} data-on={String(view === v)} onClick={() => setView(v)}>
                {v === "month" ? "Month" : v === "week" ? "Week" : "List"}
              </button>
            ))}
          </div>
          {isMobile && (
            <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(o => !o)}
              aria-expanded={expanded} aria-controls="growth-plan-filters">
              <Icon name="filter" size={14} /> Filters
              <Icon name={expanded ? "chevronUp" : "chevronDown"} size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Filters row — pills + range select. Hidden behind accordion on mobile. */}
      {expanded && (
        <div id="growth-plan-filters" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            {FILTER_OPTIONS.map(o => {
              const active = filter === o.value;
              return (
                <button key={o.value} onClick={() => setFilter(o.value)}
                  className={"badge " + (active ? "badge-primary" : "badge-outline")}
                  style={{
                    cursor: "pointer", border: active ? 0 : "1px solid var(--border)",
                    padding: "8px 12px", minHeight: 36, font: "var(--t-small)", fontWeight: 500,
                    display: "inline-flex", alignItems: "center", gap: 6,
                  }}>
                  {o.label}
                  <span className="numeric" style={{
                    font: "var(--t-micro)", fontWeight: 600,
                    color: active ? "rgba(255,255,255,0.85)" : "var(--ink-mute)",
                  }}>{counts[o.value]}</span>
                </button>
              );
            })}
          </div>

          <div className="row gap-2" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ font: "var(--t-small)", color: "var(--ink-mute)" }}>Range</label>
            <select className="input" style={{ minHeight: 36, padding: "6px 10px", maxWidth: 200 }}
              value={range} onChange={e => setRange(e.target.value as CalendarRange)}>
              {RANGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {range === "custom" && (
              <>
                <input type="date" className="input" style={{ minHeight: 36, padding: "6px 10px" }}
                  value={customStart} onChange={e => setCustomStart(e.target.value)} aria-label="Start date" />
                <span style={{ color: "var(--ink-quiet)" }}>→</span>
                <input type="date" className="input" style={{ minHeight: 36, padding: "6px 10px" }}
                  value={customEnd} onChange={e => setCustomEnd(e.target.value)} aria-label="End date" />
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Month view ────────────────────────────────────────────

interface LaneAssignment {
  event: CalendarEvent;
  startCol: number;   // 0..6 — day-of-week of event start clipped to this week
  span: number;       // 1..7 — cells the bar covers in this week
  lane: number;       // 0..N — vertical lane in the week
  truncStart: boolean; // event begins before this week
  truncEnd: boolean;   // event ends after this week
}

/**
 * Lay events out across one week into non-overlapping lanes.
 * Multi-day events come first (longest first) so they get the top
 * lanes; single-day chips fill in below. The returned list is sorted
 * by lane so consumers can render in order.
 */
function layoutWeek(week: Date[], events: CalendarEvent[]): LaneAssignment[] {
  const weekStart = new Date(week[0]);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(week[6]);
  weekEnd.setHours(23, 59, 59, 999);

  const candidates: { e: CalendarEvent; startCol: number; span: number; truncStart: boolean; truncEnd: boolean }[] = [];
  for (const e of events) {
    const eEnd = e.endsAt ?? e.startsAt;
    if (e.startsAt.getTime() > weekEnd.getTime()) continue;
    if (eEnd.getTime() < weekStart.getTime()) continue;
    // clip to week
    const start = e.startsAt.getTime() < weekStart.getTime() ? weekStart : e.startsAt;
    const end   = eEnd.getTime() > weekEnd.getTime() ? weekEnd : eEnd;
    const startCol = Math.max(0, Math.min(6, dayDiff(weekStart, start)));
    const endCol   = Math.max(0, Math.min(6, dayDiff(weekStart, end)));
    const span     = Math.max(1, endCol - startCol + 1);
    candidates.push({
      e, startCol, span,
      truncStart: e.startsAt.getTime() < weekStart.getTime(),
      truncEnd:   eEnd.getTime() > weekEnd.getTime(),
    });
  }

  // Sort: multi-day bars first (longer first), then single-day chips by
  // start col. This keeps bars on the top lanes — visually the dominant
  // pattern industry calendars use.
  candidates.sort((a, b) => {
    if (a.span !== b.span) return b.span - a.span;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return a.e.startsAt.getTime() - b.e.startsAt.getTime();
  });

  const laneOccupancy: { start: number; end: number }[][] = [];
  const out: LaneAssignment[] = [];
  for (const c of candidates) {
    const endCol = c.startCol + c.span - 1;
    let lane = 0;
    while (true) {
      const used = laneOccupancy[lane] ?? [];
      const conflict = used.some(u => !(endCol < u.start || c.startCol > u.end));
      if (!conflict) break;
      lane++;
    }
    if (!laneOccupancy[lane]) laneOccupancy[lane] = [];
    laneOccupancy[lane].push({ start: c.startCol, end: endCol });
    out.push({
      event: c.e,
      startCol: c.startCol,
      span: c.span,
      lane,
      truncStart: c.truncStart,
      truncEnd: c.truncEnd,
    });
  }
  out.sort((a, b) => a.lane - b.lane);
  return out;
}

/** Day-difference (calendar days, ignoring time-of-day). */
function dayDiff(a: Date, b: Date): number {
  const aMid = new Date(a); aMid.setHours(0, 0, 0, 0);
  const bMid = new Date(b); bMid.setHours(0, 0, 0, 0);
  return Math.round((bMid.getTime() - aMid.getTime()) / 86_400_000);
}

function MonthView({ anchor, gridRange, events, onClick, onExpandDay }: {
  anchor: Date;
  gridRange: { start: Date; end: Date };
  events: CalendarEvent[];
  onClick: (e: CalendarEvent) => void;
  // Fired when the user clicks the "+N more" affordance on a cell —
  // GrowthPlan responds by switching to Week view anchored on that day.
  onExpandDay: (day: Date) => void;
}) {
  const days: Date[] = [];
  for (let t = gridRange.start.getTime(); t <= gridRange.end.getTime(); t += 86_400_000) {
    days.push(new Date(t));
  }
  const todayKey = dayKey(new Date());
  const anchorMonth = anchor.getMonth();
  const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <section className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--divider)" }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{
            padding: "10px 12px",
            font: "var(--t-micro)", color: "var(--ink-mute)",
            textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600,
            textAlign: "center",
          }}>{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <MonthWeekRow
          key={wi}
          week={week}
          events={events}
          first={wi === 0}
          anchorMonth={anchorMonth}
          todayKey={todayKey}
          todayMs={todayMs}
          onClick={onClick}
          onExpandDay={onExpandDay}
        />
      ))}
    </section>
  );
}

function MonthWeekRow({ week, events, first, anchorMonth, todayKey, todayMs, onClick, onExpandDay }: {
  week: Date[];
  events: CalendarEvent[];
  first: boolean;
  anchorMonth: number;
  todayKey: string;
  todayMs: number;
  onClick: (e: CalendarEvent) => void;
  onExpandDay: (day: Date) => void;
}) {
  const layout = useMemo(() => layoutWeek(week, events), [week, events]);

  // Visible bars vs. overflow.
  // Anything in lane >= MONTH_VISIBLE_LANES is collapsed into per-cell
  // "+N more" counters. Compute the per-day overflow now so we can
  // render it in the right column.
  const visible = layout.filter(l => l.lane < MONTH_VISIBLE_LANES);
  const overflowByCol: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const l of layout) {
    if (l.lane < MONTH_VISIBLE_LANES) continue;
    for (let c = l.startCol; c < l.startCol + l.span; c++) overflowByCol[c]++;
  }

  // Row height: top reserved for day number + lanes + a little padding.
  const rowMinHeight = MONTH_LANE_TOP_PX + MONTH_VISIBLE_LANES * MONTH_LANE_HEIGHT_PX + 18;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(7, 1fr)",
      position: "relative",
      minHeight: rowMinHeight,
    }}>
      {/* Layer 1 — day cells (background, day number, optional overflow counter) */}
      {week.map((d, col) => {
        const k = dayKey(d);
        const inMonth = d.getMonth() === anchorMonth;
        const isToday = k === todayKey;
        const isPast = d.getTime() < todayMs;
        const overflow = overflowByCol[col];
        return (
          <div key={k} style={{
            borderTop: first ? undefined : "1px solid var(--divider)",
            borderRight: "1px solid var(--divider)",
            padding: 6,
            background: !inMonth
              ? "var(--bg-deep)"
              : isToday
                ? "color-mix(in srgb, var(--pri-500) 6%, transparent)"
                : "transparent",
            opacity: !inMonth ? 0.55 : 1,
            position: "relative",
            outline: isToday ? "2px solid var(--pri-500)" : undefined,
            outlineOffset: isToday ? -2 : undefined,
          }}>
            <div style={{
              font: "var(--t-small)",
              fontWeight: isToday ? 700 : 500,
              color: isPast && inMonth ? "var(--ink-quiet)" : isToday ? "var(--pri-700)" : "var(--ink)",
            }}>
              {d.getDate()}
            </div>
            {overflow > 0 && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); onExpandDay(d); }}
                title={`Show all ${overflow + MONTH_VISIBLE_LANES} events for ${formatMonthDay(d)} in Week view`}
                style={{
                  position: "absolute",
                  left: 6, right: 6,
                  bottom: 4,
                  font: "var(--t-micro)",
                  color: "var(--ink-mute)",
                  fontWeight: 500,
                  background: "transparent",
                  border: 0,
                  padding: "2px 4px",
                  borderRadius: "var(--r-sm)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onMouseEnter={ev => {
                  (ev.currentTarget as HTMLButtonElement).style.background = "var(--bg-muted)";
                  (ev.currentTarget as HTMLButtonElement).style.color = "var(--ink)";
                }}
                onMouseLeave={ev => {
                  (ev.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (ev.currentTarget as HTMLButtonElement).style.color = "var(--ink-mute)";
                }}>
                +{overflow} more
              </button>
            )}
          </div>
        );
      })}

      {/* Layer 2 — event bars/chips overlay */}
      {visible.map(la => (
        <MonthBar key={`${la.event.id}:${la.startCol}:${la.lane}`} la={la} onClick={() => onClick(la.event)} />
      ))}
    </div>
  );
}

function MonthBar({ la, onClick }: { la: LaneAssignment; onClick: () => void }) {
  const { event: e, startCol, span, lane, truncStart, truncEnd } = la;
  const isPastDone = (e.status === "done" || e.status === "closed"
                      || e.status === "completed" || e.status === "cancelled");
  // Rounded corners only where the bar truly starts/ends — flat where it
  // gets clipped by the week boundary so the ribbon visually continues
  // into the next row.
  const leftR  = truncStart ? 0 : 4;
  const rightR = truncEnd   ? 0 : 4;

  // Phase tint (migration 0020). Look up the live project so the
  // indicator dot updates immediately after a "Move to Next Phase".
  // calendar.ts doesn't know about phases (intentionally — calendar
  // logic is locked under the protection rules), so the indicator is
  // derived here at render time.
  const phase = e.source.table === "projects"
    ? db.proj(e.source.id)?.currentPhase ?? null
    : null;
  const phaseColor = phase ? PROJECT_PHASE_COLOR[phase] : null;

  const tooltip = [
    e.title,
    e.customerName,
    e.siteName,
    formatEventTime(e),
    e.leadTechName ? `Lead: ${e.leadTechName}` : null,
    phase ? `Phase: ${PROJECT_PHASE_LABEL[phase]}` : null,
  ].filter(Boolean).join(" · ");

  // Show the title only when the bar starts in this week (or is the
  // first cell visible if truncated from before). Hides the title on
  // continuation rows for multi-week events.
  const showLabel = !truncStart;

  // Horizontal arrow indicators when the bar continues out of view.
  const labelPrefix = truncStart ? "← " : "";
  const labelSuffix = truncEnd   ? " →" : "";

  return (
    <button
      onClick={onClick}
      title={tooltip}
      style={{
        position: "absolute",
        // Left/width as a % of the row so the bar lines up with the 7-col grid.
        left:  `calc(${(startCol / 7) * 100}% + 4px)`,
        width: `calc(${(span / 7) * 100}% - 8px)`,
        top:   MONTH_LANE_TOP_PX + lane * MONTH_LANE_HEIGHT_PX,
        height: MONTH_LANE_HEIGHT_PX - 2,
        background: e.color,
        color: "white",
        font: "var(--t-micro)",
        fontWeight: 500,
        border: 0,
        cursor: "pointer",
        opacity: isPastDone ? 0.4 : 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "left",
        padding: "2px 6px",
        borderTopLeftRadius:    leftR,
        borderBottomLeftRadius: leftR,
        borderTopRightRadius:    rightR,
        borderBottomRightRadius: rightR,
        display: "flex", alignItems: "center", gap: 4,
      }}>
      {phaseColor && !truncStart && (
        <span style={{
          width: 6, height: 6, borderRadius: 999,
          background: phaseColor.hex,
          flexShrink: 0,
          boxShadow: "0 0 0 1px rgba(255,255,255,0.4)",
        }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
        {showLabel ? `${labelPrefix}${e.title}${labelSuffix}` : (truncStart ? `← ${e.title}${labelSuffix}` : "")}
      </span>
    </button>
  );
}

/**
 * Smaller pill used by the Week view's all-day strip. The Month view
 * no longer renders these (it uses MonthBar above instead) but the
 * week-strip still needs something chip-shaped for one-day items.
 */
function MonthEventChip({ e, dayKeyStr, onClick }: {
  e: CalendarEvent; dayKeyStr: string; onClick: () => void;
}) {
  const isPastDone = (e.status === "done" || e.status === "closed"
                      || e.status === "completed" || e.status === "cancelled");
  const isMulti = isMultiDay(e);
  const firstDay = isMulti && dayKey(e.startsAt) === dayKeyStr;
  const lastDay  = isMulti && e.endsAt && dayKey(e.endsAt) === dayKeyStr;
  const radius = isMulti
    ? `${firstDay ? 4 : 0}px ${lastDay ? 4 : 0}px ${lastDay ? 4 : 0}px ${firstDay ? 4 : 0}px`
    : "4px";
  const tooltip = [
    e.title, e.customerName, e.siteName, formatEventTime(e),
    e.leadTechName ? `Lead: ${e.leadTechName}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <button onClick={onClick} title={tooltip}
      style={{
        display: "block",
        textAlign: "left",
        padding: "2px 6px",
        borderRadius: radius,
        background: e.color,
        color: "white",
        font: "var(--t-micro)",
        fontWeight: 500,
        border: 0,
        cursor: "pointer",
        opacity: isPastDone ? 0.4 : 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minHeight: 18,
      }}>
      {e.title}
    </button>
  );
}

// ── Week view ─────────────────────────────────────────────

const WEEK_HOURS = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 .. 18:00
const WEEK_HOUR_PX = 48; // pixel height per hour row
const WEEK_GRID_START_HOUR = WEEK_HOURS[0];
const WEEK_GRID_END_HOUR   = WEEK_HOURS[WEEK_HOURS.length - 1] + 1; // exclusive: row past 18:00

/**
 * Single positioned column per day. Hour lines paint as a static
 * background grid; WO blocks overlay as absolute-positioned rectangles
 * whose top = (startHour - 8) * 48 and height = duration * 48. Events
 * that fall outside 8:00–19:00 are clipped to the visible window; if
 * they fall entirely outside, a small "before/after" marker still
 * surfaces them at the top/bottom of the column so they're not lost.
 */
function WeekTimedGrid({ days, timed, todayKey, onClick }: {
  days: Date[];
  timed: CalendarEvent[];
  todayKey: string;
  onClick: (e: CalendarEvent) => void;
}) {
  // Defense-in-depth: drop anything that isn't a work order. Projects
  // and AMC visits belong in WeekAllDayStrip; if one leaks in here it
  // would render at the 12:00 row (its parseDateOnly noon anchor) AND
  // also show in the all-day strip — duplicate rendering, which was
  // round 6's regression.
  const wos = timed.filter(e => e.kind === "work_order");
  const totalHeight = (WEEK_GRID_END_HOUR - WEEK_GRID_START_HOUR) * WEEK_HOUR_PX;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)" }}>
      {/* Hour labels column */}
      <div style={{ borderRight: "1px solid var(--divider)" }}>
        {WEEK_HOURS.map(h => (
          <div key={h} style={{
            height: WEEK_HOUR_PX, padding: "4px 8px",
            font: "var(--t-micro)", color: "var(--ink-mute)",
            borderBottom: "1px solid var(--divider)",
          }}>
            {String(h).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {/* One positioned column per day. WOs appear in the column of
          their start day only (multi-day WOs are extremely rare; the
          block height still reflects same-day duration). */}
      {days.map(d => {
        const k = dayKey(d);
        const isToday = k === todayKey;
        const dayEvts = wos.filter(e => dayKey(e.startsAt) === k);
        return (
          <div key={k} style={{
            position: "relative",
            height: totalHeight,
            borderLeft: "1px solid var(--divider)",
            background: isToday ? "color-mix(in srgb, var(--pri-500) 4%, transparent)" : undefined,
            overflow: "hidden",
          }}>
            {/* Hour lines */}
            {WEEK_HOURS.map((_, idx) => (
              <div key={idx} style={{
                position: "absolute",
                left: 0, right: 0,
                top: (idx + 1) * WEEK_HOUR_PX,
                height: 1, background: "var(--divider)",
              }} />
            ))}

            {/* Event blocks. Multi-day events render in every day they
                cover; the hour-position is taken from the original
                startsAt time so the same project that runs Mon-Fri
                appears in the same row on every day. Off-grid hours are
                CLAMPED to the visible window (never null'd out) so the
                user never loses an event silently — they get an "↑" or
                "↓" marker instead. */}
            {dayEvts.map(e => {
              const startHr  = e.startsAt.getHours() + e.startsAt.getMinutes() / 60;
              const endDate  = e.endsAt ?? new Date(e.startsAt.getTime() + 60 * 60_000);
              const endHr    = endDate.getHours() + endDate.getMinutes() / 60;
              // For single-day events use the real end; for multi-day
              // events render a fixed-height block in the hour row.
              const sameDay = dayKey(e.startsAt) === dayKey(endDate);
              const blockEndHr = sameDay ? Math.max(endHr, startHr + 0.5) : startHr + 1;
              const topHr  = Math.max(WEEK_GRID_START_HOUR, Math.min(WEEK_GRID_END_HOUR - 0.5, startHr));
              const botHr  = Math.max(topHr + 0.5, Math.min(WEEK_GRID_END_HOUR, blockEndHr));
              const top    = (topHr - WEEK_GRID_START_HOUR) * WEEK_HOUR_PX;
              const height = Math.max(20, (botHr - topHr) * WEEK_HOUR_PX - 2);
              const truncTop = startHr < WEEK_GRID_START_HOUR;
              const truncBot = blockEndHr > WEEK_GRID_END_HOUR;
              const startLabel = `${pad2(e.startsAt.getHours())}:${pad2(e.startsAt.getMinutes())}`;
              const endLabel   = `${pad2(endDate.getHours())}:${pad2(endDate.getMinutes())}`;
              const timeLabel = sameDay ? `${startLabel}–${endLabel}` : `${startLabel} →`;
              const tooltip = [
                e.title, e.customerName, e.siteName,
                timeLabel,
                e.leadTechName ? `Lead: ${e.leadTechName}` : null,
              ].filter(Boolean).join(" · ");
              return (
                <button key={`${e.id}:${k}`} onClick={() => onClick(e)} title={tooltip}
                  style={{
                    position: "absolute",
                    left: 2, right: 2,
                    top, height,
                    background: e.color, color: "white",
                    border: 0, padding: "3px 6px",
                    borderRadius: 4,
                    cursor: "pointer",
                    font: "var(--t-micro)", fontWeight: 600,
                    textAlign: "left",
                    overflow: "hidden",
                    display: "flex", flexDirection: "column", gap: 1,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                  }}>
                  <div style={{ font: "var(--t-micro)", opacity: 0.9 }}>
                    {truncTop ? "↑ " : ""}{timeLabel}{truncBot ? " ↓" : ""}
                  </div>
                  <div style={{
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", font: "var(--t-micro)", fontWeight: 500,
                  }}>
                    {e.title}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Row in the "+N more" popover. Layout: [time] [title] [type badge].
 * For projects + AMC visits, time slot reads "All day" (they're date-
 * only); for work orders we render the actual hh:mm–hh:mm window so a
 * user planning their day can scan a column quickly.
 */
function popoverTimeLabel(e: CalendarEvent): string {
  if (e.kind === "project" || e.kind === "amc_visit") return "All day";
  const start = `${pad2(e.startsAt.getHours())}:${pad2(e.startsAt.getMinutes())}`;
  if (!e.endsAt) return start;
  const end   = `${pad2(e.endsAt.getHours())}:${pad2(e.endsAt.getMinutes())}`;
  const sameDay = e.startsAt.getFullYear() === e.endsAt.getFullYear()
               && e.startsAt.getMonth()    === e.endsAt.getMonth()
               && e.startsAt.getDate()     === e.endsAt.getDate();
  return sameDay ? `${start}–${end}` : `${start} →`;
}

function popoverTypeBadge(e: CalendarEvent): { label: string; cls: string } {
  if (e.kind === "project")   return { label: "Project", cls: "badge-info" };
  if (e.kind === "amc_visit") return { label: "AMC",     cls: "badge-success" };
  return { label: "WO", cls: "badge-warning" };
}

function PopoverRow({ e, onClick }: { e: CalendarEvent; onClick: () => void }) {
  const time = popoverTimeLabel(e);
  const badge = popoverTypeBadge(e);
  return (
    <button onClick={onClick}
      style={{
        all: "unset", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10,
        padding: "6px 8px", borderRadius: "var(--r-sm)",
      }}
      onMouseEnter={ev => (ev.currentTarget as HTMLButtonElement).style.background = "var(--bg-muted)"}
      onMouseLeave={ev => (ev.currentTarget as HTMLButtonElement).style.background = "transparent"}>
      <span style={{
        width: 8, height: 8, borderRadius: 999,
        background: e.color, flexShrink: 0,
      }} />
      <span className="numeric" style={{
        font: "var(--t-micro)", fontWeight: 600,
        color: "var(--ink)", minWidth: 80, flexShrink: 0,
      }}>
        {time}
      </span>
      <span className="truncate" style={{
        font: "var(--t-small)", fontWeight: 500, flex: 1, minWidth: 0,
      }}>
        {e.title}
      </span>
      <span className={"badge " + badge.cls} style={{
        font: "var(--t-micro)", fontWeight: 600, flexShrink: 0,
        padding: "1px 6px",
      }}>
        {badge.label}
      </span>
    </button>
  );
}

/**
 * All-day strip with continuous multi-day bars (lane-based, mirroring
 * MonthView's MonthBar layout). A project running Mon–Fri renders as
 * ONE bar spanning 5 cells, not 5 separate chips.
 *
 * Yusuf's "some projects missing" report came from an earlier lane cap
 * (max 3 visible) that hid lane 4+ behind a "+N more" button. The cap
 * is gone now: every project gets its own lane, so all of them are
 * always visible. The strip simply grows taller as needed.
 */
const ALL_DAY_LANE_PX = 22;
const ALL_DAY_LANE_GAP = 2;
function WeekAllDayStrip({ days, allDay, onClick }: {
  days: Date[];
  allDay: CalendarEvent[];
  onClick: (e: CalendarEvent) => void;
}) {
  // Defensive re-filter — see WeekTimedGrid. Work orders must NEVER end
  // up in the all-day strip; they belong in the positioned hour grid.
  const dateOnlyEvents = allDay.filter(e => e.kind === "project" || e.kind === "amc_visit");
  const layout = useMemo(() => layoutWeek(days, dateOnlyEvents), [days, dateOnlyEvents]);

  // Number of lanes the layout actually needs. Every event is visible —
  // no hidden overflow. The strip height grows to fit.
  const laneCount = layout.reduce((mx, l) => Math.max(mx, l.lane + 1), 0);
  const stripHeight = laneCount === 0
    ? 0
    : laneCount * ALL_DAY_LANE_PX + (laneCount - 1) * ALL_DAY_LANE_GAP + 8;

  if (laneCount === 0) return null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "60px 1fr",
      borderBottom: "1px solid var(--divider)",
    }}>
      {/* "all day" label */}
      <div style={{
        padding: "8px", font: "var(--t-micro)", color: "var(--ink-mute)",
        alignSelf: "flex-start",
      }}>
        all day
      </div>

      {/* 7-day canvas — relative positioned so the bars overlay correctly. */}
      <div style={{ position: "relative", height: stripHeight, padding: "4px 0" }}>
        {/* Background day cell dividers */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          position: "absolute", inset: 0,
        }}>
          {days.map((d, col) => (
            <div key={dayKey(d)} style={{
              borderLeft: col === 0 ? undefined : "1px solid var(--divider)",
            }} />
          ))}
        </div>

        {/* Continuous bars overlay — one absolute-positioned bar per
            LaneAssignment. Every event in the layout renders here; no
            overflow truncation. A Mon–Fri project becomes a single
            ribbon spanning 5 cells. */}
        {layout.map(la => (
          <AllDayBar key={`${la.event.id}:${la.startCol}:${la.lane}`}
            la={la} onClick={() => onClick(la.event)} />
        ))}
      </div>
    </div>
  );
}

/** Absolute-positioned ribbon for one event in the all-day strip. */
function AllDayBar({ la, onClick }: { la: LaneAssignment; onClick: () => void }) {
  const { event: e, startCol, span, lane, truncStart, truncEnd } = la;
  const leftR  = truncStart ? 0 : 4;
  const rightR = truncEnd   ? 0 : 4;
  const labelPrefix = truncStart ? "← " : "";
  const labelSuffix = truncEnd   ? " →" : "";
  const tooltip = [
    e.title, e.customerName, e.siteName,
    e.leadTechName ? `Lead: ${e.leadTechName}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <button onClick={onClick} title={tooltip}
      style={{
        position: "absolute",
        // Position by column percentage so it lines up with the
        // underlying 7-col grid even if the parent width changes.
        left:  `calc(${(startCol / 7) * 100}% + 4px)`,
        width: `calc(${(span / 7) * 100}% - 8px)`,
        top:   4 + lane * (ALL_DAY_LANE_PX + ALL_DAY_LANE_GAP),
        height: ALL_DAY_LANE_PX,
        background: e.color, color: "white",
        font: "var(--t-micro)", fontWeight: 600,
        border: 0, cursor: "pointer",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textAlign: "left",
        padding: "2px 8px",
        borderTopLeftRadius:    leftR,
        borderBottomLeftRadius: leftR,
        borderTopRightRadius:    rightR,
        borderBottomRightRadius: rightR,
        display: "flex", alignItems: "center",
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      }}>
      <span style={{
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {labelPrefix}{e.title}{labelSuffix}
      </span>
    </button>
  );
}

function WeekView({ gridRange, events, onClick }: {
  gridRange: { start: Date; end: Date };
  events: CalendarEvent[];
  onClick: (e: CalendarEvent) => void;
}) {
  const days: Date[] = [];
  for (let t = gridRange.start.getTime(); t <= gridRange.end.getTime() && days.length < 7; t += 86_400_000) {
    days.push(new Date(t));
  }
  const todayKey = dayKey(new Date());

  // Partition events strictly by kind. Projects and AMC visits are
  // date-only domain concepts — they always belong in the all-day strip
  // regardless of any clock-time noise that crept into their parsing
  // (calendar.ts anchors them at noon to dodge timezone wraparound, so
  // a getHours()===0 test would wrongly drop them). Work orders have
  // real scheduled_start/scheduled_end timestamps → always timed lane,
  // even if a particular WO happens to be at midnight. The downstream
  // components also filter defensively — see WeekAllDayStrip and
  // WeekTimedGrid — so a stray event with an unexpected kind can never
  // leak into the wrong lane.
  const allDay: CalendarEvent[] = [];
  const timed:  CalendarEvent[] = [];
  for (const e of events) {
    if (e.kind === "work_order") timed.push(e);
    else if (e.kind === "project" || e.kind === "amc_visit") allDay.push(e);
    else if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[GrowthPlan] unexpected event kind, skipping:", e);
    }
  }

  // Developer diagnostic — set `window.__WEEK_DEBUG = true` in the
  // browser console (then re-render Week view) to dump every event
  // entering this view + how it gets classified + what the all-day
  // and timed sub-components will receive. Three console.tables so the
  // browser renders them as proper sortable grids.
  if (typeof window !== "undefined"
      && (window as unknown as { __WEEK_DEBUG?: boolean }).__WEEK_DEBUG) {
    /* eslint-disable no-console */
    const visibleStart = days[0];
    const visibleEnd   = days[days.length - 1];
    console.group(
      `%c[WEEK DEBUG] ${dayKey(visibleStart)} → ${dayKey(visibleEnd)}`,
      "background:#3B82F6;color:white;padding:2px 6px;border-radius:3px;",
    );

    // STEP A — every event reaching WeekView (already range-filtered
    // upstream by getCalendarEvents, so this is "events visible in the
    // fetch range").
    console.log("STEP A — events entering WeekView (n=" + events.length + ")");
    console.table(events.map(e => ({
      kind:    e.kind,
      title:   e.title,
      startsAt: e.startsAt.toISOString(),
      endsAt:   e.endsAt ? e.endsAt.toISOString() : null,
      startHr: e.startsAt.getHours() + ":" + String(e.startsAt.getMinutes()).padStart(2, "0"),
      source:  `${e.source.table}:${e.source.id.slice(0, 8)}`,
    })));

    // STEP B — classification result.
    console.log(
      `STEP B — classified: allDay=${allDay.length}, timed=${timed.length}, ` +
      `dropped=${events.length - allDay.length - timed.length}`,
    );
    console.table([
      { bucket: "allDay", count: allDay.length, kinds: allDay.map(e => e.kind).join(",") },
      { bucket: "timed",  count: timed.length,  kinds: timed.map(e => e.kind).join(",") },
    ]);

    // STEP C — what each sub-component will see + per-day breakdown.
    console.log("STEP C — per-day breakdown for the visible week");
    console.table(days.map(d => {
      const k = dayKey(d);
      const allDayHere = allDay.filter(e => {
        const s = dayKey(e.startsAt);
        const en = e.endsAt ? dayKey(e.endsAt) : s;
        return k >= s && k <= en;
      });
      const timedHere = timed.filter(e => dayKey(e.startsAt) === k);
      return {
        day: k,
        weekday: formatShortWeekday(d),
        allDayCount: allDayHere.length,
        allDayTitles: allDayHere.map(e => `${e.kind.charAt(0)}:${e.title}`).join(" | "),
        timedCount: timedHere.length,
        timedTitles: timedHere.map(e =>
          `${e.startsAt.getHours()}:${String(e.startsAt.getMinutes()).padStart(2, "0")} ${e.title}`,
        ).join(" | "),
      };
    }));

    console.groupEnd();
    /* eslint-enable no-console */
  }

  if (events.length === 0) {
    return (
      <section className="card card-pad">
        <EmptyState icon="calendar" title="No events this week"
          sub="Try a different range or clear the filter." />
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 0, overflow: "auto" }}>
      {/* Day-of-week header */}
      <div style={{ display: "grid", gridTemplateColumns: "60px repeat(7, 1fr)",
                    borderBottom: "1px solid var(--divider)" }}>
        <div />
        {days.map(d => {
          const k = dayKey(d);
          const isToday = k === todayKey;
          return (
            <div key={k} style={{
              padding: "10px 6px", textAlign: "center",
              background: isToday ? "color-mix(in srgb, var(--pri-500) 6%, transparent)" : undefined,
              outline: isToday ? "2px solid var(--pri-500)" : undefined,
              outlineOffset: isToday ? -2 : undefined,
            }}>
              <div style={{ font: "var(--t-micro)", color: "var(--ink-mute)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {formatShortWeekday(d)}
              </div>
              <div style={{ font: "var(--t-body-md)", fontWeight: isToday ? 700 : 600,
                            color: isToday ? "var(--pri-700)" : "var(--ink)" }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day strip */}
      {allDay.length > 0 && (
        <WeekAllDayStrip days={days} allDay={allDay} onClick={onClick} />
      )}

      {/* Hour grid — work orders only. Projects + AMC visits already
          appear in the all-day strip above; rendering them here too
          would duplicate them at the 12:00 row (their parseDateOnly
          noon anchor) which is the regression Yusuf caught in round 6. */}
      <WeekTimedGrid days={days} timed={timed} todayKey={todayKey} onClick={onClick} />
    </section>
  );
}

// ── List view ─────────────────────────────────────────────

function ListView({ events, range, onClick }: {
  events: CalendarEvent[];
  range: { start: Date; end: Date };
  onClick: (e: CalendarEvent) => void;
}) {
  const [showPast, setShowPast] = useState(false);
  const now = new Date();
  const todayKey = dayKey(now);
  const past   = events.filter(e => dayKey(e.startsAt) < todayKey);
  const future = events.filter(e => dayKey(e.startsAt) >= todayKey);

  // Group future by day for the headings.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of future) {
    const k = dayKey(e.startsAt);
    const list = byDay.get(k) ?? [];
    list.push(e);
    byDay.set(k, list);
  }
  const orderedDays = Array.from(byDay.keys()).sort();

  if (events.length === 0) {
    return (
      <section className="card card-pad">
        <EmptyState icon="calendar" title="No events in this range"
          sub="Try a different filter or shift the date range." />
      </section>
    );
  }

  return (
    <section className="card" style={{ padding: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--divider)" }}>
        <CardHead
          title={`${events.length} event${events.length === 1 ? "" : "s"}`}
          sub={`${formatLong(range.start)} → ${formatLong(range.end)}`} />
      </div>

      {past.length > 0 && (
        <div style={{ padding: "8px 16px", borderBottom: "1px solid var(--divider)" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowPast(o => !o)}>
            <Icon name={showPast ? "chevronDown" : "chevronRight"} size={12} />
            {past.length} past event{past.length === 1 ? "" : "s"}
          </button>
          {showPast && (
            <div className="col" style={{ gap: 4, marginTop: 8 }}>
              {past.map(e => <ListRow key={e.id} e={e} onClick={() => onClick(e)} muted />)}
            </div>
          )}
        </div>
      )}

      <div style={{ padding: 8 }}>
        {orderedDays.map(k => {
          const items = byDay.get(k)!;
          const date = parseLocalDay(k);
          const isToday = k === todayKey;
          return (
            <div key={k} style={{ marginBottom: 14 }}>
              <div style={{
                padding: "8px 12px",
                font: "var(--t-small)",
                color: isToday ? "var(--pri-700)" : "var(--ink-mute)",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                {isToday ? "Today · " : ""}{formatLong(date)} · {items.length} event{items.length === 1 ? "" : "s"}
              </div>
              <div className="col" style={{ gap: 4 }}>
                {items.map(e => <ListRow key={e.id} e={e} onClick={() => onClick(e)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ListRow({ e, onClick, muted }: { e: CalendarEvent; onClick: () => void; muted?: boolean }) {
  const customer = e.customerName ?? (e.customerId ? db.cust(e.customerId)?.name : null) ?? "Unknown";
  const site = e.siteName ?? (e.siteId ? db.site(e.siteId)?.name : null);
  // Same phase lookup as MonthBar — derived here at render time so it
  // updates immediately after a phase advance without touching lib/calendar.ts.
  const phase = e.source.table === "projects"
    ? db.proj(e.source.id)?.currentPhase ?? null
    : null;
  return (
    <button onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "flex", gap: 12, alignItems: "center",
        padding: "10px 12px", borderRadius: "var(--r-md)",
        background: "var(--bg-muted)", border: "1px solid var(--border)",
        minHeight: 56, opacity: muted ? 0.6 : 1,
      }}>
      <span style={{
        width: 10, height: 10, borderRadius: 999, flexShrink: 0,
        background: e.color,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2" style={{ alignItems: "center", minWidth: 0 }}>
          <span className="truncate" style={{ font: "var(--t-body-md)", fontWeight: 500 }}>
            {e.title}
          </span>
          {phase && (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "1px 6px", borderRadius: 999,
              background: PROJECT_PHASE_COLOR[phase].bg,
              color: PROJECT_PHASE_COLOR[phase].fg,
              font: "var(--t-micro)", fontWeight: 600,
              flexShrink: 0,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: 999,
                background: PROJECT_PHASE_COLOR[phase].dot,
              }} />
              {PROJECT_PHASE_LABEL[phase]}
            </span>
          )}
        </div>
        <div className="truncate" style={{ font: "var(--t-small)", color: "var(--ink-mute)", marginTop: 2 }}>
          {formatEventTime(e)} · {customer}{site ? ` · ${site}` : ""}
        </div>
      </div>
      <span style={{ font: "var(--t-micro)", color: "var(--ink-quiet)", flexShrink: 0,
                     textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {labelForKind(e.kind)}
      </span>
    </button>
  );
}

function labelForKind(k: CalendarEvent["kind"]): string {
  if (k === "project")    return "Project";
  if (k === "amc_visit")  return "AMC";
  return "Work Order";
}

// ── Utilities ─────────────────────────────────────────────

function resolveRange(
  range: CalendarRange,
  anchor: Date,
  customStart: string,
  customEnd: string,
): { start: Date; end: Date } {
  if (range === "today")    return rangeForDays(anchor, 0);
  if (range === "week")     return rangeForWeek(anchor);
  if (range === "month")    return rangeForMonth(anchor);
  if (range === "3months")  return rangeForDays(anchor, 90);
  // custom
  const s = parseLocalDay(customStart);
  const e = parseLocalDay(customEnd);
  e.setHours(23, 59, 59, 999);
  // Guard against inverted range — fall back to a 7-day window.
  if (e.getTime() < s.getTime()) return rangeForWeek(anchor);
  return { start: s, end: e };
}

function formatRangeLabel(view: CalendarView, start: Date, end: Date, anchor: Date): string {
  if (view === "month") {
    return formatMonthYear(anchor);
  }
  if (view === "week") {
    const sameMonth = start.getMonth() === end.getMonth();
    if (sameMonth) {
      return `${formatShortMonth(start)} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${formatLong(start)} – ${formatLong(end)}`;
  }
  return `${formatLong(start)} – ${formatLong(end)}`;
}

function formatLong(d: Date): string {
  return formatLongDate(d);
}

function isoDate(d: Date): string {
  return dayKey(d);
}

function parseLocalDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}
