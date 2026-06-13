// Desktop (1920×1080) accountant walk-through. Captures into
// docs/screenshots/accountant/. Run: npm run screenshots:accountant
import { test } from "@playwright/test";
import { accountantFlow } from "./accountant.flow";

test("accountant screenshots (desktop)", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await accountantFlow(page, "accountant");
});
