// ============================================================
// Installtec OS - Money & date formatting
// One utility per concern. Components MUST NOT format money or
// dates inline (v6 master prompt PART 20.14). Every render of a
// monetary value goes through formatCurrency(amount, org).
// ============================================================

import type { Organization } from "./types";

export interface CurrencyOptions {
  // Compact mode (e.g. "AED 1.84M") - used in KPI tiles where space matters
  compact?: boolean;
  // Strip decimal places (e.g. "AED 1,234" vs "AED 1,234.56")
  whole?: boolean;
}

export function formatCurrency(amount: number | null | undefined, org: Organization | null, opts: CurrencyOptions = {}): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "-";

  const symbol = org?.currency_symbol ?? "AED";
  const position = org?.currency_position ?? "before";
  const decSep = org?.decimal_separator ?? ".";
  const thouSep = org?.thousand_separator ?? ",";
  const decPlaces = org?.decimal_places ?? 2;

  let value = amount;
  let suffix = "";
  if (opts.compact) {
    if (Math.abs(value) >= 1_000_000) { value = value / 1_000_000; suffix = "M"; }
    else if (Math.abs(value) >= 1_000) { value = value / 1_000; suffix = "K"; }
  }

  const places = opts.compact || opts.whole ? (suffix ? (Math.abs(value) < 10 ? 2 : 0) : 0) : decPlaces;
  const fixed = value.toFixed(places);
  const [intPart, fracPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep);
  const number = fracPart ? `${withThousands}${decSep}${fracPart}` : withThousands;
  const body = `${number}${suffix}`;

  return position === "after" ? `${body} ${symbol}` : `${symbol} ${body}`;
}

// Returns just the symbol - useful for form field suffixes.
export function currencySymbol(org: Organization | null): string {
  return org?.currency_symbol ?? "AED";
}
