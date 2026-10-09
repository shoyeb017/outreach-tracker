import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/microsoft/msal", () => ({ acquireGraphToken: vi.fn() }));
import { acquireGraphToken } from "@/lib/microsoft/msal";
import { createMailboxClient, safeMailboxUrl } from "@/lib/microsoft/mailbox";
import { UncertainSendError } from "@/lib/sending/errors";
import { parseAddresses, validateComposition, outlookLink } from "@/lib/mail/compose";
import type { MicrosoftIntegration } from "@/types";
const integration = { tenant_id: "tenant", client_id: "client", home_account_id: "saved-account", connected_email: "sender@example.com" } as MicrosoftIntegration;
const composition = { to: "reader@example.com", cc: "", bcc: "", subject: "Hello", html: "<p>Hello</p>", attachments: [] };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(acquireGraphToken).mockResolvedValue({ token: "test-token", account: { homeAccountId: "saved-account" } as never }); });
describe("manual mail validation", () => {
  it("accepts comma and semicolon separated addresses", () => expect(parseAddresses("a@example.com; b@example.com, c@example.com")).toHaveLength(3));
  it.each(["wrong", "a@example.com b@example.com", "Name <a@example.com>", "a@example.com\rBcc:bad@example.com"])("rejects invalid address %s", (to) => expect(() => validateComposition({ ...composition, to })).toThrow());
  it("rejects duplicates across To, Cc and Bcc ignoring case", () => expect(() => validateComposition({ ...composition, bcc: "READER@example.com" })).toThrow("more than once"));
  it("allows incomplete drafts but not empty sends", () => { expect(() => validateComposition({ ...composition, to: "", subject: "" }, false)).not.toThrow(); expect(() => validateComposition({ ...composition, to: "" })).toThrow("recipient"); });
  it("rejects empty body and subject header injection", () => { expect(() => validateComposition({ ...composition, html: "<p>&nbsp;</p>" })).toThrow("message"); expect(() => validateComposition({ ...composition, subject: "Hello\r\nBcc: injected" })).toThrow("one line"); });
  it("caps files and total size", () => expect(() => validateComposition({ ...composition, attachments: [{ name: "large", size: 3 * 1024 * 1024, contentType: "text/plain", contentBytes: "" }] })).toThrow("2 MB"));
  it("only opens exact HTTPS Outlook hosts", () => { expect(outlookLink("https://outlook.office.com/mail/id/test")).toBeTruthy(); expect(outlookLink("https://outlook.office.com.evil.test/mail")).toBeNull(); expect(outlookLink("javascript:alert(1)")).toBeNull(); });
});
describe("Microsoft mailbox boundary", () => {
  it.each(["https://evil.test/v1.0/me/messages", "https://graph.microsoft.com/v1.0/users/other/messages", "https://graph.microsoft.com/beta/me/messages", "https://evil@graph.microsoft.com/v1.0/me/messages"])("rejects unsafe URL %s", (url) => expect(() => safeMailboxUrl(url)).toThrow("unsafe"));
  it("does not open consent popups automatically while listing", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ value: [] })); await createMailboxClient(integration, fetcher).list("inbox");
    expect(acquireGraphToken).toHaveBeenCalledWith("tenant", "client", false, { scopes: ["User.Read", "Mail.Read"], interactive: false });
    expect(fetcher.mock.calls[0][0]).toContain("/me/mailFolders/inbox/messages?"); expect(fetcher.mock.calls[0][0]).toContain("%24top=25");
  });
  it("only enables interactive consent on an explicit enable action", async () => { await createMailboxClient(integration).enable(); expect(acquireGraphToken).toHaveBeenCalledWith("tenant", "client", false, expect.objectContaining({ interactive: true })); });
  it("reads Junk email newest first with existing read permission and follows its pages", async () => {
    const message = { id: "junk-1", subject: "Unexpected offer" };
    const next = "https://graph.microsoft.com/v1.0/me/mailFolders/junkemail/messages?$skip=25";
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ value: [message], "@odata.nextLink": next }))
      .mockResolvedValueOnce(Response.json({ value: [] }))
      .mockResolvedValueOnce(Response.json({ ...message, body: { contentType: "HTML", content: "<p>Offer</p>" } }));
    const client = createMailboxClient(integration, fetcher);
    const page = await client.list("junkemail");
    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1.0/me/mailFolders/junkemail/messages");
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime desc");
    expect(page).toEqual({ messages: [message], next });
    await client.list("junkemail", page.next);
    expect(fetcher.mock.calls[1][0]).toBe(next);
    expect((await client.get(message.id)).body?.content).toBe("<p>Offer</p>");
    for (const call of vi.mocked(acquireGraphToken).mock.calls) expect(call[3]).toEqual({ scopes: ["User.Read", "Mail.Read"], interactive: false });
  });
  it("orders drafts by their latest edit and Sent by sending time", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ value: [] })); const client = createMailboxClient(integration, fetcher);
    await client.list("drafts"); await client.list("sentitems");
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get("$orderby")).toBe("lastModifiedDateTime desc");
    expect(new URL(fetcher.mock.calls[1][0]).searchParams.get("$orderby")).toBe("sentDateTime desc");
  });
  it("rejects account changes before issuing requests", async () => { vi.mocked(acquireGraphToken).mockResolvedValue({ token: "other", account: { homeAccountId: "different" } as never }); const fetcher = vi.fn(); await expect(createMailboxClient(integration, fetcher).list("inbox")).rejects.toThrow("changed"); expect(fetcher).not.toHaveBeenCalled(); });
  it("follows Graph pagination without leaking tokens to another origin", async () => {
    const next = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$skip=29"; const fetcher = vi.fn().mockResolvedValue(Response.json({ value: [], "@odata.nextLink": next }));
    expect((await createMailboxClient(integration, fetcher).list("inbox")).next).toBe(next);
    fetcher.mockResolvedValue(Response.json({ value: [], "@odata.nextLink": "https://evil.test" })); await expect(createMailboxClient(integration, fetcher).list("inbox")).rejects.toThrow("unsafe");
  });
  it("creates a draft with To, Cc, Bcc without sending", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "draft-id" })); await createMailboxClient(integration, fetcher).save({ ...composition, cc: "cc@example.com", bcc: "bcc@example.com" });
    expect(fetcher.mock.calls[0][0]).toBe("https://graph.microsoft.com/v1.0/me/messages"); const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.bccRecipients[0].emailAddress.address).toBe("bcc@example.com"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("encodes message IDs and uses native threaded reply", async () => { const fetcher = vi.fn().mockResolvedValue(Response.json({ id: "reply-draft" })); await createMailboxClient(integration, fetcher).startReply("id/+?", true); expect(fetcher.mock.calls[0][0]).toContain("id%2F%2B%3F/createReplyAll"); });
  it("checks the From mailbox before sending the saved draft", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mail: "sender@example.com" })).mockResolvedValueOnce(new Response(null, { status: 202 }));
    await createMailboxClient(integration, fetcher).send("draft-id", composition); expect(fetcher.mock.calls[1][0]).toContain("/draft-id/send");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("blocks a mismatched mailbox without sending", async () => { const fetcher = vi.fn().mockResolvedValue(Response.json({ mail: "wrong@example.com" })); await expect(createMailboxClient(integration, fetcher).send("draft-id", composition)).rejects.toThrow("From address"); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("sends a new email directly with Mail.Send and no draft or read access", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mail: "sender@example.com" })).mockResolvedValueOnce(new Response(null, { status: 202 }));
    await createMailboxClient(integration, fetcher).sendNew({ ...composition, cc: "cc@example.com", bcc: "bcc@example.com", attachments: [{ name: "hello.txt", size: 5, contentType: "text/plain", contentBytes: "aGVsbG8=" }] });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", "https://graph.microsoft.com/v1.0/me/sendMail"]);
    const payload = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(payload.saveToSentItems).toBe(true);
    expect(payload.message.toRecipients[0].emailAddress.address).toBe("reader@example.com");
    expect(payload.message.ccRecipients[0].emailAddress.address).toBe("cc@example.com");
    expect(payload.message.bccRecipients[0].emailAddress.address).toBe("bcc@example.com");
    expect(payload.message.attachments[0].contentBytes).toBe("aGVsbG8=");
    for (const call of vi.mocked(acquireGraphToken).mock.calls) expect(call[3]).toEqual({ scopes: ["User.Read", "Mail.Send"], interactive: true });
  });
  it("only requests write permission when an explicit mailbox change is made", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ id: "draft" }));
    const client = createMailboxClient(integration, fetcher);
    await client.markRead("message", true); await client.save(composition); await client.startReply("message"); await client.startForward("message");
    for (const call of vi.mocked(acquireGraphToken).mock.calls) expect(call[3]).toEqual({ scopes: ["User.Read", "Mail.ReadWrite"], interactive: true });
  });
  it("explains denied reading without asking for sending or writing", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(createMailboxClient(integration, fetcher).list("inbox")).rejects.toThrow("delegated Mail.Read.");
  });
  it("never retries an uncertain direct-send result", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mail: "sender@example.com" })).mockRejectedValueOnce(new Error("timeout"));
    await expect(createMailboxClient(integration, fetcher).sendNew(composition)).rejects.toBeInstanceOf(UncertainSendError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([503, 408])("never retries an uncertain %s send", async (status) => { const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mail: "sender@example.com" })).mockResolvedValueOnce(new Response(null, { status })); await expect(createMailboxClient(integration, fetcher).send("draft-id", composition)).rejects.toBeInstanceOf(UncertainSendError); expect(fetcher).toHaveBeenCalledTimes(2); });
  it("does not automatically retry transport failure or throttling", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ mail: "sender@example.com" })).mockRejectedValueOnce(new Error("network")); await expect(createMailboxClient(integration, fetcher).send("draft-id", composition)).rejects.toBeInstanceOf(UncertainSendError); expect(fetcher).toHaveBeenCalledTimes(2);
    const throttled = vi.fn().mockResolvedValue(new Response(null, { status: 429 })); await expect(createMailboxClient(integration, throttled).list("inbox")).rejects.toThrow("limiting"); expect(throttled).toHaveBeenCalledTimes(1);
  });
});
