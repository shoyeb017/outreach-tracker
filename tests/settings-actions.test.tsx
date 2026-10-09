import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PasswordSettings } from "@/components/settings/password-settings";
import { TestEmail } from "@/components/microsoft/test-email";
import { UncertainSendError } from "@/lib/sending/errors";

const mocks = vi.hoisted(() => ({ user: vi.fn(), signIn: vi.fn(), update: vi.fn(), verify: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser: mocks.user, signInWithPassword: mocks.signIn, updateUser: mocks.update } }) }));
vi.mock("@/lib/microsoft/graph", () => ({ verifyMicrosoftSender: mocks.verify, sendGraphEmail: mocks.send }));
const integration = { tenant_id: "tenant", client_id: "client", connection_status: "connected", connected_email: "sender@example.com" } as const;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: "user", email: "login@example.com" } }, error: null });
  mocks.signIn.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.verify.mockResolvedValue("sender@example.com");
  mocks.send.mockResolvedValue({ status: "sent" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function passwords(confirm = "new-password") {
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password" } });
  fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
}
describe("account password change", () => {
  it("rejects mismatched passwords before contacting authentication", () => {
    render(<PasswordSettings />); passwords("different-password");
    expect(screen.getByRole("alert")).toHaveTextContent("do not match");
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("verifies the actual login account before updating and clears successful inputs", async () => {
    render(<PasswordSettings />); passwords();
    await screen.findByText("Password changed successfully.");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "login@example.com", password: "old-password" });
    expect(mocks.update).toHaveBeenCalledWith({ password: "new-password" });
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
  });
  it("never updates when current-password verification fails", async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: "Wrong password" } });
    render(<PasswordSettings />); passwords();
    await screen.findByRole("alert");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
describe("explicit real test email", () => {
  it("does not send without a connection or when confirmation is cancelled", () => {
    const view = render(<TestEmail integration={null} />);
    expect(screen.getByRole("button", { name: "Send real test email" })).toBeDisabled();
    view.unmount(); render(<TestEmail integration={integration} />);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Test recipient email"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send real test email" }));
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("verifies the sender and sends only the fixed test message after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TestEmail integration={integration} />);
    fireEvent.change(screen.getByLabelText("Test recipient email"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send real test email" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Microsoft accepted"));
    expect(mocks.verify).toHaveBeenCalledWith("tenant", "client", "sender@example.com");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ liveEnabled: true, expectedAccount: "sender@example.com", email: expect.objectContaining({ to: "test@example.com", saveToSentItems: true, subject: "AUTMAIL — test email" }) }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send.mock.calls[0][0].email.htmlBody).toContain("AUTMAIL - Email Automation System");
    expect(mocks.send.mock.calls[0][0].email.htmlBody).toContain("connected Microsoft mailbox");
    expect(mocks.send.mock.calls[0][0].email.htmlBody).not.toContain("Outreach Tracker");
  });
  it("blocks retries after an uncertain result until Sent Items has been checked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.send.mockRejectedValue(new UncertainSendError());
    render(<TestEmail integration={integration} />);
    fireEvent.change(screen.getByLabelText("Test recipient email"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send real test email" }));
    await screen.findByRole("button", { name: "I have checked Sent Items" });
    expect(screen.getByRole("button", { name: "Send real test email" })).toBeDisabled();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("never sends when the active Microsoft mailbox does not match", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.verify.mockRejectedValue(new Error("Mailbox mismatch"));
    render(<TestEmail integration={integration} />);
    fireEvent.change(screen.getByLabelText("Test recipient email"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send real test email" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Mailbox mismatch"));
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
