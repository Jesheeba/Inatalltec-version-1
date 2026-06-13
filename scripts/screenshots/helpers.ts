// ============================================================
// Shared helpers for the documentation screenshot harness.
//
// These wrap Playwright in forgiving, "best-effort" primitives: every
// click/fill is allowed to fail without aborting the run, and the shot()
// factory writes numbered PNGs into docs/screenshots/<folder>/.
//
// Selector strategy:
//   • Top-level navigation is done by URL (page.goto) — robust regardless
//     of role-gated sidebar items.
//   • In-page actions target VISIBLE TEXT via getByRole('button',{name})
//     and getByText, which survive styling/markup changes.
//   • Form fields use the app's <div class="field"><label
//     class="field-label">…</label><input/></div> pattern (labels are not
//     htmlFor-associated, so getByLabel does not work — we locate the
//     .field by its label text, then the input within it).
// ============================================================

import type { Page, Locator } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

export const SCREENSHOT_ROOT = path.join(process.cwd(), "docs", "screenshots");

// ── Accounts ───────────────────────────────────────────────
// Only the super-admin login is confirmed. Manager / accountant logins
// are unknown, so they fall back to the super-admin (which has full
// access at the DB level) UNLESS you provide real credentials via env:
//
//   PW_MANAGER_EMAIL / PW_MANAGER_PASSWORD
//   PW_ACCOUNTANT_EMAIL / PW_ACCOUNTANT_PASSWORD
//
// Setting the proper role accounts gives more accurate, role-specific UI.
const SUPERADMIN = {
  email: process.env.PW_SUPERADMIN_EMAIL || "superadmin@sirahdigital.in",
  password: process.env.PW_SUPERADMIN_PASSWORD || "Sirahdigital@2025",
};

export const ACCOUNTS = {
  superadmin: { ...SUPERADMIN, label: "Super Admin" },
  manager: {
    email: process.env.PW_MANAGER_EMAIL || SUPERADMIN.email,
    password: process.env.PW_MANAGER_PASSWORD || SUPERADMIN.password,
    label: process.env.PW_MANAGER_EMAIL ? "Operations Manager" : "Super Admin (manager fallback)",
  },
  accountant: {
    email: process.env.PW_ACCOUNTANT_EMAIL || SUPERADMIN.email,
    password: process.env.PW_ACCOUNTANT_PASSWORD || SUPERADMIN.password,
    label: process.env.PW_ACCOUNTANT_EMAIL ? "Accountant" : "Super Admin (accountant fallback)",
  },
};

export type Account = { email: string; password: string; label: string };

