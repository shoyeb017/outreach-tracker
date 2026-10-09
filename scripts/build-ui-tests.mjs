import { spawnSync } from "node:child_process";

if (process.env.VERCEL) {
  console.error("UI-test builds cannot be used for Vercel deployments. Use npm run build.");
  process.exit(1);
}

// Pass explicit empty values through Node: Windows PowerShell removes empty env vars.
// This build is for isolated browser tests, never for deployment.
const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE: "true",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    ADMIN_LOGIN_EMAIL: "",
    ADMIN_LOGIN_PASSWORD: "",
    MICROSOFT_READER_TENANT_ID: "",
    MICROSOFT_READER_CLIENT_ID: "",
    MICROSOFT_READER_CLIENT_SECRET: "",
    MICROSOFT_READABLE_APP_IDS: "",
    NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3107",
    NODE_OPTIONS: "--max-old-space-size=512 --max-semi-space-size=8",
  },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
