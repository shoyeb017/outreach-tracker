import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) for (const width of [360, 768, 1280]) {
  test(`compact dashboard animation: ${theme}, ${width}px`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(theme => localStorage.setItem("outreach-theme", theme), theme);
    await page.goto("/dashboard");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const hero = page.locator('[data-dashboard-hero="outreach"]');
    await expect(hero.getByRole("heading", { name: "Your outreach, step by step" })).toBeVisible();
    await expect(hero.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state", /running|fallback/);
    const art = hero.locator("[data-tubes-background]");
    await expect(art).toHaveAttribute("aria-hidden", "true");
    const bounds = (await art.boundingBox())!;
    const heroBounds = (await hero.boundingBox())!;
    expect(Math.abs(bounds.width - (heroBounds.width - 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - (heroBounds.height - 2))).toBeLessThanOrEqual(1);
    expect(bounds.height).toBeLessThanOrEqual(320);
    expect(await art.evaluate(element => getComputedStyle(element).position)).toBe("absolute");
    expect(await hero.getByRole("heading").evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const top = document.elementFromPoint(bounds.left + 4, bounds.top + 4);
      return top === element || element.contains(top);
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`dashboard-${theme}-${width}.png`), fullPage: true });
    await hero.getByRole("link", { name: "Upload spreadsheet" }).click();
    await expect(page).toHaveURL(/\/datasets\/import$/);
    expect(errors).toEqual([]);
  });
}

test("dashboard respects reduced motion and enlarged text", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto("/dashboard");
  const hero = page.locator("[data-dashboard-hero]");
  await expect(hero.locator(".blue-tubes-layer")).toHaveAttribute("data-animation-state", "reduced");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(hero.getByRole("link", { name: "Upload spreadsheet" })).toBeVisible();
  await expect(hero.locator("[data-tubes-background] canvas")).not.toHaveClass(/is-ready/);
});
