import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"] as const) {
  for (const width of [360, 768, 1280]) {
    test(`populated history is readable in ${theme} at ${width}px`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/history?demo=1");
      await expect(page.getByRole("note")).toContainText("fictional");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      const region = page.getByRole("region", { name: /Send history table/ });
      if (width < 768) {
        await expect(page.getByRole("list", { name: "Email history cards" })).toBeVisible();
        await expect(region).toBeHidden();
        await page.getByRole("button", { name: "View full email", exact: true }).first().click();
      } else {
        await expect(region).toBeVisible();
        await expect(page.getByRole("table").getByText("international.partnerships.and.operations@example.com")).toBeVisible();
        await expect(page.getByRole("table").getByRole("columnheader")).toHaveCount(5);
        const before = await page.locator(".data-table tbody td").first().evaluate((cell) => getComputedStyle(cell).paddingTop);
        await page.getByRole("button", { name: "Compact" }).click();
        await expect(page.locator(".data-table")).toHaveAttribute("data-density", "compact");
        const after = await page.locator(".data-table tbody td").first().evaluate((cell) => getComputedStyle(cell).paddingTop);
        expect(parseFloat(after)).toBeLessThan(parseFloat(before));
        await page.getByRole("button", { name: "Comfortable" }).click();
        await region.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
        await page.getByRole("button", { name: "View full email to international.partnerships.and.operations@example.com" }).click();
      }
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByRole("dialog")).toContainText("No email was sent.");
      expect(await page.getByRole("dialog").locator(".email-content").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 255, 255)");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      if (width >= 768) await region.evaluate((element) => { element.scrollLeft = 0; });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: info.outputPath(`history-${theme}-${width}.png`), fullPage: true, animations: "disabled" });
      if (width >= 768) await region.screenshot({ path: info.outputPath(`history-table-${theme}-${width}.png`), animations: "disabled" });
      await page.getByLabel("Search history").fill("international.partnerships");
      await expect(page.getByRole("status").filter({ hasText: "1 email found" })).toBeVisible();
    });
  }
}

test("reduced motion removes entrance animation and press scaling", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your spreadsheet.");
  expect(await page.locator(".hero-word").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  const button = page.getByRole("link", { name: "Create your workspace" });
  await button.hover(); await page.mouse.down();
  expect(await button.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await page.mouse.up();
});

for (const width of [390, 1280]) {
  test(`spreadsheet preview wraps long values inside its own scroll region at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/datasets/import");
    // Exercise a control first to ensure hydration before choosing the file.
    await page.getByRole("button", { name: /Switch to .* mode/ }).click();
    const company = "VeryLongInternationalCompanyNameWithoutSpaces".repeat(4);
    await page.getByLabel("Choose an Excel or CSV file").setInputFiles({ name: "layout-preview.csv", mimeType: "text/csv", buffer: Buffer.from(`Business Name,Public Email,Industry\n${company},international.partnerships@example.com,Technology & Software\n`) });
    await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("Public Email");
    await page.getByText("Preview spreadsheet", { exact: true }).click();
    await expect(page.getByRole("table").getByText(company, { exact: true })).toBeVisible();
    const cell = page.getByRole("table").getByText(company, { exact: true });
    expect(await cell.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe("normal");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await page.locator(".table-frame").evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(width < 768);
  });
}
