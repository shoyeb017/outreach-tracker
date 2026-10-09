import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/microsoft/msal", () => ({ acquireGraphToken: vi.fn().mockResolvedValue({ token: "mock-access-token", account: { username: "sender@example.com" } }) }));
import { sendGraphEmail, verifyMicrosoftSender } from "@/lib/microsoft/graph";
import { UncertainSendError } from "@/lib/sending/errors";

describe("Microsoft Graph adapter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never calls Graph when live sending is off", async () => {
    const fetcher = vi.fn();
    const result = await sendGraphEmail({ tenantId: "tenant", clientId: "client", liveEnabled: false, email: { to: "person@example.com", subject: "Hello", htmlBody: "<p>Hello</p>" }, fetcher: fetcher as never });
    expect(result.status).toBe("simulated"); expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts a mocked delegated /me/sendMail request in live mode", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const result = await sendGraphEmail({ tenantId: "tenant", clientId: "client", liveEnabled: true, email: { to: "person@example.com", subject: "Hello", htmlBody: "<p>Hello</p>" }, fetcher: fetcher as never });
    expect(result.status).toBe("sent");
    expect(fetcher).toHaveBeenCalledWith("https://graph.microsoft.com/v1.0/me/sendMail", expect.objectContaining({ method: "POST" }));
    expect(fetcher.mock.calls[0][1].body).toContain("person@example.com");
  });

  it("blocks changed accounts before contacting the provider", async () => {
    const fetcher = vi.fn();
    await expect(sendGraphEmail({ tenantId: "tenant", clientId: "client", liveEnabled: true, expectedAccount: "other@example.com", email: { to: "person@example.com", subject: "Hello", htmlBody: "<p>Hello</p>" }, fetcher })).rejects.toThrow("account changed");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([503, 408])("does not retry uncertain HTTP %s responses", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));
    await expect(sendGraphEmail({ tenantId: "t", clientId: "c", liveEnabled: true, email: { to: "a@example.com", subject: "Hi", htmlBody: "Hello" }, fetcher })).rejects.toBeInstanceOf(UncertainSendError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry a disconnected POST", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Network unavailable"));
    await expect(sendGraphEmail({ tenantId: "t", clientId: "c", liveEnabled: true, email: { to: "a@example.com", subject: "Hi", htmlBody: "Hello" }, fetcher })).rejects.toBeInstanceOf(UncertainSendError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not label an unexpected success response as confirmed acceptance", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(sendGraphEmail({ tenantId: "t", clientId: "c", liveEnabled: true, email: { to: "a@example.com", subject: "Hi", htmlBody: "Hello" }, fetcher })).rejects.toBeInstanceOf(UncertainSendError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("checks the actual mailbox against the review From address", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ mail: "sender@example.com", userPrincipalName: "sender@example.com" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    try { await expect(verifyMicrosoftSender("t", "c", "wrong@example.com")).rejects.toThrow("differs"); await expect(verifyMicrosoftSender("t", "c", "sender@example.com")).resolves.toBe("sender@example.com"); }
    finally { vi.unstubAllGlobals(); }
  });
});
