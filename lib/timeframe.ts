// ============================================================
// Dashboard timeframe helpers.
//
// Used by ManagerDashboard (and any other dashboard that adds a
// Today / Week / Month / Quarter chip) to convert a user-selected
// chip into a concrete date range, then filter rows that have an
// ISO timestamp.
//
// No date library — vanilla Date. The runtime uses the browser's
// local timezone, which matches what the user expects from "today".
// ============================================================

export type Timeframe = "today" | "week" | "month" | "quarter";

export const TIMEFRAME_KEYS: Timeframe[] = ["today", "week", "month", "quarter"];

// Short tab labels (the chip text).
export const TIMEFRAME_TAB_LABEL: Record<Timeframe, string> = {
  today:   "Today",
  week:    "Week",
  month:   "Month",
  quarter: "Quarter",
};

// Longer labels for KPI subtitles ("AMC revenue · This week").
export const TIMEFRAME_LONG_LABEL: Record<Timeframe, string> = {
  today:   "Today",
  week:    "This week",
  month:   "This month",
  quarter: "This quarter",
};

export interface Period {
  start: Date;
  end: Date;
  label: string;          // long form, e.g. "This week"
  shortLabel: string;     // chip form, e.g. "Week"
  tf: Timeframe;
}

/** Resolve a Timeframe into start / end inclusive Date bounds. */
export function periodFor(tf: Timeframe, now: Date = new Date()): Period {
  const start = new Date(now);
  const end = new Date(now);

  if (tf === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (tf === "week") {
    // Monday-anchored. Date.getDay(): 0 = Sun, 1 = Mon, … 6 = Sat.
    // Shift to "0 = Mon, … 6 = Sun" so subtraction reaches the Monday.
    const dayMonZero = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dayMonZero);
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime() + 6 * 86_400_000);
    end.setHours(23, 59, 59, 999);
  } else if (tf === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    // setMonth(m + 1, 0) lands on the last day of month m.
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    // quarter — Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec.
    const q = Math.floor(start.getMonth() / 3);
    start.setMonth(q * 3, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(q * 3 + 3, 0);
    end.setHours(23, 59, 59, 999);
  }

  return {
    start, end, tf,
    label: TIMEFRAME_LONG_LABEL[tf],
    shortLabel: TIMEFRAME_TAB_LABEL[tf],
  };
}

/** Whole-day count in the period (inclusive). Used for proration. */
export function daysIn(p: Period): number {
  return Math.max(1, Math.round((p.end.getTime() - p.start.getTime()) / 86_400_000));
}

/**
 * Returns true when the given ISO timestamp falls inside the period.
 * Empty / unparseable strings are treated as "not in period".
 */
export function inPeriod(iso: string | undefined | null, p: Period): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= p.start.getTime() && t <= p.end.getTime();
}

/**
 * Returns true when [startIso, endIso] overlaps the period at all.
 * Used by the MyProjects card: "active during this period" rather
 * than "starts/ends in this period" — long-running installs span
 * months and would otherwise vanish from every short window.
 */
export function spansPeriod(startIso: string | undefined | null, endIso: string | undefined | null, p: Period): boolean {
  const s = startIso ? new Date(startIso).getTime() : -Infinity;
  const e = endIso ? new Date(endIso).getTime() : Infinity;
  if (Number.isNaN(s) || Number.isNaN(e)) return false;
  return s <= p.end.getTime() && e >= p.start.getTime();
}
