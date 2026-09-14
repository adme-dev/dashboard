# FR-02 — Website submission details

Scope: extend the existing agency Website → Forms inbox to inspect all recorded
fields and filter the loaded receipts by all, live or test. This implements the
FR-02 slice of the Framer R&D backlog; other backlog items remain open.

Base: freshly fetched Dashboard main
`7373e9717322e5cffb74e6eda3dcdf7dbddab623`.

## Behavior

- A Nuxt UI slideover shows receipt ID, form name/ID, page, time and every field.
- Plain text rendering preserves multiline values and escapes HTML-like input.
- Empty values have an explicit placeholder; malformed dates do not crash rendering.
- Filters explicitly describe loaded submissions; this adds no all-history search.
- Site changes clear the previous view and request the new site's receipts.
- Pending/error states hide details. Refresh and filter changes close selection.
- Opening a receipt performs no mutation, email send or booking confirmation.
- Public Page Studio feature descriptions reflect the added inspection workflow.

No API, database, provider, font configuration or editor changes are included.
Existing server site scoping and PAGE_STUDIO_VIEW authorization remain authoritative.
Raw stored field keys are displayed; historical field-label reconstruction and
notification delivery receipts are separate follow-on work.

## Review and verification

Independent review found and resolved a Nuxt reactive-key cancellation issue:
useFetch automatic watching is disabled and the site watcher explicitly clears
then refreshes. The regression checks the new site appears without a manual click.
The reviewer rechecked the installed Nuxt implementation and passed all four
component tests with no remaining must-fix findings.

Actual Nuxt UI local browser checks with synthetic data verified the dropdown,
plain-text HTML-like values, accessible dialog/close control, and overflow:
desktop viewport1488 has no page overflow and dialog448 with scrollcontent2571 /
client832; a real393-pixel iframe viewport has page393/dialog393 and scrollcontent2795 /
client679. The iframe fixture starts the panel automatically; the desktop panel
and filter were operated through browser controls. No production form was submitted.

Local full suite: 13,774 passed / 259 environment-gated skips. The initial build
passes the unchanged raw budget at25,465,573 /25,468,928 bytes. Final scoped
marketing wording and a typed void click handler are included in the candidate;
exact-head CI/release rebuild remains authoritative. Targeted lint passes.
The first full-suite attempt lacked local browser/Worker permissions; another
attempt overlapped Nuxt configuration regeneration. Neither is a passing result.
The successful run followed build completion with local runtime permissions.

Release status: local implementation; exact-head CI and production acceptance
must be recorded before this task is marked shipped. Browser fixture data is
synthetic and does not prove delivery or customer booking operations.


## CI scanner scheduling repair

The exact candidate's push CI passed all13,774 tests, but its duplicate PR run
and one investigated retry exceeded the unchanged15s CRM source-scan timeout.
The passing CI scan took13.962s; isolated local54-test execution took4.41s.
No scanner/support source changed from main. A second retry was not attempted.

The Full test suite step now runs the entire54-test CRM endpoint/guard file
first, then all remaining files with only that already-executed file excluded.
The source roots, assertions, negative controls, test timeout and20-minute step
limit are unchanged. Normal shell failure handling makes either command failure
block release. A configuration regression requires both commands in order and
rejects error suppression or test-name/timeout overrides. Independent review
verified pnpm forwarding and installed Vitest additional-exclusion semantics.
This removes concurrent-file contention; exact-head CI must verify the outcome.
