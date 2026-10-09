A template is a reusable subject and email body. Personal fields let the same message use different values for each spreadsheet row.

## Write a clear reusable message

Open **Email templates** and create a template, or copy a ready-made template. Ready-made templates are protected; edit your own copy. Give it a recognizable name and category so you can choose it confidently later.

Example subject:

```text
An idea for {{company_name}}
```

Example body:

```text
Hi {{recipient_name}},

We have an idea that could help {{company_name}} with {{service_interest}}.
Would you be open to a brief introductory call?

{{signature}}
```

## Understand the braces

Text inside `{{double_braces}}` is a personal field. You can type your own fields; you do not have to use only the dropdown suggestions. The template detects fields used in its subject and body.

Use simple, consistent names such as `{{company_name}}` and `{{city}}`. Avoid accidentally changing spelling between the subject and body. A normal word outside braces is not automatically personalized.

## Connect fields after choosing templates

Inside a spreadsheet’s **Personalize** step, connect every required personal field to the appropriate imported column. This is separate from choosing the recipient email destination and choosing which template each row uses.

For example, `{{company_name}}` can read your `Business name` column. A mapped column with an empty cell can still leave a row incomplete. Preview actual rows to spot missing values.

See the [spreadsheet workflow](/help/spreadsheet-workflow) for the three decisions side by side.

## Add your signature

Build and save your signature in **Settings → Signature**. Add text, links, or a logo, and reorder its blocks. Include `{{signature}}` where you want the saved signature to appear in the message.

Review the final email rather than assuming all email clients render identical formatting. Logo loading can depend on the recipient’s image settings.

## Edit without surprises

After changing a template, reopen the spreadsheet’s personalization and review steps. New fields may require new column connections, and existing recipients may now need a different preview.

Archive a template you no longer want to use and restore it if needed. Do not remove a template still needed by an active spreadsheet without first updating its routing.
