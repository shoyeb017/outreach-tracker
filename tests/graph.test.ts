import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/microsoft/msal", () => ({ acquireGraphToken: vi.fn().mockResolvedValue({ token: "mock-access-token", account: { username: "sender@example.com" } }) }));
import { sendGraphEmail } from "@/lib/microsoft/graph";

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
});
