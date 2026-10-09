import { expect, test } from "@playwright/test";

test("mail routes explain connection requirements and appear in mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Connect your mailbox first" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Compose email", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "Inbox", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Compose email", exact: true }).click();
  await expect(page).toHaveURL("/compose");
  await expect(page.getByRole("link", { name: "Connect Microsoft email" })).toBeVisible();
});

test("Inbox reading pane and Compose stay responsive in both themes", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/inbox?preview=1");
  await expect(page.getByRole("note")).toContainText("fictional mailbox");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await page.getByRole("button", { name: "Switch to dark mode" }).click();
    for (const width of [360, 390, 768, 1024, 1280, 1536]) {
      await page.setViewportSize({ width, height: 900 });
      if (await page.getByRole("button", { name: "Back to messages" }).isVisible()) await page.getByRole("button", { name: "Back to messages" }).click();
      await page.getByRole("button", { name: "Unread: A quick question about our next project", exact: true }).click();
      await expect(page.getByTitle("Email content")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 390 || width === 1280) await page.screenshot({ path: info.outputPath(`inbox-${theme}-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "Compose email", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New email" });
      await expect(dialog.getByRole("textbox", { name: "Email message" })).toBeVisible();
      await dialog.getByLabel("To", { exact: true }).fill("reader@example.com");
      await dialog.getByLabel("Subject", { exact: true }).fill("My personal email");
      await dialog.getByRole("textbox", { name: "Email message" }).fill("Hello reader, this is a preview.");
      await dialog.getByRole("button", { name: "Add Cc / Bcc" }).click();
      await expect(dialog.getByLabel("Bcc — hidden from other recipients")).toBeVisible();
      await expect(dialog.getByRole("combobox", { name: "Insert placeholder" })).toBeHidden();
      await dialog.getByRole("button", { name: "Review and send", exact: true }).click();
      await expect(dialog.getByTitle("Email send preview")).toBeVisible();
      expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      if (width === 390 || width === 1280) await page.screenshot({ path: info.outputPath(`compose-${theme}-${width}.png`), fullPage: true });
      page.once("dialog", (prompt) => prompt.accept());
      await dialog.getByRole("button", { name: "Close New email" }).click();
      if (width < 768) await page.getByRole("button", { name: "Back to messages" }).click();
    }
  }
  expect(errors).toEqual([]);
});

test("standalone Compose has no Inbox dependency and keeps sending disabled in preview", async ({ page }, info) => {
  await page.goto("/compose?preview=1");
  const dialog = page.getByRole("region", { name: "New email" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Mail folders" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enable mailbox access" })).toHaveCount(0);
  await expect(dialog.getByText("demo@example.com")).toBeVisible();
  await expect(dialog.getByLabel("Cc — visible to all recipients")).toBeVisible();
  await expect(dialog.getByLabel("Bcc — hidden from other recipients")).toBeVisible();
  await dialog.getByLabel("To", { exact: true }).fill("reader@example.com");
  await dialog.getByLabel("Subject", { exact: true }).fill("Preview draft");
  await dialog.getByRole("textbox", { name: "Email message" }).fill("Hello reader");
  for (const theme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: theme as "light" | "dark", reducedMotion: "reduce" });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; document.documentElement.classList.toggle("dark", value === "dark"); }, theme);
    for (const width of [360, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 390 || width === 1280) await page.screenshot({ path: info.outputPath(`standalone-compose-${theme}-${width}.png`), fullPage: true });
    }
  }
  await dialog.getByRole("button", { name: "Review and send", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm — send real email" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Back to editing" }).click();
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Preview draft saved");
  await expect(dialog.getByLabel("Subject", { exact: true })).toHaveValue("");
});

test("Inbox draft saving does not send and saved drafts can be continued", async ({ page }) => {
  await page.goto("/inbox?preview=1");
  await page.getByRole("button", { name: "Compose email", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New email" });
  await dialog.getByLabel("Subject", { exact: true }).fill("Preview draft");
  await dialog.getByRole("button", { name: "Save draft and close" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByRole("button", { name: "Preview draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue draft" })).toBeVisible();
});

test("browser Back warns before discarding unsaved composition", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await page.goto("/inbox?preview=1");
  await page.getByRole("button", { name: "Compose email", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Subject", { exact: true }).fill("Keep this unsaved draft");
  const prompt = page.waitForEvent("dialog");
  await page.evaluate(() => history.back());
  await (await prompt).dismiss();
  await expect(page).toHaveURL(/\/inbox\?preview=1$/);
  await expect(page.getByRole("dialog").getByLabel("Subject", { exact: true })).toHaveValue("Keep this unsaved draft");
});
