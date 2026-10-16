# Business-type outreach templates

These 15 ready-made emails use the same simple format as the existing industry templates. Each works in any location; there are no city-specific variants or new required fields.

## Add them to your existing Supabase project

1. Open **supabase/migrations/20261016_business_outreach_templates.sql** in VS Code and copy the whole file.
2. Open your existing Supabase project → **SQL Editor → New query**. Paste the file and click **Run**.
3. Refresh AUTMAIL → **Email templates → Ready-made**. Search for a business type, such as **Landscaping company**.

This file only needs the existing `templates` table. No new environment values, Microsoft permissions, scheduler changes, or website deployment are needed just to load these templates. It does not send anything or change a spreadsheet's saved choices.

Do not rerun the old industry seed for this update. The new SQL preserves the original 23 industry templates and Blank Template. It can be rerun without duplicates: it updates its own managed system templates while keeping their IDs. Personal copies are not overwritten. Export important data before making database changes.

## Templates included

- Marketing agency Outreach
- Digital marketing agency Outreach
- IT company Outreach
- IT consulting company Outreach
- Software company Outreach
- Business consulting Outreach
- Management consulting Outreach
- Accounting firm Outreach
- Bookkeeping service Outreach
- Recruitment agency Outreach
- Construction company Outreach
- General contractor Outreach
- Real estate agency Outreach
- Property management company Outreach
- Landscaping company Outreach

Together with the original 24 ready-made templates, this gives a fresh installation 39 built-in templates. Personal templates are additional.

## Same format and personalization

Every new email includes an appropriate subject, `Hi {{company_name}},`, a short business-specific challenge, an Inuberry Global introduction, four relevant service points, the existing 15-minute call invitation, `Best regards,`, and `{{signature}}`.

Both HTML and plain-text content are included. Connect **company_name** to your spreadsheet's company/business-name column. The signature comes from **Settings → Signature**. No city, state, location, contact name, or extra personalization field is required. As with the original templates, the Inuberry Global introduction is fixed text; choose **Make a copy** to adapt it for another organization.

## Choose the right template

For one template for everyone, select the appropriate business template in the spreadsheet setup.

For different templates by spreadsheet value, use a column such as **Business type**, with values such as `Marketing agency` or `Landscaping company`. The new template's Category matches that business type, so **Exact match** can suggest it. Review the choices and save them before sending.

Keep locations in a separate column if needed. A whole search phrase such as `Landscaping company Arlington, Virginia` is not an exact category match; either select the template manually or use a separate business-type column. The original broad industry categories still match their original templates.

Ready-made templates are protected. Use **Make a copy** to edit one, then select your copy for the spreadsheet. Preview real rows before confirming a send.
