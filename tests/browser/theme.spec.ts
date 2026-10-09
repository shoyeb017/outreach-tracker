import { expect, test } from "@playwright/test";

test("dark and light modes persist across navigation and reload", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.goto("/settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("settings-dark-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("dark screens wrap at mobile and desktop widths", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: "dark" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const headings: Record<string, string> = { "/": "Your spreadsheet.The right email.", "/login": "Welcome back", "/dashboard": "Your outreach, step by step", "/datasets/import": "New spreadsheet", "/templates/new": "Create an email template", "/settings": "Settings", "/help/default-connection": "Connect using the default configuration" };
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ["/", "/login", "/dashboard", "/datasets/import", "/templates/new", "/settings", "/help/default-connection"]) {
      await page.goto(route);
      if (route === "/") await expect(page.getByRole("heading", { level: 1 })).toContainText("Your spreadsheet.");
      else await expect(page.getByRole("heading", { level: 1, name: headings[route] })).toBeVisible();
      await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
      if (route === "/dashboard" && width === 1280) {
        expect(await page.getByRole("heading", { level: 1 }).evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(30);
        expect(await page.locator(".surface-card").first().evaluate((element) => parseFloat(getComputedStyle(element).borderRadius))).toBeLessThanOrEqual(12);
        expect(await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(9, 9, 11)");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} at ${width}`).toBe(true);
      if (width === 1280 && ["/", "/dashboard", "/settings"].includes(route)) await page.screenshot({ path: info.outputPath(`${route.replaceAll("/", "") || "home"}-dark.png`), fullPage: true, animations: "disabled" });
    }
  }
  expect(errors).toEqual([]);
});
