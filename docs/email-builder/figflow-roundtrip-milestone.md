# First structured FigFlow round trip

**Completed and live — 2 November 2026.** The supported saved-draft content
workflow passed authenticated production acceptance. Exact source, deployments,
proof limits and screenshot hashes are in the
[activation receipt](figflow-production-activation-20261102.json). The earlier
[disabled release receipt](figflow-release-20261101.json) is historical.

## Acceptance

- [x] Canonical conversion with stable lineage and restricted content edits.
- [x] Actual native import/snapshot; unsupported structure/style rejected.
- [x] Durable actor/document/revision-bound proposals and explicit Apply.
- [x] Composer save/open/resume/reconciliation/rendered preview and one undo step.
- [x] Final application, auth, database, native and browser verification.
- [x] Merge, production migrations, private services, native assets and activation.
- [x] Existing session authority reused; no signing-key copy or rotation.
- [x] Signed-in production native editing, preview/Apply and persistence/reload.
- [x] Second round trip preserves intervening composer edits.
- [x] Stale revisions rejected; existing composer/modules and QR navigation checked.

Scope: content edits to supported text, images and buttons, preserving canonical
layout/mobile/lineage. This milestone does not deliver arbitrary canvas conversion,
shared-module publication, email sending or real email-client compatibility.
Those remain explicit tasks in the parent PRD.

## Live release

| Surface | Receipt |
|---|---|
| Pages | `e2a2ff7e-96ea-4fa8-94f0-922bb00c4720`, source `ad9f18d6f6952a9587b5e03f1ad850041198d63b`, serving app.xeroflow.io |
| Private design Worker | Version `bbc8fb52-01cc-456d-9a1c-2b58728cf4fb`, source `0dc1274f85b2ea99d9104dd7cf4538c43088dbca`; capability true, no public endpoint |
| Database | Migrations 491–493 applied 1 November to verified production Hyperdrive |
| Native private assets | Version `86f446f6-f9de-4ce1-b6af-10a0bf722cb1` |
| Creative gateway | Version `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce`, authenticated `/figflow/0.11.2-edm1/` prefix |

Pages raw Worker size: 25,468,436 / 25,468,928 bytes (492 remaining); gzip
7,338,149 / 9,750,000. No size/target/source guard was relaxed. Subsequent source
changes affect only the private Worker, its fixtures and documentation; Pages
runtime source remains the recorded activation commit. Existing template writes
stay local, heavy design handlers stay private, and staging remains disabled.

## Authentication and hosted correction

PR #810 extracted the unchanged Pages signature verifier behind a build-time
port. The private Worker aliases that port to XeroFlow's existing `/api/auth/me`
authority, as Creative Suite already does. The request uses only the exact bearer
token and a fixed environment host: no cookies, redirects or cached verdicts;
8-second request and 32 KiB response bounds. An active authoritative user must
match the original token before claims are returned. Fresh database session,
revocation, role and client checks remain in their existing owners.

The first hosted lookup returned503. PR #811 added content-free diagnostics,
which identified auth-owner HTTP522 while browser auth returned200. The private
Worker lacked `global_fetch_strictly_public`; without it, same-zone requests
bypassed Pages and hit the zone origin. PR #812 added the flag already used by
Creative Suite, pinned it in the exact deployment guard and matched fixtures.
The corrected hosted lookup returned200. The original pending action was
reconciled using its retained identity, then completed normally. No key was
copied or rotated, no caller identity grant or public fallback was added.

## Production acceptance

The signed-in owner session opened synthetic draft
`06733e70-0758-4138-9238-7ecaa2e22990`, clearly named
`[Verification] FigFlow live activation 2026-11-02`.

1. Opened the actual hosted native editor from the composer and changed its
   heading with mouse/keyboard input on the native canvas.
2. Returned a durable proposal. A canonical read still showed the original
   heading before Apply. The rendered review showed the new content.
3. Applied explicitly. Canonical source and HTML advanced together. One Undo
   restored the original heading; one Redo restored the native edit.
4. Edited CTA text in the composer and saved it through the versioned save path.
5. Opened a second native session, verified that CTA was present, edited the
   heading again, returned/reviewed/applied, and reloaded the saved composer.
   Both content and HTML retained the second heading and staff CTA edit.
6. Submitted a stale revision against the same owned verification draft:
   `409 REVISION_CONFLICT`; current head and content remained unchanged.
   Anonymous lookup returned 401. No email was sent.

This is real hosted acceptance, including native mouse/keyboard editing, not the
prior isolated-WASM fixture. Orca paused finite modal animations at time zero;
existing animations were advanced to their end before subsequent UI checks.
Screenshots are hashed in the receipt and retained under `/private/tmp/figflow-*`.
The synthetic versioned draft remains as acceptance evidence with immutable
history. It is a draft, not a library template or campaign.

## Validation and next work

Canonical auth/authority/deploy/binding checks passed (96); focused route/composer/
transport checks passed (57); real Worker/PostgreSQL/native suite passed all seven
cases; twelve admission checks and eight gate-inventory checks passed. Routing
verification passed 26 authority/deploy checks and 25 runtime/deploy checks. Native
CI 41296329622 previously passed 43 native tests, 15 relay checks and package build;
those inputs did not change. Targeted lint and independent source reviews passed.
Counts overlap and must not be added into a unique total.

The signing-key blocker is closed. Further work belongs to the parent PRD:
shared modules/publication, durable asset lifecycle extensions and the exact
Apple Mail/Gmail/Outlook acceptance matrix. No send-readiness claim is made here.
Do not rerun unchanged suites or rebuild/redeploy old source as a new release.
Fetch current main and check live receipts before taking the next task.
