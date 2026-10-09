import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SignatureBuilder } from "@/components/signature/signature-builder";
import type { SignatureField } from "@/types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), eq: vi.fn(), insert: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "user" } } }) }, from: () => ({ update: mocks.update, insert: mocks.insert }) }) }));
const first: SignatureField = { id: "first", user_id: "user", label: "", value: "Avery Morgan", field_type: "text", display_order: 0, enabled: true, show_label: false, clickable: false, url: null, style_preference: {} };
const second: SignatureField = { ...first, id: "second", value: "Northstar Labs", display_order: 1 };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.eq.mockResolvedValue({ error: null });
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.single.mockResolvedValue({ data: { ...first, id: "new", value: "" }, error: null });
  mocks.insert.mockReturnValue({ select: () => ({ single: mocks.single }) });
});
afterEach(cleanup);

describe("focused signature block editor", () => {
  it("shows only one editor and preserves edits when selecting another block", () => {
    render(<SignatureBuilder initialFields={[first, second]} />);
    expect(screen.getAllByLabelText("Text to display")).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Signature block list" })).toHaveClass("overflow-y-auto");
    expect(screen.getByRole("heading", { name: "Link behavior", hidden: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Appearance", hidden: true })).toBeInTheDocument();
    expect(screen.getByText("Formatting and links").closest("details")).not.toHaveAttribute("open");
    fireEvent.change(screen.getByLabelText("Text to display"), { target: { value: "Best regards, Avery" } });
    expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit block 2" }));
    expect(screen.getByLabelText("Text to display")).toHaveValue("Northstar Labs");
    fireEvent.click(screen.getByRole("button", { name: "Edit block 1" }));
    expect(screen.getByLabelText("Text to display")).toHaveValue("Best regards, Avery");
    expect(screen.getByRole("status")).toHaveTextContent("Unsaved changes");
  });
  it("saves edited blocks explicitly and keeps failed edits available for retry", async () => {
    render(<SignatureBuilder initialFields={[first]} />);
    fireEvent.change(screen.getByLabelText("Text to display"), { target: { value: "Updated name" } });
    mocks.eq.mockResolvedValueOnce({ error: { message: "Unavailable" } });
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Some blocks were not saved"));
    expect(screen.getByLabelText("Text to display")).toHaveValue("Updated name");
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Signature saved"));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ value: "Updated name" }));
    expect(mocks.eq).toHaveBeenCalledWith("id", "first");
    expect(screen.getByRole("button", { name: "Save signature" })).toBeDisabled();
  });
  it("keeps logo size dynamic and rejects non-HTTPS image URLs", async () => {
    render(<SignatureBuilder initialFields={[{ ...first, field_type: "image", value: "https://example.com/logo.png", label: "Company logo", style_preference: { width: 120 } }]} />);
    fireEvent.change(screen.getByLabelText("Logo width (pixels)"), { target: { value: "240" } });
    expect(screen.getByRole("img", { name: "Company logo" })).toHaveAttribute("width", "240");
    fireEvent.change(screen.getByLabelText("Image URL · alternative to upload"), { target: { value: "http://example.com/logo.png" } });
    fireEvent.click(screen.getByRole("button", { name: "Save signature" }));
    expect(screen.getByRole("status")).toHaveTextContent("Use an HTTPS image URL");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("adds and selects a new block without forcing fixed signature content", async () => {
    render(<SignatureBuilder initialFields={[]} />);
    expect(screen.getByText("Start with a text line or logo")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add text" }));
    await screen.findByLabelText("Text to display");
    expect(screen.getByLabelText("Text to display")).toHaveValue("");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ value: "", field_type: "text", display_order: 0 }));
  });
  it("reorders existing blocks without overwriting their unsaved text", async () => {
    render(<SignatureBuilder initialFields={[first, second]} />);
    fireEvent.change(screen.getByLabelText("Text to display"), { target: { value: "Unsaved Avery" } });
    fireEvent.click(screen.getByRole("button", { name: "Move block 1 down" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Order saved"));
    expect(screen.getByLabelText("Text to display")).toHaveValue("Unsaved Avery");
    expect(mocks.update).toHaveBeenCalledWith({ display_order: 1 });
    expect(screen.getByRole("button", { name: "Save signature" })).toBeEnabled();
  });
});
