Your spreadsheet supplies the recipients and personal values. Choose whether a template or a spreadsheet column supplies the message. Mapping connects your data without requiring fixed spreadsheet column names.

## Upload: choose your file and worksheet

Supported files are Excel (`.xlsx`, `.xls`, `.xlsm`, `.xlsb`), OpenDocument (`.ods`, `.fods`), CSV, TSV and comma/tab/semicolon-delimited TXT. Google Sheets and other cloud spreadsheets should be downloaded in one of these formats first; this is a file import, not a live cloud connection. PDFs, images, document files and password-protected spreadsheets need conversion or an unprotected copy.

Files can be up to **15 MB**, with up to **10,000 recipient rows and 500 columns** in the worksheet you select. Remove unused rows/columns if an inflated data range exceeds a limit. Macros are not run and formulas are not recalculated; formula cells need saved values from your spreadsheet application.

After choosing a file:

1. If it has multiple worksheets, AUTMAIL lists their names and asks **Choose the worksheet to import**. No worksheet is selected for you.
2. Choose the worksheet and click **Use this worksheet**. Only its rows are imported; other worksheets are not merged.
3. If the file has only one worksheet (including CSV/TSV), it is selected automatically.
4. Preview the selected data and choose its recipient email column.
5. The suggested name combines the file and worksheet, for example **Virginia contacts — Accounting firms**. You can edit this name before saving. The original file and worksheet names are always saved separately as source details.

You can use **Change worksheet** to return to the picker. Keeping the same worksheet keeps your choices; switching to another resets recipient/subject columns, templates and personalization connections because its columns may differ. An empty or oversized first worksheet does not prevent choosing another worksheet. Nothing is saved or emailed during file/worksheet selection.

## Email setup: who receives the message

Choose the column containing the **recipient’s email address**. This is the actual destination, not the sending mailbox, and not a template placeholder.

For example, if your spreadsheet has `Contact email`, choose that column. Check sample addresses and missing or invalid values. A company name column cannot replace an email column.

Next choose **Where should the email body come from?**:

- **Use email templates:** choose a saved message in the next step. Personalization fields can use any imported column.
- **Use a spreadsheet body column:** each row already contains its own complete message. Choose separate recipient email, subject and body columns. No template is needed. Choose whether to add your saved signature; turn it off if your cells already contain a signature.

Spreadsheet bodies are plain text, with their line breaks preserved. HTML code is displayed as text, not interpreted. Blank body or subject cells block that row, even if your signature is nonempty. There is no hidden template fallback. The **Email content** step shows the selected columns instead of asking for templates.

Optional `{{column_key}}` fields inside a spreadsheet body resolve automatically using imported column keys; see **Personalize → Optional placeholder keys** for the exact keys. For example, a `Business Name` column usually has key `business_name`. Use `{{business_name}}` inside a message to insert that row's value. Missing values are flagged before sending. No template-field mapping is needed in this mode.

If you chose templates, **Subject options (optional)** controls where the email title comes from:

- **Use template subjects only:** use the subject written in each chosen template. No subject column is needed.
- **Use spreadsheet subjects if available; otherwise use the template:** choose the spreadsheet subject column. A filled cell supplies that row's subject; a blank cell automatically uses the chosen template's subject. This column is required when you choose this option and must be different from the recipient email column.

## Choose templates: which message each row uses

This step applies only when you chose **Use email templates**. With spreadsheet bodies, it becomes **Email content**, showing your body and subject columns; there are no template choices to fill in.

For templates there are two approaches:

- **One template for everyone:** every included row uses the template you select. No category column is needed. Personal details can still differ for each recipient.
- **Different templates by spreadsheet value:** choose your spreadsheet’s decision column, such as `Sector`. Connect its actual values to the templates you want them to use.

Example: the value `Banking` in your `Sector` column can select your financial services template. `Healthcare` can select your healthcare template. These are your routing choices; a spreadsheet column name is not itself a template name.

Suggestions first match a full category or template name, then look for business phrases within longer text. For example, `Accounting firm Arlington, Virginia` suggests **Accounting firm Outreach**. With several recognized business phrases, the first one wins; more specific wording wins over a shorter phrase at the same position. Common wording and plural forms are supported. Minor typos may produce a possible spelling match only when no recognized phrase is found. Duplicate matching templates and unclear values require your choice. In existing spreadsheets, use **Suggest templates**; it keeps templates you already selected and does not save automatically.

Check each group and choose **Skip these recipients**, **Choose a template**, or **Use default template**. A group using the default requires you to select an active **Default template** before continuing. An explicit Skip is never overridden by the default. Rows with a missing or unmatched value use the default if you selected one; otherwise they cannot be sent. Always review the final recipient previews before sending.

## Personalize: where the message values come from

A personal field is a blank in the template, written inside double braces, such as `{{company_name}}`. Fill each blank by choosing the spreadsheet column that supplies the right information.

For a spreadsheet with `Organization`, `Contact person`, and `Contact email`:

- Recipient email destination → `Contact email`.
- `{{company_name}}` → `Organization`.
- `{{recipient_name}}` → `Contact person`.

You can use your own fields, such as `{{city}}` or `{{service_interest}}`, and connect them to any suitable imported column. Column names and field names do not have to be identical.

`{{signature}}` comes from your saved signature in Settings, not a spreadsheet column. Older profile fields may still appear in existing templates; review or replace them with personal fields or your signature rather than expecting an imported column automatically.

## Save and select recipients

Creation follows **Upload → Email setup → Choose email templates → Personalize → Save spreadsheet**. After saving, the spreadsheet detail page lets you revisit setup, then **Select recipients → Review and send**.

Saving or selecting a row does not send anything. Only include the rows you intend to contact. Missing addresses, unmatched templates, unmapped fields, and other readiness problems must be addressed before the affected row can proceed.

New imports save the spreadsheet rows and your choices for that spreadsheet. The import wizard no longer offers original-file storage or saving a reusable setup. Existing saved setups and previously stored files are not deleted.

## Review the actual result

Check each recipient preview, not just the total count. Confirm:

1. The destination email column and address.
2. The routing column/value, if you used matching.
3. The chosen template **or spreadsheet body column**, and the final subject.
4. The personal values and signature.
5. The sending mailbox and campaign mode.

The **Review and confirm** window places the summary and **Cancel / Send** controls above the recipient table. Scroll inside the table to inspect more recipients; opening a preview does not send anything. In practice mode, the confirmation button says **Practice**, not Send.

For spreadsheet bodies, duplicate protection uses **recipient + spreadsheet campaign**. Different messages to the same address in this spreadsheet are still repeats. Choose Warn or Allow only when intentional. Uncertain outcomes and active schedule reservations remain blocked regardless of that choice.

Scheduled sends save the final subject and body at confirmation. Later spreadsheet edits do not rewrite an existing schedule; cancel and create a new reviewed schedule if its content needs to change. Accepted, failed and practice results appear in Email history with the content source shown. Engagement buttons work with either body source; previews and tests do not activate tracking.

History and engagement follow-ups copy the source columns and data, but require a fresh email-content choice. Select templates or reselect the copied body/subject columns, update the follow-up messages, then preview and confirm. Creating a follow-up never sends mail or automatically repeats the old message.

If you change an email body, template or mapping, review again. See [Templates and personal fields](/help/templates-and-personalization) for reusable message examples.
