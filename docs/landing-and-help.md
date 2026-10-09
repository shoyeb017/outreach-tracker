# Landing animation and Help documentation

The landing hero uses an original Three.js tube shader with a blue palette, a white/navy light theme, and a black/glowing-blue dark theme. It is loaded only on the landing page, not in the authenticated workspace. The reference creator's CodePen is marked CC BY-NC-SA 4.0; its remote library and implementation are not embedded or copied here: https://codepen.io/soju22/pen/qEbdVjK.

## Animation behavior

- Desktop pointer movement smoothly bends the 3D tubes. Touch gestures remain native scrolling; no pointer capture or click-to-randomize behavior intercepts links.
- Animation runs continuously without a pause button. Reduced-motion preferences skip scene initialization entirely and show static blue curves; the three floating mail illustrations also become stationary.
- Rendering stops while the hero is off screen or the tab is hidden. Small-screen scenes have fewer tubes/segments and a lower frame/pixel-ratio cap.
- Graphics initialization failure or context loss shows a static fallback without hiding the content. Unmount releases animation frames, listeners, observers, geometry, materials, and the renderer.
- The transparent renderer blends into both landing themes. The navigation theme switch shares the user's persisted light/dark workspace preference without reinitializing the graphics scene.
- The supplied AUTMAIL logos switch lettering color with the theme, and the supplied icon is used for browser/app metadata. Original PNG assets remain in `src/styles`.
- The canonical product name is **AUTMAIL - Email Automation System**. Logo artwork appears without a subtitle; metadata, footer, and test-message copy retain the full name from `src/lib/utils.ts`. Legacy product-name environment overrides are ignored.
- The desktop hero uses reduced top spacing and height-aware illustration spacing to fit typical laptop screens. Short windows omit nonessential decorative signature lines; no interactive content is hidden or clipped. Mobile layouts remain content-sized and scroll naturally.
- Landing copy describes personal and work Microsoft mailboxes, not only Microsoft 365. Personal Outlook.com aliases include Hotmail, Live, and MSN; the selected registration must support the account type. Microsoft documents delegated personal-account sending in its [sendMail reference](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).
- Signed-in visitors can open their role-appropriate workspace or administration page, or sign out while remaining on the landing page. Sign-out clears local Microsoft caches, administrator sessions/cookies, and workspace authentication; failures are shown with a retryable message.
- Scrollbars use theme-aware native styling; no up/down scrolling buttons are added. Forced-color mode falls back to system colors.

## Edit a guide

The source files are in `content/help/*.md`. Guide order, titles, summaries, navigation groups, and paths are declared in `src/lib/help/documents.ts`.

Use unique, plain-text level-two headings (`##`) for section links. Pages render Markdown on the server with raw HTML disabled. Do not add secrets or deployment credentials to public documentation.

The troubleshooting Markdown is also the source of its expandable answers: after `<!-- interactive-errors -->`, each `###` error contains the four labeled answers. Do not edit a separate copy in JSX. The exact redirect copy button remains interactive and uses the configured public application URL.

Each guide is downloadable at `/help/<slug>/markdown`, including `getting-started`. Filename lookup is restricted to the guide manifest; unknown names return 404. Next output-file tracing includes the Markdown files for deployment.

Role-aware navigation is unchanged: verified administrators return to administration, workspace users to Email account settings, and anonymous readers to the landing page.

## Verification

Unit tests cover scene lifecycle, reduced motion, failure recovery, role-aware sign-out, documentation completeness, section anchors, safe Markdown rendering, and download path restrictions. Browser tests cover both landing themes, logo and icon assets, responsive mail illustrations, navigation, downloads, and graphics fallback. When the test browser supports WebGL2, they also exercise the real shader and context-loss behavior. Session tests mock authentication providers; verify real sign-out with dedicated user/admin accounts in the deployed environment.

Use `npm run build:test-ui` before running preview-only browser tests. Finish with a normal `npm run build` to restore the deployed public configuration. No database migration or real email is needed for this change.
