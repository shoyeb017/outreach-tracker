Your spreadsheet supplies the recipients and personal values. A template supplies the message. Mapping connects the two without requiring fixed spreadsheet column names.

## Email setup: who receives the message

Choose the column containing the **recipient’s email address**. This is the actual destination, not the sending mailbox, and not a template placeholder.

For example, if your spreadsheet has `Contact email`, choose that column. Check sample addresses and missing or invalid values. A company name column cannot replace an email column.

In **Subject options (optional)**, choose where the email title comes from:

- **Use template subjects only:** use the subject written in each chosen template. No subject column is needed.
- **Use spreadsheet subjects if available; otherwise use the template:** choose the spreadsheet subject column. A filled cell supplies that row's subject; a blank cell automatically uses the chosen template's subject. This column is required when you choose this option and must be different from the recipient email column.

## Choose templates: which message each row uses

There are two approaches:

- **One template for everyone:** every included row uses the template you select. No category column is needed. Personal details can still differ for each recipient.
- **Different templates by spreadsheet value:** choose your spreadsheet’s decision column, such as `Sector`. Connect its actual values to the templates you want them to use.

Example: the value `Banking` in your `Sector` column can select your financial services template. `Healthcare` can select your healthcare template. These are your routing choices; a spreadsheet column name is not itself a template name.

Suggestions match spreadsheet values to a template's category or name. Check each group and choose **Skip these recipients**, **Choose a template**, or **Use default template**. A group using the default requires you to select an active **Default template** before continuing. An explicit Skip is never overridden by the default. Rows with a missing or unmatched value use the default if you selected one; otherwise they cannot be sent.

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
3. The chosen template and final subject.
4. The personal values and signature.
5. The sending mailbox and campaign mode.

The **Review and confirm** window places the summary and **Cancel / Send** controls above the recipient table. Scroll inside the table to inspect more recipients; opening a preview does not send anything. In practice mode, the confirmation button says **Practice**, not Send.

If you change a template or mapping, review again. See [Templates and personal fields](/help/templates-and-personalization) for reusable message examples.
