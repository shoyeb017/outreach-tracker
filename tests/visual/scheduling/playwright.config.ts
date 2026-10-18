import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
const root = path.resolve(__dirname, "../../..");
export default defineConfig({
  testDir: path.join(root, "tests/browser"), testMatch: ["scheduled-mail.spec.ts", "engagement.spec.ts", "history-followup.spec.ts", "record-deletion.spec.ts"],
  outputDir: path.join(root, "test-results"), workers: 1,
  use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3110", screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { cwd: root, command: "node node_modules/vite/bin/vite.js --config tests/visual/scheduling/vite.config.mjs", url: "http://127.0.0.1:3110", timeout: 60000, reuseExistingServer: process.env.PLAYWRIGHT_SCHEDULING_EXTERNAL_SERVER === "1",
    env: { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "", SCHEDULE_ENCRYPTION_KEY: "", SCHEDULE_WORKER_SECRET: "", MICROSOFT_SCHEDULER_CLIENT_SECRET: "", NODE_OPTIONS: "--max-old-space-size=512 --max-semi-space-size=8" } },
});
