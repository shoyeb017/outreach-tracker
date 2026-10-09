import type { HistoryRow } from "@/components/history/history-table";

// Fictional, read-only records for layout checks in persistence-disabled preview mode.
// Never use these alongside a configured Supabase client.
export function createHistoryPreview(): HistoryRow[] {
  return Array.from({ length: 28 }, (_, index) => ({
    id: `preview-${index}`, dataset_id: "preview-spreadsheet", dataset_row_id: `preview-row-${index}`,
    recipient_email: index === 0 ? "international.partnerships.and.operations@example.com" : `contact${index + 1}@example.com`,
    recipient_name: index === 0 ? "Alexandra Morgan" : `Example contact ${index + 1}`,
    company_name: "Northstar International Technology and Business Services",
    subject: "Exploring practical automation opportunities for your operations team",
    final_html_body: "<p>Hi Alexandra,</p><p>This is a fictional preview message. No email was sent.</p><p>Best regards,<br>Example sender</p>",
    final_plain_text_body: null, sender_microsoft_email: "example.sender@example.com",
    status: ["simulated", "failed", "sent"][index % 3],
    error_message: index % 3 === 1 ? "Example error: mailbox authorization needs attention." : null,
    sent_at: new Date(Date.UTC(2026, 9, 8, 14, 28 - index)).toISOString(), is_test: false,
    datasets: { name: "October outreach — technology and professional services" },
    templates: { name: "Technology & Software — introductory consultation" },
  }));
}
