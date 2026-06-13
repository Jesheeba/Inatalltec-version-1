// Mobile (360×640) lifecycle walk-through. Captures into
// docs/screenshots/lifecycle-mobile/. Run: npm run screenshots:mobile
import { test } from "@playwright/test";
import { lifecycleFlow } from "./lifecycle.flow";

test("lifecycle screenshots (mobile)", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await lifecycleFlow(page, "lifecycle-mobile");
});
