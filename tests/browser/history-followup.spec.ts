import { expect, test } from "@playwright/test";

test("history selects scheduled recipients and confirms a follow-up responsively without sending", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [], posts: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/history/followup", async route => {
    posts.push(route.request().postData() ?? "");
    await route.fulfill({ json: { id: "followup-sheet", added: 1, omitted: 0 } });
  });
  await page.route("https://graph.microsoft.com/**", route => { errors.push("Unexpected sending request"); return route.abort(); });
  for (const theme of ["light", "dark"] as const) for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/history");
    const desired = page.getByRole("button", { name: `Switch to ${theme} mode` });
    if (await desired.isVisible()) await desired.click();
    else { await page.getByRole("button", { name: `Switch to ${theme === "dark" ? "light" : "dark"} mode` }).click(); await desired.click(); }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByLabel("Sending method").selectOption("scheduled");
    await expect(page.getByText("14 emails found")).toBeVisible();
    const container = width < 768 ? page.getByRole("list", { name: "Email history cards" }) : page.getByRole("table");
    await container.getByRole("checkbox").first().check();
    await expect(page.getByText("1 record selected")).toBeVisible();
    await page.getByRole("button", { name: "Create follow-up spreadsheet" }).click();
    const dialog = page.getByRole("dialog", { name: "Create a follow-up spreadsheet" });
    await expect(dialog.getByRole("button", { name: "Create spreadsheet" })).toBeDisabled();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await dialog.getByLabel(/Create only/).check();
    if (width !== 768) await page.screenshot({ path: info.outputPath(`history-followup-${theme}-${width}.png`), fullPage: true });
    await dialog.getByRole("button", { name: "Create spreadsheet" }).click();
    await expect(page.getByRole("link", { name: "Choose template and review" })).toHaveAttribute("href", "/datasets/followup-sheet?tab=required-setup");
    await expect(page.getByText("0 records selected")).toBeVisible();
  }
  expect(posts).toHaveLength(6);
  expect(errors).toEqual([]);
});
