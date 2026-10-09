Your spreadsheet supplies the recipients and personal values. A template supplies the message. Mapping connects the two without requiring fixed spreadsheet column names.

## Email setup: who receives the message

Choose the column containing the **recipient’s email address**. This is the actual destination, not the sending mailbox, and not a template placeholder.

For example, if your spreadsheet has `Contact email`, choose that column. Check sample addresses and missing or invalid values. A company name column cannot replace an email column.

## Choose templates: which message each row uses

There are two approaches:

- **One template:** every included row uses the template you select. No category column is needed.
- **Match using a column:** choose your spreadsheet’s decision column, such as `Sector`. Connect its actual values to the templates you want them to use.

Example: the value `Banking` in your `Sector` column can select your financial services template. `Healthcare` can select your healthcare template. These are your routing choices; a spreadsheet column name is not itself a template name.

Review unmatched values. Assign a template or deliberately skip them rather than guessing what will be sent.

## Personalize: where the message values come from

A personal field is text inside double braces, such as `{{company_name}}`. For every field used by your selected templates, choose the column supplying its value.

For a spreadsheet with `Organization`, `Contact person`, and `Contact email`:

- Recipient email destination → `Contact email`.
- `{{company_name}}` → `Organization`.
- `{{recipient_name}}` → `Contact person`.

You can use your own fields, such as `{{city}}` or `{{service_interest}}`, and connect them to any suitable imported column. Column names and field names do not have to be identical.

`{{signature}}` comes from your saved signature in Settings, not a spreadsheet column. Older profile fields may still appear in existing templates; review or replace them with personal fields or your signature rather than expecting an imported column automatically.

## Save and select recipients

Creation follows **Upload → Email setup → Choose email templates → Personalize → Save spreadsheet**. After saving, the spreadsheet detail page lets you revisit setup, then **Select recipients → Review and send**.

Saving or selecting a row does not send anything. Only include the rows you intend to contact. Missing addresses, unmatched templates, unmapped fields, and other readiness problems must be addressed before the affected row can proceed.

## Review the actual result

Check each recipient preview, not just the total count. Confirm:

1. The destination email column and address.
2. The routing column/value, if you used matching.
3. The chosen template and final subject.
4. The personal values and signature.
5. The sending mailbox and campaign mode.

If you change a template or mapping, review again. See [Templates and personal fields](/help/templates-and-personalization) for reusable message examples.
