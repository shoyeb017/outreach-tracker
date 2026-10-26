import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

test("multi-sheet upload asks for a worksheet, keeps data separate and names the import in both themes", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("dialog", dialog => dialog.type() === "beforeunload" ? dialog.accept() : dialog.dismiss());
  for (const theme of ["light", "dark"] as const) for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/datasets/import");
    const desired = page.getByRole("button", { name: `Switch to ${theme} mode` });
    if (await desired.isVisible()) await desired.click();
    else { await page.getByRole("button", { name: `Switch to ${theme === "dark" ? "light" : "dark"} mode` }).click(); await desired.click(); }
    const format = width === 768 ? "ods" : "xlsx";
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Empty summary");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ "Business Name": "Northstar Labs", "Public Email": "recipient@example.com" }]), "Accounting firms");
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ Location: "Dhaka", "Different Contact": "other@example.com" }]), "Other contacts");
    await page.getByLabel("Choose a spreadsheet file").setInputFiles({ name: `Virginia contacts.${format}`, mimeType: "application/octet-stream", buffer: XLSX.write(book, { type: "buffer", bookType: format }) });
    await expect(page.getByRole("heading", { name: "Choose the worksheet to import" })).toBeVisible();
    await expect(page.getByLabel("Worksheet", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: /Use this worksheet/ })).toBeDisabled();
    await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width !== 768) await page.screenshot({ path: info.outputPath(`worksheet-picker-${theme}-${width}.png`), fullPage: true });
    await page.getByLabel("Worksheet", { exact: true }).selectOption("Accounting firms");
    await page.getByRole("button", { name: /Use this worksheet/ }).click();
    await expect(page.getByText(/Worksheet: Accounting firms/)).toBeVisible();
    await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("Public Email");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.getByLabel("Email template for everyone").selectOption("11111111-1111-4111-8111-111111111111");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Spreadsheet column for company_name")).toHaveValue("Business Name");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Spreadsheet name")).toHaveValue("Virginia contacts — Accounting firms");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByLabel("Worksheet", { exact: true }).selectOption("Other contacts");
    await page.getByRole("button", { name: /Use this worksheet/ }).click();
    await expect(page.getByText(/Worksheet: Other contacts/)).toBeVisible();
    await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("");
    await expect(page.getByRole("option", { name: "Public Email", exact: true })).toHaveCount(0);
  }
  await page.goto("/datasets/import");
  await page.getByLabel("Choose a spreadsheet file").setInputFiles({ name: "unicode-contacts.csv", mimeType: "text/csv", buffer: Buffer.from('Business Name,Public Email,Code\n"München, ঢাকা",recipient@example.com,00123\n', "utf8") });
  await expect(page.getByRole("heading", { name: "Recipient emails" })).toBeVisible();
  await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("Public Email");
  await page.getByText("Preview spreadsheet", { exact: true }).click();
  await expect(page.getByRole("cell", { name: "München, ঢাকা", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "00123", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
