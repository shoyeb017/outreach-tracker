// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifySendResponse, digest, pkceChallenge, randomSecret, seal, unseal, validScheduleTime } from "@/lib/scheduling/core";
import { workerAuthorized } from "@/lib/scheduling/worker";
const key = Buffer.alloc(32, 1).toString("base64");
describe("scheduled-mail security and time handling", () => {
  it("encrypts credentials with random IVs and binds them to their owner and purpose", async () => {
    const first = await seal("fixture-refresh-token", key, "owner:refresh");
    expect(first).not.toContain("fixture-refresh-token");
    expect(await unseal(first, key, "owner:refresh")).toBe("fixture-refresh-token");
    expect(await seal("fixture-refresh-token", key, "owner:refresh")).not.toBe(first);
    await expect(unseal(first, key, "other:refresh")).rejects.toThrow();
    await expect(unseal(first, key, "owner:credential")).rejects.toThrow();
    await expect(unseal(first, Buffer.alloc(32, 2).toString("base64"), "owner:refresh")).rejects.toThrow();
    const parts = first.split("."); const ciphertext = Buffer.from(parts[2], "base64"); ciphertext[0] ^= 1; parts[2] = ciphertext.toString("base64");
    await expect(unseal(parts.join("."), key, "owner:refresh")).rejects.toThrow();
  });
  it("rejects a missing or malformed encryption key", async () => { await expect(seal("token", "", "owner")).rejects.toThrow("32-byte"); });
  it("creates URL-safe state and RFC 7636 PKCE challenges", async () => {
    expect(randomSecret()).toMatch(/^[a-zA-Z0-9_-]{43}$/);
    expect(await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(await digest("same")).toBe(await digest("same"));
  });
  it("requires a future bounded schedule and a real timezone", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    expect(validScheduleTime("2026-10-15T06:10:00+06:00", "Asia/Dhaka", now)).toBe("2026-10-15T00:10:00.000Z");
    expect(() => validScheduleTime("2026-10-15T00:01:00Z", "Asia/Dhaka", now)).toThrow("5 minutes");
    expect(() => validScheduleTime("2026-12-15T00:10:00Z", "Asia/Dhaka", now)).toThrow("30 days");
    expect(() => validScheduleTime("2026-10-15T00:10:00Z", "Not/AZone", now)).toThrow("timezone");
  });
  it.each([[202,"accepted"],[429,"retry"],[401,"reconnect"],[403,"failed"],[400,"failed"],[408,"uncertain"],[500,"uncertain"],[503,"uncertain"],[200,"uncertain"]])("classifies HTTP %s without treating ambiguous results as retryable", (status, outcome) => expect(classifySendResponse(Number(status))).toBe(outcome));
  it("protects the worker with a strong private bearer secret, not query parameters", async () => {
    const secret = "test-worker-secret-".repeat(3);
    expect(await workerAuthorized(new Request("https://example.test", { headers: { Authorization: `Bearer ${secret}` } }), secret)).toBe(true);
    expect(await workerAuthorized(new Request(`https://example.test?secret=${secret}`), secret)).toBe(false);
    expect(await workerAuthorized(new Request("https://example.test", { headers: { Authorization: "Bearer wrong" } }), secret)).toBe(false);
    expect(await workerAuthorized(new Request("https://example.test", { headers: { Authorization: "Bearer weak" } }), "weak")).toBe(false);
  });
});
