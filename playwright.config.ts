import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3107", ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: {
    command: `node node_modules/next/dist/bin/next ${process.env.PLAYWRIGHT_PRODUCTION === "1" ? "start" : "dev"} --hostname 127.0.0.1 --port 3107`,
    url: "http://127.0.0.1:3107/dashboard",
    timeout: 180_000,
    // Opt in only when manually running the persistence-disabled preview build.
    reuseExistingServer: process.env.PLAYWRIGHT_EXTERNAL_SERVER === "1",
    // Preview-only run: never contact Supabase or send real email.
    env: { VERCEL: "", NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", ADMIN_LOGIN_EMAIL: "", ADMIN_LOGIN_PASSWORD: "", MICROSOFT_READER_TENANT_ID: "", MICROSOFT_READER_CLIENT_ID: "", MICROSOFT_READER_CLIENT_SECRET: "", MICROSOFT_READABLE_APP_IDS: "", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3107", NODE_OPTIONS: "--max-old-space-size=256 --max-semi-space-size=4" },
  },
});
