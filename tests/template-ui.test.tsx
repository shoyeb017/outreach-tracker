import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TemplateLibrary, type TemplateListItem } from "@/components/templates/template-library";
import { TemplateForm } from "@/components/templates/template-form";
import type { EmailTemplate } from "@/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ getSupabaseBrowserClient: vi.fn() }));
vi.mock("@/components/editor/rich-email-editor", () => ({ RichEmailEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => <textarea aria-label="Message editor" value={value} onChange={(event) => onChange(event.target.value)} /> }));
vi.mock("@/components/ui/dialog", () => ({ Dialog: ({ title, children }: { title: string; children: React.ReactNode }) => <div role="dialog" aria-label={title}>{children}</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const templates: TemplateListItem[] = [
  { id: "one", name: "Technology introduction", description: "For software companies", category: "Technology", is_system: true, is_active: true, is_archived: false, updated_at: "2026-10-08", subject_template: "Hi {{company_name}}", html_body: "<p>Hello {{first_name}}</p><script>alert(1)</script>", template_versions: [] },
  { id: "two", name: "My follow-up", description: null, category: "General", is_system: false, is_active: true, is_archived: false, updated_at: "2026-10-07", subject_template: "Following up", template_versions: [] },
  { id: "old", name: "Old email", description: null, category: "General", is_system: false, is_active: false, is_archived: true, updated_at: "2026-10-06", template_versions: [] },
];
const template: EmailTemplate = { ...templates[1], user_id: "user", created_at: "2026-10-07", subject_template: "Hi {{company_name}}", html_body: "<p>Hello {{decision_maker}}</p>", plain_text_body: null, signature_behavior: "none" };

describe("template library", () => {
  it("hides archived templates until the user chooses Archived", () => {
    render(<TemplateLibrary templates={templates} />);
    expect(screen.queryByRole("heading", { name: "Old email" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Archived/ }));
    expect(screen.getByRole("heading", { name: "Old email" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "My follow-up" })).not.toBeInTheDocument();
  });
  it("searches subjects, filters categories, and recovers from no matches", () => {
    render(<TemplateLibrary templates={templates} />);
    fireEvent.change(screen.getByLabelText("Search templates"), { target: { value: "Following" } });
    expect(screen.getByRole("heading", { name: "My follow-up" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Template category"), { target: { value: "Technology" } });
    expect(screen.getByRole("heading", { name: "No templates match these choices" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("heading", { name: "Technology introduction" })).toBeInTheDocument();
  });
  it("shows a sanitized quick preview without sending an email", () => {
    render(<TemplateLibrary templates={[templates[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Preview email" }));
    const preview = screen.getByRole("dialog", { name: "Technology introduction" });
    expect(within(preview).getByText("Hello {{first_name}}")).toBeInTheDocument();
    expect(preview.querySelector("script")).toBeNull();
    expect(within(preview).getByRole("link", { name: "Make a copy" })).toHaveAttribute("href", "/templates/one?duplicate=1");
  });
});

describe("template editor", () => {
  it("preserves archive status when saving an edited archived template", async () => {
    const update = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user" } } }) }, from: vi.fn(() => ({ update })) } as unknown as ReturnType<typeof getSupabaseBrowserClient>);
    render(<TemplateForm template={{ ...template, is_archived: true }} />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated archived message" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(expect.objectContaining({ is_archived: true, name: "Updated archived message" })));
  });
  it("shows a live preview from the start and resolves custom sample fields", () => {
    render(<TemplateForm template={template} />);
    expect(screen.getByRole("heading", { name: "Sample email preview" })).toBeInTheDocument();
    expect(screen.getByText("Hello Example value")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Email subject"), { target: { value: "Welcome {{company_name}}" } });
    expect(screen.getByText("Welcome Northstar Labs")).toBeInTheDocument();
    expect(screen.getByText("More settings").closest("details")).not.toHaveAttribute("open");
  });
  it("adds a custom field and detects it without duplicating its token", () => {
    render(<TemplateForm template={template} />);
    fireEvent.change(screen.getByLabelText("Add your own field"), { target: { value: "{{annual_revenue}}" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByLabelText("Message editor")).toHaveValue("<p>Hello {{decision_maker}}</p><p>{{annual_revenue}}</p>");
    expect(screen.getByLabelText("Insert subject placeholder").querySelectorAll('option[value="{{annual_revenue}}"]')).toHaveLength(1);
    expect(screen.getByText("Fields detected in this template (3)")).toBeInTheDocument();
  });
  it("rejects unsafe field names and keeps ready-made templates read-only", () => {
    const view = render(<TemplateForm template={template} />);
    fireEvent.change(screen.getByLabelText("Add your own field"), { target: { value: "__proto__.name" } });
    fireEvent.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getByRole("alert")).toHaveTextContent("without spaces");
    view.unmount();
    render(<TemplateForm template={{ ...template, is_system: true }} />);
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make a copy" })).toBeInTheDocument();
  });
});
