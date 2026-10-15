// Fixed diagnostic message, not a campaign or editable mail composer.
export const SCHEDULE_TEST_MESSAGE = {
  subject: "[AUTMAIL test] Scheduled sending check",
  html: "<p>Hello,</p><p>This is a scheduled test email from AUTMAIL.</p><p>You are receiving it because this address was entered manually to test scheduled sending. No spreadsheet or campaign was used.</p><p>AUTMAIL</p>",
  text: "Hello,\n\nThis is a scheduled test email from AUTMAIL.\n\nYou are receiving it because this address was entered manually to test scheduled sending. No spreadsheet or campaign was used.\n\nAUTMAIL",
} as const;
