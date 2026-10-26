# Send email bodies from your spreadsheet

## One-time setup for the administrator

Before upgrading, finish any active browser batches and pause scheduled sending while you apply the migration and deploy. Check the worker health before re-enabling scheduled sending.

1. Open your existing Supabase project: [rconmqterfwuzgdgsolj](https://supabase.com/dashboard/project/rconmqterfwuzgdgsolj).
2. Open **SQL Editor → New query**.
3. Copy the complete contents of `supabase/migrations/20261026_spreadsheet_email_body.sql`, paste it, then click **Run**. Apply it once, after the existing scheduling, engagement, history follow-up and record-deletion migrations.
4. Deploy this app version in Vercel. If the GitHub push already started a deployment, apply the SQL promptly; do not use the upgraded import/setup screens until it finishes.
5. Refresh AUTMAIL. No environment changes or new Microsoft permissions are needed. Existing spreadsheets still use templates by default.

The migration changes the database only. It does not send an email, create a timer, enable real sending, or change your scheduler pause switch. Existing reviewed schedules keep their saved content.

## Use the new option

Prepare three different spreadsheet columns:

| Email | Subject | Message |
| --- | --- | --- |
| recipient@example.com | A quick introduction | Hello Alex, followed by your complete message |

1. Import your file and choose its worksheet.
2. In **Email setup**, choose the recipient email column.
3. For **Where should the email body come from?**, choose **Use a spreadsheet body column**.
4. Choose **Message** as the body column and **Subject** as the subject column.
5. Keep **Add my saved signature** on, or turn it off if your spreadsheet already includes one.
6. Continue. **Email content** confirms your chosen columns; it does not ask for templates.
7. Save, select recipients and open their previews. Fix empty bodies or subjects.
8. Confirm a practice send, a controlled test, or your intended real send. Scheduling uses the same content.

For an existing spreadsheet, open **Email setup**, make the same choices, and click **Save choices**.

## Important details

- Spreadsheet bodies are plain text; line breaks are preserved. HTML is shown as text for safety.
- Each subject must be filled in. Spreadsheet mode has no template fallback.
- Optional body fields such as `{{business_name}}` use exact imported column keys, shown in **Personalize**. Missing values block that row.
- The signature and optional engagement section still work. Test/practice emails and previews do not activate engagement tracking.
- Default duplicate protection blocks a repeated recipient within the **same spreadsheet campaign**, even if different rows contain different messages. Warn/Allow remain available for intentional repeats. Active reservations and unconfirmed outcomes are still protected.
- Schedules freeze the reviewed emails. To change them, cancel the existing schedule and create a new one.
- History and engagement show the content source instead of a missing-template label. Follow-ups copy the columns, but ask you to choose their email content again before sending.
- All existing Supabase Free scheduling, storage and engagement limits still apply.

If you see “column not found” or “function not found” after deployment, check that the complete migration finished successfully in the correct Supabase project, then refresh. Do not disable safety checks to bypass an incomplete update.
