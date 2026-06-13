// Desktop (1920×1080) lifecycle walk-through. Captures into
// docs/screenshots/lifecycle/. Run: npm run screenshots:lifecycle
import { test } from "@playwright/test";
import { lifecycleFlow } from "./lifecycle.flow";

test("lifecycle screenshots (desktop)", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await lifecycleFlow(page, "lifecycle");
});
