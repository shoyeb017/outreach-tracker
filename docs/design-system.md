# AUTMAIL visual system

The interface uses a navy navigation rail, indigo primary actions, neutral surfaces, and semantic status colors. Green means success rather than being the color of every action. Statuses also retain text labels; color is not the only signal.

## Shared foundations

- `src/app/globals.css` owns color tokens, readable small-text sizes, fluid page spacing and headings, focus indicators, reduced-motion behavior, and contained table scrolling.
- Shared buttons, inputs, selects, labels, badges, cards, page headers, and dialogs use these foundations. Prefer these components and tokens over new literal colors and fixed widths.
- Primary controls are at least 44 pixels high. Small desktop buttons are 40 pixels high; narrow-screen buttons become at least 44 pixels high. Inputs use 16-pixel text on narrow screens to avoid automatic mobile zoom.
- Titles and descriptions remain complete and wrap. Badges allow long unbroken placeholder tokens to wrap. Action groups must wrap rather than relying on clipped overflow.

## Layout behavior

- Below 1024 pixels, navigation moves into the accessible navigation dialog. The persistent rail remains available on wider screens.
- Pages use a bounded 1440-pixel content area with fluid padding. Grid children and form controls can shrink without expanding the page.
- Workflow steps move to five columns only when there is room. Settings retain one visible tab panel at a time and keep unfinished edits mounted.
- Spreadsheet and history tables use keyboard-focusable, labeled scroll regions. Horizontal scrolling belongs to the table, not the entire page. Filters and row actions wrap independently.
- Signature blocks retain their own scroll area, focused editing, explicit saving, and live preview. Email HTML styling is separate from the application theme and has not been recolored.

## Safe browser verification

Use the explicit isolated UI-test build. It removes real service credentials, opts into internal fixtures, and is rejected on Vercel. A normal production build never falls back to a demo workspace.

```powershell
$env:NODE_OPTIONS='--max-old-space-size=512 --max-semi-space-size=8'
npm.cmd run build:test-ui
$env:PLAYWRIGHT_PRODUCTION='1'
npm.cmd run test:browser
```

If automatic web-server teardown stalls on Windows, start that same preview build in another terminal with `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3107`, set `$env:PLAYWRIGHT_EXTERNAL_SERVER='1'` in the test terminal, and run the browser suite. Stop the manually started server afterward. Never enable this option against a live workspace server.

The browser tests assert the internal UI-test banner on workspace pages so that a loading/error page cannot silently pass the layout check. After testing, run a normal `npm.cmd run build` to restore the configured production build. Do not deploy the UI-test output or set its internal flag on the hosting provider.

The responsive suite covers nine primary routes at 360, 390, 768, 1024, 1280, and 1536 pixels, all settings tabs, long template values, 200% CSS text enlargement, dialog Escape behavior, mobile navigation focus, and local CSV import. Screenshots are generated under ignored `test-results/` for desktop and mobile inspection. This is not a formal WCAG audit, full browser-zoom certification, or verification of authenticated, populated datasets and live integrations. Those require the staging checks in `release-checklist.md`.
