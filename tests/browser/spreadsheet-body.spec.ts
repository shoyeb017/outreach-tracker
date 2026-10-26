import { expect, test } from "@playwright/test";

test("spreadsheet-body setup skips templates and stays responsive in both themes", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
  for (const theme of ["light", "dark"] as const) for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/datasets/import");
    const desired = page.getByRole("button", { name: "Switch to " + theme + " mode" });
    if (await desired.isVisible()) await desired.click();
    else { await page.getByRole("button", { name: "Switch to " + (theme === "dark" ? "light" : "dark") + " mode" }).click(); await desired.click(); }
    await page.getByLabel("Choose a spreadsheet file").setInputFiles({
      name: "prepared-emails.csv", mimeType: "text/csv",
      buffer: Buffer.from('Email,Subject,Message,Business Name\nreader@example.com,A personal introduction,"Hello {{business_name}},\n\nA message already written in the spreadsheet.",Northstar Labs\n'),
    });
    await page.getByLabel("Where should the email body come from?").selectOption("spreadsheet");
    await expect(page.getByLabel("Which column contains the email bodies? (required)")).toHaveValue("Message");
    await expect(page.getByLabel("Which column contains the subjects? (required)")).toHaveValue("Subject");
    await page.getByLabel("Add my saved signature").uncheck();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width !== 768) await page.screenshot({ path: info.outputPath("body-setup-" + theme + "-" + width + ".png"), fullPage: true });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Email content", exact: true })).toBeVisible();
    await expect(page.getByText(/Template selection is not needed/)).toBeVisible();
    await expect(page.getByLabel("Email template for everyone")).toHaveCount(0);
    await expect(page.getByText("Not added", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Personalize your emails" })).toBeVisible();
    await page.getByText("Optional placeholder keys", { exact: true }).click();
    await expect(page.getByText("{{business_name}}", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Save your spreadsheet" })).toBeVisible();
    await expect(page.getByText("Not needed — using spreadsheet bodies")).toBeVisible();
    await expect(page.getByText("None required", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // Do not save: this isolated UI check has no database and never sends mail.
    for (let index = 0; index < 3; index++) await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByLabel("Where should the email body come from?").selectOption("template");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose templates", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email template for everyone")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
