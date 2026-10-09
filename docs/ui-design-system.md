# Compact Kinetic UI

The latest Kinetic brief guides the interface, with the user's blue/navy preference replacing orange. Near-black neutral structure and electric-blue interactions define dark mode; white surfaces and focused navy actions define light mode. Earlier oversized rounded Material styling has been reduced. This is Microsoft-inspired, not an official Microsoft product. No new UI dependencies or remote fonts are required.

## Proportion

- 14px body and controls, 12px small labels, 16px card headings, 24–30px workspace page headings, and 32–46px public hero text. Segoe UI / system font stack.
- Cards use 12px corners, buttons/fields 8px, table frames 10px, and hero 12–16px. Circles remain only for genuinely circular indicators.
- 16–20px card padding, shorter controls, compact page headers, and a 224px desktop sidebar. Touch controls keep at least 44px height; phone inputs stay 16px to avoid automatic zoom.
- Dark base #09090b, cards #111113, secondary surfaces #18181b, accent #4b96ff and blue interaction glow. Light uses #173b70 navy on white and off-white neutral surfaces.
- Semantic status colors remain separate from structural UI. Tests check text/action contrast in both themes and input-boundary contrast.

## Motion and tables

Motion communicates entrances, focus, hover, selection, and pressed state. Card staggers use 70ms intervals; entrances and transitions use explicit properties and eased curves. No perpetual motion on working forms, fake counters, or text that waits to type before becoming accessible. Reduced-motion preferences disable entrances, sheen, and press scaling. Landing reveal content is accessible without JavaScript.

Table widths remain deliberate, text wraps, and overflow stays inside each table. Comfortable spacing is the default, with Compact available in recipient and history views. History groups details into five columns, shows individual cards on phones, and pages 25 records at a time. Filters continue to cover the latest 1,000 records.

In explicitly enabled internal UI-test mode only, `/history?demo=1` displays clearly labeled fictional records. It never substitutes records when Supabase is configured and offers no source/resend actions.

## Navigation and appearance

The landing page is public even while signed in. It shows Open workspace or Open administration according to the verified session instead of redirecting or signing anyone out. Workspace, admin, and Help offer a landing-page link.

Help returns verified administrators to /admin, workspace users to Settings → Email account, and anonymous visitors to the landing page. Server-verified sessions choose these links; query parameters do not grant administrator context or access. Existing protected routes still enforce authorization.

The upper navbar theme toggle follows the system preference until explicitly changed. Choices persist under `outreach-theme`, synchronize between tabs, and are applied before rendering. These preferences require no migration.

Email previews and editing canvases stay white. App styling never rewrites saved HTML, logos, signature colors, or outgoing message content.

## Validation and local browser checks

Authentication, Microsoft consent, routing, suppression, duplicate prevention, storage, and real-send confirmation are unchanged. Tests mock authenticated roles and use a persistence-disabled build for browser checks; no live mailbox or Entra access is established by these tests.

Run `npm run build:test-ui`, set `PLAYWRIGHT_PRODUCTION=1` and optionally `PLAYWRIGHT_CHANNEL=chrome` in your shell, then run `npm run test:browser`. The preview build explicitly blanks Supabase public credentials through Node, including on Windows. **Never deploy that preview build. Run normal `npm run build` before deploying.**
