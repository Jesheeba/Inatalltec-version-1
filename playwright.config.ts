// ============================================================
// Playwright config — documentation screenshot harness only.
//
// This config drives scripts/screenshots/*.spec.ts, which walk the
// Installtec app and capture organised screenshots into
// docs/screenshots/. It is NOT a functional test suite — the specs are
// best-effort crawlers that try each interaction inside try/catch and
// always fall back to capturing the current page.
//
// Two projects:
//   desktop  → 1920×1080, runs every *.spec.ts EXCEPT *-mobile.spec.ts
//   mobile   → 360×640,   runs only *-mobile.spec.ts
//
// Everything runs HEADED (so you can watch) with 500ms slow-motion.
// Override the dev-server URL with PW_BASE_URL and slow-mo with PW_SLOWMO.
// ============================================================

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./scripts/screenshots",
  // Screenshots are stateful and we want to watch them in order — never
  // parallelise, never retry (a retry would re-shoot over good captures).
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Generous per-test budget: slow-mo (500ms/action) + many steps + a
  // live dev server can be slow on first compile of each route.
  timeout: 20 * 60 * 1000,

  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:3000",
    headless: false,
    launchOptions: {
      slowMo: Number(process.env.PW_SLOWMO ?? 500),
    },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    // We capture screenshots manually via page.screenshot(); disable the
    // automatic on-failure capture to keep docs/screenshots/ clean.
    screenshot: "off",
    video: "off",
    trace: "off",
  },

  projects: [
    {
      name: "desktop",
      testIgnore: /.*-mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "mobile",
      testMatch: /.*-mobile\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 640 },
        // A narrow viewport is all the responsive layout needs; we keep
        // isMobile/hasTouch off so the desktop Chromium build runs cleanly.
      },
    },
  ],
});
