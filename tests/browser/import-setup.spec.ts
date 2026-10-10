import { expect, test } from "@playwright/test";

// Playwright runs with Supabase disabled. This test never saves data or sends mail.
test("import controls stay clear and responsive in light and dark mode", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
  for (const theme of ["light", "dark"] as const) {
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto("/datasets/import");
      // Wait for hydration using the existing theme control before uploading.
      const desired = page.getByRole("button", { name: `Switch to ${theme} mode` });
      if (await desired.isVisible()) await desired.click();
      else {
        const toggle = page.getByRole("button", { name: `Switch to ${theme === "dark" ? "light" : "dark"} mode` });
        await toggle.click(); await desired.click();
      }
      await expect(page.getByRole("button", { name: "Choose file", exact: true })).toBeVisible();
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Choose file", exact: true }).click();
      await (await chooser).setFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from("Business Name,Public Email,Industry,Subject\nNorthstar Labs,contact@example.com,Technology,Spreadsheet introduction\nHarbor Works,other@example.com,Finance,\n") });
      await expect(page.getByRole("heading", { name: "Recipient emails" })).toBeVisible();
      await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("Public Email");
      await page.getByText("Subject options (optional)", { exact: true }).click();
      const source = page.getByLabel("Subject source");
      await expect(source.locator("option")).toHaveCount(2);
      await expect(page.getByLabel("Spreadsheet subject column")).toHaveCount(0);
      await source.selectOption("spreadsheet_fallback");
      await expect(page.getByLabel("Spreadsheet subject column")).toBeVisible();
      await page.getByLabel("Spreadsheet subject column").selectOption("Subject");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width !== 768) await page.screenshot({ path: info.outputPath(`email-setup-${theme}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("radio", { name: /Different templates by spreadsheet value/ }).check();
      await page.getByLabel("Which column should choose the template?").selectOption("Industry");
      const action = page.getByLabel("Action for Technology");
      await expect(action.locator("option")).toHaveText(["Skip these recipients", "Choose a template", "Use default template"]);
      await action.selectOption("fallback");
      await expect(page.getByLabel("Default template (required)")).toHaveAttribute("required", "");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Choose a default template below" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width !== 768) await page.screenshot({ path: info.outputPath(`template-choices-${theme}-${width}.png`), fullPage: true });
      await action.selectOption("skip");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Personalize your emails" })).toBeVisible();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Save your spreadsheet" })).toBeVisible();
      await expect(page.getByText("Optional: keep the file or reuse this setup", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});
