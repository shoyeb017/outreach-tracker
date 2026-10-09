import { expect, test } from "@playwright/test";

test("email account flow and optional registration fit desktop and mobile", async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [360, 390, 768, 1024, 1280, 1536]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Connect and test your email account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Administrator setup (recommended)" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Connect account", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Save Configuration", exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 390 || width === 1280) await page.screenshot({ path: info.outputPath(`email-account-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "My own app registration", exact: true }).click();
    await expect(page.getByLabel("Application (Client) ID")).toBeVisible();
    await page.getByLabel("Application (Client) ID").fill("f".repeat(150));
    await page.locator("summary").filter({ hasText: "Advanced · configuration diagnostics" }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 390) {
      await page.screenshot({ path: info.outputPath("email-custom-390.png"), fullPage: true });
      await page.addStyleTag({ content: "html { font-size: 200%; }" });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("hiding the advanced setup retains edits and clearly explains Gmail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/settings");
  await page.getByRole("button", { name: "My own app registration", exact: true }).click();
  await page.getByLabel("Directory (Tenant) ID").fill("saved-draft");
  await page.getByRole("button", { name: "Hide setup", exact: true }).click();
  await page.getByRole("button", { name: "Edit connection setup", exact: true }).click();
  await expect(page.getByLabel("Directory (Tenant) ID")).toHaveValue("saved-draft");
  await page.locator("summary").filter({ hasText: "Can I connect a Gmail account?" }).click();
  await expect(page.getByText("This app sends through Microsoft, not Google.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test connection", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send real test email", exact: true })).toBeDisabled();
});
