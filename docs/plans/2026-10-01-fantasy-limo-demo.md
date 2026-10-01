# Fantasy Limo CMS demo — 1 October 2026

The user selected the existing Fantasy Limo website as the demonstration target.
Use site `c34f6347-cc63-4ed7-9a5a-da165ebefed2`; do not replace it with a synthetic site.

## Verified in the signed-in Chrome session

- [Website management](https://app.xeroflow.io/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2) loads with the Fantasy Limo identity.
- Pages reports 75 saved pages. Launch readiness reports 66 visitor pages and eight form definitions.
- Forms loads the submissions inbox and its filter; it currently reports zero submissions.
- The management screen reports approved version `ade33ea8` already live on the shared staging address. No production domain is ready and the production release is not published.
- [Business content](https://app.xeroflow.io/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2/content) loads saved revision 1 with no collections and an Add collection control.

## Gaps observed

- CMS preparation reports that this sign-in cannot prepare the website. Custom collections reports unavailable. These controls are not accepted as working merely because legacy business content loads.
- Launch Studio creates an editing session and opens the editor shell. Desktop and mobile website frames remain blank. Reload did not resolve it; the full-browser-mode check encountered browser diagnostic timeouts. Do not claim a working visual editing or save/reload test.
- This is the existing agency-managed access path. It does not validate the new native customer signup, ownership, or standalone editor journey.

Only navigation, reads, editor launch, reload, and editor display controls were exercised. No content edits, saves, publications, form submissions, messages, or permission changes were made. Existing saved content and release controls were left untouched.

The separate native staging fixture initialization remains incomplete: customer A's collection upgrade is reserved, with a retained request ID in the private acceptance ledger. Its error and the temporary staging enablement still require follow-up; Fantasy's existing workspace is not evidence that those tests passed.

## Standalone customer workspace — local demo implemented

The next user request was explicitly to place Fantasy Limo in the standalone CMS.
The implementation is on `feat/standalone-site-workspace`, based on the existing
customer staging acceptance branch. It adds `/studio/sites/[siteId]` to the
standalone customer shell; it does not move the website into a new owner or claim
completion of the separate native signup/provisioning acceptance.

- Local demo: `http://localhost:3044/studio/sites/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
- Source checkpoint: `checkpoint_ai_proposal_19fcb707-203c-4435-8d3f-b911dbacf37d`, saved 28 September 2026. The production metadata and R2 checkpoint were read, then copied into a disposable local database and a development-only checkpoint binding. The normal checkpoint reader verifies its scope and digest.
- Overview, saved pages/SEO, media metadata index, saved form locations and an enquiry inbox now share one customer workspace. Existing content and draft-history screens link back to it.
- Chrome shows the actual 75 saved pages, 109 media records and eight forms. No customer enquiry data or production accounts/sessions were copied; the local inbox is empty.
- The demo uses a synthetic local customer account and the normal one-use portal sign-in flow. The copied website has an exact site membership. This is the standalone **invited-customer** path, not new proof of native customer signup.
- Workspace and submission reads require a current digest-bound portal session, active client/user/site/entitlement and exact tenant/client/site/user membership. Authority is rechecked after content reads; media storage keys are not returned.
- Both checkpoint-backed and older saved document formats are represented. Legacy pages receive a read-only display projection; no fabricated checkpoint or migration is performed.
- Local-only fixture scripts, copied data and credentials remain outside the source tree at `/private/tmp/customer-cms-local-layer`. Nuxt runs from the owned worktree at `/private/tmp/dashboard-customer-signup-20260930`. Start via the layer's `start.sh`; never deploy this external fixture layer.

### Explicit demo boundaries

The local editor connection is absent and the launch control is disabled. The
media view now includes authenticated image previews and metadata. Uploads and image generation remain in the Studio media picker.
The copied site does not have a local collection-runtime connection. Content
collections/history links reuse the existing scoped screens; their connected
editing/recovery operations have not been accepted in this demo. Forms settings,
forwarding, reply templates, webhooks, analytics, billing and production publishing
are not newly implemented by this slice. No hosted release was made.

### Verification

- Independent code review checked new authorization and found one legacy-page display bug, subsequently fixed with regression coverage.
- Focused Vitest suites cover workspace projection, revocation during reads, redaction, both page formats, existing saved-page rendering and submission inspection.
- Disposable PostgreSQL tests execute the real authorization SQL for exact ownership, viewer access, foreign identity/session/site requests, expired/revoked sessions, inactive accounts/sites, expired/future entitlements and mismatched/deleted memberships.
- Authenticated local HTTP reads return 200 for the customer, assigned site, workspace and empty submissions inbox.
- Chrome: normal customer sign-in, overview, saved SEO/page details, media metadata and empty forms inbox verified. Mobile viewport 390px has no horizontal overflow; viewport restored after testing.
- Final focused run: **33/33 tests passed** across five suites; new/changed workspace source passes targeted ESLint and `git diff --check`.
- Local HTTP rejection checks: missing cookie 401, forged cookie 401, valid customer requesting an unassigned site 404.
- The standalone overview survives a browser reload with the authenticated session. Screenshot: `/private/tmp/fantasy-limo-standalone-cms-20261001.png`.

## Framer design direction incorporated

The user supplied https://www.framer.com/cms/ as the design reference. The
[standalone CMS style guide](../design/standalone-cms-style-guide.md) records the
adapted visual system and follow-on product ideas. The customer shell is now more
compact and neutral. Pages use a searchable table, visibility filter, pagination
and a saved-details slideover. These are functional controls over the real copied
Fantasy content; they do not enable visual editing or publishing.

Framer-style browser acceptance: searching `wedding` returns three pages;
Draft visibility returns nine; the second page displays the next saved rows;
searching after pagination resets correctly; the wedding details panel shows its
actual URL and SEO; Escape dismisses the panel; unmatched search explains the
empty result. Real viewport checks at 320/768/1024/1440px show no document
horizontal overflow. All temporary viewport overrides were cleared. New screenshot:
`/private/tmp/fantasy-limo-framer-cms-20261001.png`. Independent review found no
blocking issues in the updated customer UI or style guide and completed the full
modified-file review, including both marketing catalogues.

## Authenticated media previews

The standalone library now shows a searchable, paginated image grid and a detail
panel. Preview requests recheck the active session and exact site membership
before and after storage reads. Only clean raster images under the owned site
prefix are served; responses are private/no-store and never fall back to a public
URL. SVG, pending, archived and oversized files are denied. Transient failures can
be retried from the details panel.

The local demo uses 109 read-only copies of Fantasy Limo image objects, verified
against their recorded SHA-256 digests (31,549,909 bytes). No customer production
configuration or objects were changed.

Chrome confirmed all 18 first-page thumbnails loaded, image details, search,
empty-result recovery and pagination. No document overflow at 320/768/1024/1440px.
Screenshot: `/private/tmp/fantasy-limo-media-library-20261001.png`.
Independent review found no blocking issues; its transient-preview retry
suggestion was implemented. Focused storage/authority tests: 16 passed.