// ── Screenshot factory ─────────────────────────────────────
// Returns a shot() bound to one folder with an auto-incrementing
// 2-digit prefix so files sort correctly (01_, 02_, …).
export function makeShot(page: Page, folder: string) {
  const dir = path.join(SCREENSHOT_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;

  return async function shot(
    name: string,
    opts: { fullPage?: boolean; settle?: number; target?: Page } = {}
  ): Promise<void> {
    n += 1;
    const prefix = String(n).padStart(2, "0");
    const file = path.join(dir, `${prefix}_${name}.png`);
    const target = opts.target ?? page;
    try {
      // networkidle can never settle if a realtime socket stays chatty —
      // bound it and move on.
      await target.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      await target.waitForTimeout(opts.settle ?? 1000);
      await target.screenshot({ path: file, fullPage: opts.fullPage ?? true });
      console.log(`  📸  ${folder}/${prefix}_${name}.png`);
    } catch (e) {
      console.log(`  ⚠️   could not capture ${name}: ${(e as Error).message}`);
    }
  };
}

export type Shot = ReturnType<typeof makeShot>;

// ── Section wrapper ────────────────────────────────────────
// Isolates each documentation section so a failure in one doesn't abort
// the rest of the run.
export async function section(label: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n▶  ${label}`);
  try {
    await fn();
  } catch (e) {
    console.log(`  ⚠️   section "${label}" stopped early: ${(e as Error).message}`);
  }
}

// ── Login ──────────────────────────────────────────────────
// Opens /login (optionally screenshotting the empty form first), signs
// in, and waits until we leave /login. Neutralises window.print() across
// the whole context first, so any "Print" button (monthly statement,
// payslip, invoice PDF) cannot pop a blocking OS dialog mid-run.
export async function signIn(
  page: Page,
  account: Account,
  shot: Shot,
  opts: { loginShot?: string } = {}
): Promise<void> {
  await page.context().addInitScript(() => {
    try {
      // @ts-expect-error overriding for headless-safety
      window.print = () => {};
    } catch {
      /* ignore */
    }
  });

  console.log(`  ·   signing in as ${account.label} <${account.email}>`);
  await page.goto("/login");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (opts.loginShot) await shot(opts.loginShot, { fullPage: false });

  await page.locator('input[type="email"]').first().fill(account.email);
  await page.locator('input[type="password"]').first().fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page
    .waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 })
    .catch(() => console.log("  ⚠️   still on /login after submit — check credentials / dev server"));
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
}

// ── Forgiving interactions ─────────────────────────────────

// Click a button (or any element) by its visible text. Returns whether
// it was found+clicked. Never throws.
export async function clickByText(
  page: Page,
  name: string | RegExp,
  opts: { timeout?: number } = {}
): Promise<boolean> {
  const timeout = opts.timeout ?? 4000;
  try {
    const btn = page.getByRole("button", { name }).first();
    await btn.waitFor({ state: "visible", timeout });
    await btn.click();
    return true;
  } catch {
    /* fall through to text */
  }
  try {
    const el = page.getByText(name, { exact: false }).first();
    await el.waitFor({ state: "visible", timeout: 1500 });
    await el.click();
    return true;
  } catch {
    console.log(`  ·   "${name}" not present — skipped`);
    return false;
  }
}

// Click an in-page tab/sub-tab by exact label, falling back to substring.
export async function clickTab(page: Page, label: string): Promise<boolean> {
  for (const opts of [{ exact: true }, { exact: false }]) {
    try {
      const t = page.getByRole("button", { name: label, ...opts }).first();
      await t.waitFor({ state: "visible", timeout: 4000 });
      await t.click();
      return true;
    } catch {
      /* try next */
    }
  }
  try {
    await page.getByText(label, { exact: false }).first().click({ timeout: 2000 });
    return true;
  } catch {
    console.log(`  ·   tab "${label}" not present — skipped`);
    return false;
  }
}

// Locate a form input by the app's .field/.field-label markup.
export function fieldInput(scope: Page | Locator, label: string): Locator {
  const q = JSON.stringify(label);
  return scope
    .locator(`div.field:has(label.field-label:has-text(${q})) :is(input, textarea)`)
    .first();
}

// Fill such a field; never throws.
export async function fillField(scope: Page | Locator, label: string, value: string): Promise<void> {
  try {
    await fieldInput(scope, label).fill(value, { timeout: 4000 });
  } catch {
    console.log(`  ·   field "${label}" not fillable — skipped`);
  }
}

// Open a modal/dialog via its trigger text, screenshot it, then close
// with Escape. Returns whether the trigger fired.
export async function captureModal(
  page: Page,
  shot: Shot,
  trigger: string | RegExp,
  screenName: string
): Promise<boolean> {
  const opened = await clickByText(page, trigger);
  if (!opened) return false;
  await page.waitForTimeout(800);
  await shot(screenName, { fullPage: false });
  // Close cleanly so the next interaction starts from a known state.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
  return true;
}

// ── Project discovery ──────────────────────────────────────
// Many lifecycle screenshots need a real project id. Open /projects,
// click the first project card, read the id out of the URL.
export async function getAnyProjectId(page: Page): Promise<string | null> {
  await page.goto("/projects");
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const card = page.locator(".card-hover").first();
  if ((await card.count()) === 0) return null;
  await card.click().catch(() => {});
  await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 8000 }).catch(() => {});
  const m = page.url().match(/\/projects\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Navigate to one of a project's phase pages and screenshot it. The page
// renders (often in a locked/empty state) regardless of the project's
// actual phase, which is exactly what we want for documentation.
export async function capturePhasePage(
  page: Page,
  shot: Shot,
  projectId: string,
  slug: string,
  screenName: string
): Promise<void> {
  await page.goto(`/projects/${projectId}/${slug}`);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await shot(screenName);
}
