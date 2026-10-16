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

For different templates by spreadsheet value, choose a column such as **Business type** or your existing search-phrase column. Suggestions first check the full template Category or Name, then recognize business phrases within longer values. In an existing spreadsheet, click **Suggest templates**. New spreadsheet setup uses the same matching rules when you choose the decision column.

- `Accounting firm Arlington, Virginia` suggests **Accounting firm Outreach**.
- `Accounting firm Arlington, Virginia, Business consulting Arlington` also suggests **Accounting firm Outreach**: the first recognized business phrase wins, not the first template in the list.
- `Digital marketing agency Arlington` suggests **Digital marketing agency Outreach**, not the broader marketing-agency template.
- Common wording such as `Accountancy firm`, `Staffing agency`, and plural forms is supported. Minor spelling errors can produce a possible spelling match when no recognized phrase is found; review these carefully.

Locations do not need separate templates. A separate business-type column remains useful but is not required. Duplicate matching templates and unclear values are left for you to choose manually; generic words such as `company` are not enough. This is a conservative text matcher, not an AI decision about the business. The original exact industry matches still work.

Suggestions never save choices or send emails on their own. Review the chosen template for every group, correct or skip any uncertain group, and save before sending. Existing selected templates are not replaced when you click **Suggest templates**. Saved rules still use the original spreadsheet value, including its location text.

The improved matcher is a website code update: deploy the updated application to use it on Vercel. It does not need a new SQL migration or new permissions. The template-loading SQL above is only needed if those templates are not already installed.

Ready-made templates are protected. Use **Make a copy** to edit one, then select your copy for the spreadsheet. Preview real rows before confirming a send.
