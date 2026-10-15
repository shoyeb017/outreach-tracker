import { expect, test } from "@playwright/test";
import { SCHEDULE_TEST_MESSAGE } from "../../src/lib/scheduling/test-message";

test("scheduled emails remain usable in both themes on phone, tablet and desktop", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const id = "11111111-1111-4111-8111-111111111111";
  const batch = { id, dataset_name: "A spreadsheet name long enough to test wrapping without squeezing the status or actions", dataset_id: id, status: "needs_attention", scheduled_at: "2026-10-15T09:00:00Z", timezone: "Asia/Dhaka", live_enabled: true, sender_email: "sender@example.com", reason: "An email outcome is unknown. Check Microsoft Sent Items before taking further action.", items: [{ status: "uncertain" }, { status: "pending" }] };
  const items = ["uncertain", "pending"].map((status, index) => ({ id: `${id}-${index}`, recipient_email: index ? "pending-recipient-with-a-long-address@example.com" : "unknown@example.com", template_name: "A saved introduction template", subject: "Saved scheduled subject", html_body: "<p>Frozen email preview.</p>", status, attempts: index ? 0 : 1, reason: index ? null : "The worker lost its connection after sending began. Do not resend automatically." }));
  await page.route("**/api/schedules**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/schedules/test") {
      expect(route.request().method()).toBe("GET");
      await route.fulfill({ json: { message: SCHEDULE_TEST_MESSAGE, liveEnabled: true, health: { enabled: true, healthy: true }, connection: { connected: true, senderEmail: "sender@example.com" } } }); return;
    }
    const details = new URL(route.request().url()).pathname === `/api/schedules/${id}`;
    await route.fulfill({ json: details ? { batch, items } : { batches: [batch], total: 1, page: 1, health: { enabled: true, healthy: true, lastTickAt: new Date().toISOString() }, connection: { connected: true, senderEmail: "sender@example.com", microsoftConnected: true, setupReady: true } } });
  });
  for (const theme of ["light", "dark"] as const) {
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/scheduled");
      const desired = page.getByRole("button", { name: `Switch to ${theme} mode` });
      if (await desired.isVisible()) await desired.click();
      else { await page.getByRole("button", { name: `Switch to ${theme === "dark" ? "light" : "dark"} mode` }).click(); await desired.click(); }
      await expect(page.getByRole("heading", { name: "Scheduled emails", exact: true })).toBeVisible();
      await expect(page.getByText("1 pending", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width !== 768) await page.screenshot({ path: info.outputPath(`scheduled-${theme}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Schedule a test email", exact: true }).click();
      const testDialog=page.getByRole("dialog", { name: "Schedule a test email", exact: true });
      await expect(testDialog.getByText(SCHEDULE_TEST_MESSAGE.subject)).toBeVisible();
      await testDialog.getByText("Read dummy message",{exact:true}).click();
      await expect(testDialog.getByText(SCHEDULE_TEST_MESSAGE.text,{exact:true})).toBeVisible();
      await testDialog.getByText("Read dummy message",{exact:true}).click();
      await expect(testDialog.getByRole("button", { name: "Confirm scheduled test email" })).toBeDisabled();
      await testDialog.getByLabel("Test recipient email").fill("test-recipient-with-a-long-address@example.com");
      await testDialog.getByRole("checkbox").check();
      await expect(testDialog.getByRole("button", { name: "Confirm scheduled test email" })).toBeEnabled();
      expect(await testDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if(width!==768) await page.screenshot({ path: info.outputPath(`scheduled-test-${theme}-${width}.png`), fullPage: true });
      await testDialog.getByRole("button",{name:"Cancel",exact:true}).click();
      await page.getByRole("button", { name: "View details" }).click();
      const detail = page.getByRole("dialog", { name: "Schedule details" });
      await expect(detail.getByRole("button", { name: "Choose a new time" })).toBeDisabled();
      await expect(detail.getByText("Outcome unknown", { exact: true })).toBeVisible();
      expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await detail.getByRole("button", { name: "Preview email to unknown@example.com" }).click();
      await expect(page.getByTitle("Saved scheduled email")).toBeVisible();
      await page.getByRole("button", { name: "Close Saved email preview" }).click();
      if (width !== 768) await page.screenshot({ path: info.outputPath(`schedule-details-${theme}-${width}.png`), fullPage: true });
      await detail.getByRole("button", { name: "Close Schedule details" }).click();
    }
  }
  expect(errors).toEqual([]);
});
