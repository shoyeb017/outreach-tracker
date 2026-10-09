AUTMAIL - Email Automation System helps you prepare personalized emails from a spreadsheet. You do not need to understand Microsoft Entra or database settings to prepare your first email. Start with a small spreadsheet and practice before sending real mail.

> Practice campaigns send no email. The separate **Send real test email** action does send a real message after you confirm it.

## 1. Prepare a small list

Use Excel or CSV with a header row and one intended recipient per row. Keep your own column names. Include an email address column and the information you want to use in your message, such as company or first name.

For your first test, use a few addresses you control. Do not upload passwords, access tokens, or unrelated sensitive information.

## 2. Create your spreadsheet

Open **Spreadsheets → New spreadsheet**. Follow the creation steps:

1. **Upload:** choose the file and check that its columns look right.
2. **Email setup:** choose the spreadsheet column containing recipient email addresses.
3. **Choose email templates:** use one template for all rows, or select a column whose values choose different templates.
4. **Personalize:** connect each personal field in those templates to its spreadsheet column.
5. **Save spreadsheet:** check the summary and save. Saving does not send anything.

The [spreadsheet workflow guide](/help/spreadsheet-workflow) explains each decision with an example.

## 3. Select and preview

Open the saved spreadsheet. Check its email setup, templates, and personalization, then **Select recipients → Review and send**.

Click a recipient row to read the actual subject and email body. Check the email address, chosen template, personal values, and signature. Fix blocked rows or missing values before including them.

## 4. Connect your sending mailbox

When you are ready to test the connection, open **Settings → Email account**. Most people can use **Administrator setup**, then click **Connect account** and sign in to their own Microsoft mailbox.

The administrator’s app IDs identify the application; they do not make the administrator your sender. The connected mailbox shown in Settings and review is the sender.

Use [Default connection](/help/default-connection). Only use [My own app registration](/help/custom-connection) if you manage or are authorized to use another registration.

## 5. Practice, then send deliberately

Run a small campaign in practice mode first. It checks the workflow without sending campaign mail. Review the results and resolve warnings.

Before a real campaign, check the selected mailbox, recipient list, duplicate policy, and preview. Enable real sending in **Settings → Sending**, then confirm the reviewed batch.

Read [Sending safety](/help/safety) before your first real batch. A result accepted by Microsoft is not proof that the email reached an inbox.

## When something goes wrong

Keep the exact error message and the connected sender address. The [troubleshooting guide](/help/troubleshooting) explains what happened, how to fix it, and how to verify it.

If a send outcome is uncertain, pause and check Microsoft Sent Items before deciding whether to resend.
