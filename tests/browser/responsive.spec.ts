import { expect, test } from "@playwright/test";

for (const width of [360, 390, 768, 1024, 1280, 1536]) {
  test(`preview layouts fit at ${width}px`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const route of ["/dashboard", "/datasets", "/datasets/import", "/templates", "/templates/new", "/settings", "/history", "/login", "/register"]) {
      await page.goto(route);
      const headings: Record<string, string> = { "/dashboard": "Your outreach, step by step", "/datasets": "Spreadsheets", "/datasets/import": "New spreadsheet", "/templates": "Template library", "/templates/new": "Create an email template", "/settings": "Settings", "/history": "Email history", "/login": "Welcome back", "/register": "Create your account" };
      await expect(page.getByRole("heading", { level: 1, name: headings[route], exact: true })).toBeVisible();
      if (route !== "/login" && route !== "/register") await expect(page.getByText("UI test workspace", { exact: false })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), route).toBe(true);
      if (route === "/settings") {
        for (const name of ["Signature", "Sending", "My account", "Data & privacy"]) {
          await page.getByRole("tab", { name, exact: true }).click();
          await expect(page.getByRole("tabpanel")).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), name).toBe(true);
        }
      }
      if ((width === 360 || width === 1280) && (route === "/dashboard" || route === "/settings")) await page.screenshot({ path: info.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test("long content and enlarged text remain contained", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/templates/new");
  await page.getByLabel("Name", { exact: true }).fill("LongCompanyNameWithoutSpaces".repeat(8));
  await page.getByLabel("Email subject").fill("A very long introduction for {{company_name}} and {{custom_contact_information}}".repeat(3));
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "Personalization help" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
