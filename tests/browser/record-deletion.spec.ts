import { expect, test } from "@playwright/test";

test("all three record lists support confirmed deletion in both themes without sending", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [], posts: { kind: string; ids: string[]; confirmed: boolean }[] = [];
  const id = "11111111-1111-4111-8111-111111111111", source = "22222222-2222-4222-8222-222222222222";
  let engagementRemoved = false, scheduleRemoved = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/records/delete", async route => {
    const body = route.request().postDataJSON(); posts.push(body);
    if (body.kind === "engagement") engagementRemoved = true;
    if (body.kind === "schedule") scheduleRemoved = true;
    await route.fulfill({ json: { removed: body.ids.length } });
  });
  await page.route("**/api/engagement?**", route => route.fulfill({ json: {
    messages: engagementRemoved ? [] : [{ id, dataset_id: source, dataset_name: "Contacts", template_name: "Introduction", recipient_email: "reader@example.com", subject: "An introduction", status: "accepted", activity_count: 0, suspected_count: 0, first_activity_at: null, last_activity_at: null }],
    page: 1, total: engagementRemoved ? 0 : 1, sources: [{ id: source, name: "Contacts" }], campaigns: [],
  } }));
  await page.route("**/api/schedules?**", route => route.fulfill({ json: {
    batches: scheduleRemoved ? [] : [{ id, dataset_id: source, dataset_name: "Contacts", status: "completed", scheduled_at: "2026-10-19T10:00:00Z", timezone: "Asia/Dhaka", live_enabled: false, items: [{ status: "simulated" }] }],
    total: scheduleRemoved ? 0 : 1, page: 1, health: { enabled: true, healthy: true }, connection: { connected: false, microsoftConnected: false, setupReady: false },
  } }));
  await page.route("https://graph.microsoft.com/**", route => { errors.push("Unexpected Microsoft request"); return route.abort(); });
  for (const theme of ["light", "dark"] as const) for (const width of [360, 1280]) for (const kind of ["history", "engagement", "schedule"] as const) {
    engagementRemoved = false; scheduleRemoved = false;
    await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto(kind === "schedule" ? "/scheduled" : `/${kind}`);
    const toggle = page.getByRole("button", { name: `Switch to ${theme} mode` });
    if (await toggle.isVisible()) await toggle.click();
    else { await page.getByRole("button", { name: `Switch to ${theme === "dark" ? "light" : "dark"} mode` }).click(); await toggle.click(); }
    if (kind === "history") await page.getByLabel("Search history").fill("international.partnerships");
    if (kind === "schedule") await page.getByRole("button", { name: "History", exact: true }).click();
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: kind === "schedule" ? "Delete selected schedules" : "Delete selected", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Confirm deletion" })).toBeDisabled();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (width === 360) await dialog.screenshot({ path: info.outputPath(`${kind}-delete-${theme}-mobile.png`) });
    await dialog.getByRole("checkbox").check(); await dialog.getByRole("button", { name: "Confirm deletion" }).click();
    await expect(dialog).toHaveCount(0);
    if (kind === "history") await expect(page.getByText("0 emails found")).toBeVisible();
    if (kind === "engagement") await expect(page.getByText("No matching engagement messages yet")).toBeVisible();
    if (kind === "schedule") await expect(page.getByText("No scheduled-send history yet")).toBeVisible();
  }
  expect(posts).toHaveLength(12); expect(posts.every(post => post.confirmed && post.ids.length === 1)).toBe(true);
  expect(errors).toEqual([]);
});
