import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { chromium, expect } from "@playwright/test";

// Documentation assets only: no credentials, no Graph requests, no real sending.
if (process.env.VERCEL) throw new Error("Capture README images locally, never in a deployment.");
const origin = "http://127.0.0.1:3107";
const directory = resolve("src/styles/readme");
await mkdir(directory, { recursive: true });
await new Promise((accept, reject) => {
  const probe = createServer();
  probe.once("error", () => reject(new Error("Port 3107 is in use. Stop your own UI-test server before capturing images.")));
  probe.listen(3107, "127.0.0.1", () => probe.close(accept));
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3107"], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env, NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE: "true",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "",
    ADMIN_LOGIN_EMAIL: "", ADMIN_LOGIN_PASSWORD: "",
    MICROSOFT_READER_TENANT_ID: "", MICROSOFT_READER_CLIENT_ID: "", MICROSOFT_READER_CLIENT_SECRET: "", MICROSOFT_READABLE_APP_IDS: "",
    NEXT_PUBLIC_APP_URL: origin, NODE_OPTIONS: "--max-old-space-size=256 --max-semi-space-size=4",
  },
});
let serverLog = "";
for (const stream of [server.stdout, server.stderr]) stream.on("data", (data) => { serverLog = (serverLog + data.toString()).slice(-2000); });
let browser;
try {
  const deadline = Date.now() + 45000;
  while (true) {
    if (server.exitCode !== null) throw new Error(`Screenshot server failed to start. Build with npm run build:test-ui first.\n${serverLog}`);
    try { if ((await fetch(`${origin}/dashboard`, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* Server may still be starting. */ }
    if (Date.now() > deadline) throw new Error("Screenshot server did not become ready. Run npm run build:test-ui first.");
    await new Promise((accept) => setTimeout(accept, 250));
  }
  browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  page.on("dialog", (dialog) => dialog.accept());
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    const external = ["http:", "https:"].includes(url.protocol) && url.origin !== origin;
    return external || !["GET", "HEAD"].includes(route.request().method()) ? route.abort() : route.continue();
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function open(path, heading) {
    await page.goto(`${origin}${path}`);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    if (path !== "/") await expect(page.locator('[data-ui-test="workspace"]')).toBeVisible();
    // Hide fixture-only banners in screenshots, not in the app. README discloses sample data.
    await page.addStyleTag({ content: '[data-ui-test="workspace"], [data-readme-fixture-banner] { display: none !important; }' });
    await page.locator('[role="note"]').evaluateAll((notes) => {
      for (const note of notes) if (note.textContent?.startsWith("Design preview — fictional")) note.setAttribute("data-readme-fixture-banner", "");
    });
  }
  async function capture(name) {
    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      await document.fonts.ready;
      await new Promise((accept) => requestAnimationFrame(() => requestAnimationFrame(accept)));
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: resolve(directory, `${name}.png`), animations: "disabled" });
    console.log(`Captured src/styles/readme/${name}.png`);
  }
  await open("/", "Your spreadsheet. The right email.");
  await capture("landing-light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await capture("landing-dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await open("/dashboard", "Your outreach, step by step");
  await capture("dashboard");
  await open("/datasets/import", "New spreadsheet");
  await page.getByLabel("Choose an Excel or CSV file").setInputFiles({
    name: "sample-contacts.csv", mimeType: "text/csv",
    buffer: Buffer.from("Business Name,First Name,Public Email,Industry\nNorthstar Labs,Alex,alex@example.com,Technology & Software\nHarbor Works,Taylor,taylor@example.com,Manufacturing & Industrial\nCedar Health,Jordan,jordan@example.com,Healthcare & Life Sciences\n"),
  });
  await expect(page.getByLabel("Which column contains the email address we should send to?")).toHaveValue("Public Email");
  await capture("spreadsheet-setup");
  await open("/templates/new", "Create an email template");
  await page.getByLabel("Name", { exact: true }).fill("Technology — introduction");
  await page.getByLabel("Email subject").fill("An idea for {{company_name}}");
  await page.getByRole("textbox", { name: "Email message" }).fill("Hi {{first_name}},\n\nWe help teams like {{company_name}} save time with practical automation.\n\nWould you be open to a short introductory call next week?\n\n{{signature}}");
  await capture("template-editor");
  await open("/inbox?preview=1", "Mail");
  await page.getByRole("button", { name: "Unread: A quick question about our next project", exact: true }).click();
  await expect(page.getByTitle("Email content")).toBeVisible();
  await capture("inbox");
  await open("/compose?preview=1", "Compose email");
  const composer = page.getByRole("region", { name: "New email" });
  await composer.getByLabel("To", { exact: true }).fill("alex@example.com");
  await composer.getByLabel("Subject", { exact: true }).fill("A quick introduction");
  await composer.getByRole("textbox", { name: "Email message" }).fill("Hi Alex,\n\nThanks for reaching out. I would be happy to arrange a short introductory call next week.\n\nBest regards,\nTaylor");
  await capture("compose");
  expect(errors).toEqual([]);
  console.log("README images captured using fictional data. No services contacted, no email sent.");
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = new Promise((accept) => server.once("exit", accept));
    server.kill();
    await stopped;
  }
}
