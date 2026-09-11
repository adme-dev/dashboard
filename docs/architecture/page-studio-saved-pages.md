# Dashboard Pages and Studio saved website

11 September 2026 — EDITOR-02 implementation; production verification pending.

Fantasy Limo's standalone Studio saved an eight-page schema-2 manifest, but Dashboard Pages read `page_studio_documents` and displayed a generated schema-1 Home placeholder at revision zero. These models are not interchangeable: converting to the legacy document would discard component properties and dynamic forms.

The agency document GET now reads the current site/checkpoint join through `queryOneFresh`, after `PAGE_STUDIO_EDIT` access and tenant/site validation. If a current checkpoint exists, its canonical scoped R2 object, envelope scope, manifest site and SHA-256 digest must all match. The response contains `document: null` and `studio: { checkpointId, pages }`, with the checkpoint creation time. The pages projection includes only titles, routes, visibility, SEO and form IDs. Components and form definitions stay untouched in the authoritative manifest. Storage or integrity failures produce an error; they never produce a substitute placeholder. The response is private/no-store.

Pages displays this saved website, offers Reload and Edit website in Studio, and refreshes when the Dashboard tab becomes visible again unless there are unsaved legacy changes. Page visibility labels describe manifest visibility, not publication. Content editing, page creation and dynamic forms remain in Studio's existing editor. This is not a second writable document format or a new publication path.

Sites with no Studio checkpoint retain the existing legacy page editor and revision protection. Both ordinary and replayed legacy saves reject `STUDIO_DOCUMENT_REQUIRED` once a current checkpoint exists. The normal save check holds the site row lock also taken by checkpoint commits. The audit insert explicitly casts the UUID site parameter to text for its resource ID, avoiding PostgreSQL conflicting parameter inference. The lock excludes nullable joined draft/checkpoint rows: PostgreSQL cannot lock the nullable side of an outer join. Existing legacy documents are preserved for subsequent explicit reconciliation.

The immutable checkpoint reader is shared with approved publishing. Release approval lookup, version digest comparison and complete manifest contents remain mandatory. Reads enforce an 8 MiB streamed-byte limit even without object size metadata. No migration, binding change, new dependency or budget increase is required.

Validation: targeted server and rendered Vue tests cover saved routes/SEO/forms, refresh and launch events, legacy preservation, stale save rejection, unavailable storage, foreign scope/key/site, corrupt digests, unapproved releases and stream limits. Final build, CI and live proof are recorded with the release. No production booking submission, charge, email or public client launch is part of this repair.

## Final local verification

- Full permitted suite: 2,001 files passed, 8 skipped; 13,119 tests passed, 51 skipped. Initial sandbox run could not launch Chromium or bind local HTTP servers; permitted rerun passed.
- Production build passed: 25,466,032 raw bytes of 25,468,928 (2,896 remaining); gzip 6,609,980 bytes of 9,750,000. No budget increase.
- Modified runtime/UI/test files pass ESLint and diff whitespace review.
- Repository-wide typecheck reports 626 errors outside the changed files. No errors reference this increment's changed runtime/UI files; global typecheck is not reported as passing.
- Review checked complete modified runtime files, new UI and schemas, test cases, scoped joins, immutable digest and publishing approval checks, stale writes, aliases, Nuxt UI, escaping and scrolling structure. No user data is written by the document read.
- Disposable PostgreSQL plus focused server/UI run: 34 tests passed, including all 18 real PostgreSQL checkpoint/document tests. The first run exposed the UUID/text audit parameter bug; the final run passed after the explicit cast. The guarded release rebuild and CI recheck the final source after that fix.

## Live verification follow-up

The initial source3a34ad5fd deployed successfully as7cf8cb46-60df-4250-8899-0b1fb5508edf at2026-09-11T09:32:11.37019Z after two transport failures; the successful guarded retry used Node IPv4-first with network-family autoselection disabled. Both CI runs34582812189 and34582857467 passed. Authenticated document GET returns200/private-no-store, document:null, the same checkpoint02aa6dc8 and all eight routes/SEO/two forms.

The real browser rendered all eight pages but exposed an existing outer-layout clipping issue: the site's1700px content sat inside a913px overflow-hidden agency container with no scroll owner. The management route now uses the same bounded UDashboardPanel pattern as the portfolio, with an overflow-y-auto body. This is included before closing EDITOR-02; final deployment and browser scroll verification must supersede this initial release.
