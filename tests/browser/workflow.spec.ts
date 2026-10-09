import { expect, test } from "@playwright/test";

test("desktop dashboard explains the next action and actual practice mode", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your outreach, step by step" })).toBeVisible();
  await expect(page.getByText("Practice — no emails will be sent", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Upload spreadsheet" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mobile navigation traps focus, closes with Escape and restores its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => Boolean(document.querySelector("dialog")?.contains(document.activeElement)))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("real CSV import suggests addresses and retains them across Back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/datasets/import");
  // Confirm client event handlers are ready before selecting a file on the SSR form.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByLabel("Choose an Excel or CSV file").setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from("Business Name,Public Email,Industry\nNorthstar Labs,contact@example.com,Technology & Software\nHarbor Works,invalid,Manufacturing & Industrial\n") });
  const column = page.getByLabel("Which column contains the email address we should send to?");
  await expect(column).toHaveValue("Public Email");
  await expect(page.getByText("1 valid", { exact: true })).toBeVisible();
  await expect(page.getByText("1 invalid", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose templates" })).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).last().click();
  await expect(column).toHaveValue("Public Email");
});

test("template editor explains arbitrary fields, shows a sample and keyboard-accessible help", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/templates/new");
  await page.getByLabel("Name", { exact: true }).fill("Client introduction");
  await page.getByLabel("Email subject").fill("Hello {{company_name}} — {{custom_budget}}");
  await expect(page.getByText("{{custom_budget}}", { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sample email preview" })).toBeVisible();
  await page.getByRole("button", { name: "Personalization help" }).click();
  await expect(page.getByRole("dialog", { name: "Personalization fields" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
