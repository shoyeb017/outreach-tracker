// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateProductionEnvironment } from "@/lib/config/environment";
import { isUiTestMode } from "@/lib/config/ui-test-mode";

const production = {
  NODE_ENV: "production", VERCEL: "1",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-publishable-fixture",
  NEXT_PUBLIC_APP_URL: "https://autmail.example",
  SUPABASE_SERVICE_ROLE_KEY: "private-server-fixture",
  ADMIN_LOGIN_EMAIL: "admin@example.com",
};
afterEach(() => vi.unstubAllEnvs());
describe("production configuration", () => {
  it("accepts complete deployment configuration without test switches", () => expect(() => validateProductionEnvironment(production)).not.toThrow());
  it.each(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "NEXT_PUBLIC_APP_URL", "SUPABASE_SERVICE_ROLE_KEY"])("rejects missing %s instead of enabling demo mode", (key) => expect(() => validateProductionEnvironment({ ...production, [key]: "" })).toThrow(key));
  it.each(["http://autmail.example", "https://localhost", "https://autmail.example/settings", "https://user:password@autmail.example", "https://autmail.example?token=private"])("rejects unsafe deployment origin %s", (url) => expect(() => validateProductionEnvironment({ ...production, NEXT_PUBLIC_APP_URL: url })).toThrow());
  it("allows a loopback origin for a local production build, not a deployment", () => {
    expect(() => validateProductionEnvironment({ ...production, VERCEL: "", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000" })).not.toThrow();
    expect(() => validateProductionEnvironment({ ...production, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000" })).toThrow();
  });
  it("rejects secrets in the public Supabase key without exposing their values", () => {
    for (const key of ["private-server-fixture", "sb_secret_example", `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`]) {
      try { validateProductionEnvironment({ ...production, NEXT_PUBLIC_SUPABASE_ANON_KEY: key }); throw new Error("Expected rejection"); }
      catch (error) { expect((error as Error).message).toContain("public anon/publishable"); expect((error as Error).message).not.toContain(key); }
    }
  });
  it("never enables internal UI-test mode merely because credentials are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isUiTestMode()).toBe(false);
  });
  it("permits an isolated test build only when explicitly requested without real credentials", () => {
    const testBuild = { NEXT_PUBLIC_AUTMAIL_UI_TEST_MODE: "true", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3107" };
    expect(() => validateProductionEnvironment(testBuild)).not.toThrow();
    expect(() => validateProductionEnvironment({ ...testBuild, VERCEL: "1" })).toThrow("UI-test");
    expect(() => validateProductionEnvironment({ ...testBuild, SUPABASE_SERVICE_ROLE_KEY: "private" })).toThrow("UI-test");
    expect(() => validateProductionEnvironment({ ...testBuild, ADMIN_LOGIN_PASSWORD: "test" })).toThrow("UI-test");
    expect(() => validateProductionEnvironment({ ...testBuild, NEXT_PUBLIC_APP_URL: "https://deployed.example" })).toThrow("isolated");
  });
  it("keeps .env.example credential-free with only deployment essentials", () => {
    const example = readFileSync(".env.example", "utf8");
    const settings = example.split(/\r?\n/).filter((line) => line && !line.startsWith("#"));
    expect(settings).toEqual(["NEXT_PUBLIC_SUPABASE_URL=", "NEXT_PUBLIC_SUPABASE_ANON_KEY=", "NEXT_PUBLIC_APP_URL=", "SUPABASE_SERVICE_ROLE_KEY=", "ADMIN_LOGIN_EMAIL=", "ADMIN_LOGIN_PASSWORD="]);
    expect(example).not.toMatch(/ADMIN_DEV_PASSWORD_HASH|ADMIN_LOCAL_SESSION_SECRET|ADMIN_ENABLE_LOCAL_LOGIN|AUTMAIL_UI_TEST_MODE|localhost/);
  });
  it("supports environment admin passwords without a hash script or extra minimum length", () => {
    expect(() => validateProductionEnvironment({ ...production, ADMIN_LOGIN_PASSWORD: "test" })).not.toThrow();
    expect(() => validateProductionEnvironment({ ...production, ADMIN_LOGIN_EMAIL: "", ADMIN_LOGIN_PASSWORD: "test" })).toThrow("ADMIN_LOGIN_EMAIL");
    expect(() => validateProductionEnvironment({ ...production, ADMIN_LOGIN_PASSWORD: "x".repeat(257) })).toThrow("256");
  });
});
