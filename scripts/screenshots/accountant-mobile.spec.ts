// Mobile (360×640) accountant walk-through. Captures into
// docs/screenshots/accountant-mobile/. Run: npm run screenshots:mobile
import { test } from "@playwright/test";
import { accountantFlow } from "./accountant.flow";

test("accountant screenshots (mobile)", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await accountantFlow(page, "accountant-mobile");
});
