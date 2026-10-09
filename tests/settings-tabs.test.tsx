import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsTabs, type SettingsSection } from "@/components/settings/settings-tabs";
import type { ReactNode } from "react";
import { SendingSettings } from "@/components/settings/sending-settings";
import { DataPrivacySettings } from "@/components/settings/data-privacy-settings";
import { MicrosoftSettings } from "@/components/microsoft/microsoft-settings";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("@/lib/microsoft/msal", () => ({ acquireGraphToken: vi.fn(), connectMicrosoft: vi.fn(), disconnectMicrosoft: vi.fn() }));

const panels: Record<SettingsSection, ReactNode> = {
  microsoft: <h2>Mailbox connection controls</h2>,
  signature: <label>Example signature line<input /></label>,
  sending: <h2>Practice and sending controls</h2>,
  account: <h2>Workspace identity controls</h2>,
  privacy: <button>Delete example data</button>,
};
function hash(value: string) {
  act(() => { window.history.replaceState(null, "", `/settings${value}`); window.dispatchEvent(new Event("hashchange")); });
}
beforeEach(() => { window.history.replaceState(null, "", "/settings"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("top-tab settings layout", () => {
  it("shows five top tabs and only the email account panel by default", () => {
    render(<SettingsTabs panels={panels} />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tab", { name: "Email account" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Mailbox connection controls" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete example data" })).not.toBeInTheDocument();
  });
  it("changes panels without losing unfinished input", () => {
    render(<SettingsTabs panels={panels} />);
    fireEvent.click(screen.getByRole("tab", { name: "Signature" }));
    fireEvent.change(screen.getByLabelText("Example signature line"), { target: { value: "Best regards, Avery" } });
    fireEvent.click(screen.getByRole("tab", { name: "Sending" }));
    expect(screen.getByRole("heading", { name: "Practice and sending controls" })).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Signature" }));
    expect(screen.getByLabelText("Example signature line")).toHaveValue("Best regards, Avery");
    expect(window.location.hash).toBe("#signature");
  });
  it("opens existing deep links and follows hash navigation", () => {
    hash("#privacy");
    render(<SettingsTabs panels={panels} />);
    expect(screen.getByRole("button", { name: "Delete example data" })).toBeVisible();
    hash("#account");
    expect(screen.getByRole("heading", { name: "Workspace identity controls" })).toBeVisible();
    hash("#unknown");
    expect(screen.getByRole("tab", { name: "Email account" })).toHaveAttribute("aria-selected", "true");
  });
  it("supports arrow keys, Home and End, with linked accessible panels", () => {
    render(<SettingsTabs panels={panels} />);
    const first = screen.getByRole("tab", { name: "Email account" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const signature = screen.getByRole("tab", { name: "Signature" });
    expect(signature).toHaveFocus();
    expect(signature).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", signature.id);
    fireEvent.keyDown(signature, { key: "End" });
    const last = screen.getByRole("tab", { name: "Data & privacy" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Home" });
    expect(first).toHaveFocus();
  });
});

describe("focused settings sections", () => {
  it("shows the connected mailbox without technical setup fields until requested", () => {
    render(<MicrosoftSettings integration={{ configuration_id: "saved", connection_method: "custom", home_account_id: "home", tenant_id: "tenant", client_id: "client", connection_status: "connected", connected_email: "sender@example.com" }} />);
    expect(screen.getAllByText("sender@example.com")[0]).toBeVisible();
    expect(screen.queryByLabelText("Directory / Tenant ID")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit connection setup" }));
    expect(screen.getByLabelText("Directory (Tenant) ID")).toHaveValue("tenant");
    expect(screen.getByText(/Saving configuration resets your connection status/)).toBeInTheDocument();
  });
  it("retains connection setup edits when hiding and reopening setup", () => {
    render(<MicrosoftSettings integration={null} />);
    expect(screen.getByRole("button", { name: "Connect account" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "My own app registration" }));
    fireEvent.change(screen.getByLabelText("Directory (Tenant) ID"), { target: { value: "new-tenant" } });
    fireEvent.click(screen.getByRole("button", { name: "Hide setup" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit connection setup" }));
    expect(screen.getByLabelText("Directory (Tenant) ID")).toHaveValue("new-tenant");
  });
  it("keeps sending speed in advanced settings and requires confirmation to enable real sends", () => {
    render(<SendingSettings preferences={{}} />);
    const mode = screen.getByRole("checkbox", { name: /Send real emails/ });
    expect(mode).not.toBeChecked();
    expect(screen.getByText(/Practice mode: review messages/)).toBeInTheDocument();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(mode);
    expect(confirm).toHaveBeenCalled();
    expect(mode).not.toBeChecked();
    expect(screen.getByLabelText("Emails processed at once").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByLabelText("If the same person gets the same template again")).toHaveValue("block_template_recipient");
  });
  it("separates deletion from blocked recipients and asks before unblocking", () => {
    render(<DataPrivacySettings initialSuppressions={[{ id: "blocked", email: "optout@example.com", reason: "Opted out", notes: null, created_at: "2026-10-08" }]} />);
    expect(screen.getByRole("heading", { name: "Do not email list" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email address to block")).toHaveAttribute("type", "email");
    expect(screen.getByRole("button", { name: "Delete my application data", hidden: true }).closest("details")).not.toHaveAttribute("open");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Unblock optout@example.com" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("optout@example.com"));
    expect(screen.getByText("optout@example.com")).toBeInTheDocument();
  });
});
