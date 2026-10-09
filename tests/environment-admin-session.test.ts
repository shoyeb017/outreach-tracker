// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_SECONDS, createEnvironmentAdminSession, validEnvironmentAdminSession, verifyEnvironmentAdminPassword } from "@/lib/admin/environment-session";

beforeEach(() => {
  vi.stubEnv("ADMIN_LOGIN_EMAIL", "admin@example.com");
  vi.stubEnv("ADMIN_LOGIN_PASSWORD", "test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "private-server-unit-test-fixture");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only environment administrator sessions", () => {
  it("checks the exact configured password without an eight-character restriction", () => {
    expect(verifyEnvironmentAdminPassword("test")).toBe(true);
    for (const password of ["", "TEST", " test", "test ", "wrong", "t"]) expect(verifyEnvironmentAdminPassword(password)).toBe(false);
  });
  it("creates unique signed sessions without putting credentials in the cookie", () => {
    const token = createEnvironmentAdminSession(1000);
    expect(validEnvironmentAdminSession(token, 1000)).toBe(true);
    expect(token).not.toBe(createEnvironmentAdminSession(1000));
    const payload = Buffer.from(token.split(".")[0], "base64url").toString("utf8");
    expect(payload).not.toContain("test");
    expect(payload).not.toContain("admin@example.com");
    expect(payload).not.toContain("private-server");
  });
  it("rejects expiration and future-issued sessions", () => {
    const token = createEnvironmentAdminSession(1000);
    expect(validEnvironmentAdminSession(token, 999)).toBe(false);
    expect(validEnvironmentAdminSession(token, 1000 + ADMIN_SESSION_SECONDS * 1000 - 1)).toBe(true);
    expect(validEnvironmentAdminSession(token, 1000 + ADMIN_SESSION_SECONDS * 1000)).toBe(false);
  });
  it("rejects tampered payloads, signatures and malformed cookies", () => {
    const token = createEnvironmentAdminSession(1000);
    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ v: 1, issued: 1000, expires: 9999999999 })).toString("base64url");
    for (const invalid of [undefined, "", "not-a-session", `${forgedPayload}.${signature}`, `${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`, `${token}.extra`, "x".repeat(1025)]) {
      expect(validEnvironmentAdminSession(invalid, 1000)).toBe(false);
    }
  });
  it.each(["ADMIN_LOGIN_PASSWORD", "ADMIN_LOGIN_EMAIL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL"])("invalidates sessions when %s rotates", (name) => {
    const token = createEnvironmentAdminSession(1000);
    vi.stubEnv(name, "replacement-value");
    expect(validEnvironmentAdminSession(token, 1000)).toBe(false);
  });
  it.each(["ADMIN_LOGIN_PASSWORD", "ADMIN_LOGIN_EMAIL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL"])("fails closed when %s is missing", (name) => {
    const token = createEnvironmentAdminSession(1000);
    vi.stubEnv(name, "");
    expect(verifyEnvironmentAdminPassword("test")).toBe(false);
    expect(validEnvironmentAdminSession(token, 1000)).toBe(false);
    expect(() => createEnvironmentAdminSession()).toThrow("incomplete");
  });
});
