# Customer launch completion — 15 October 2026

Continues the domain launch ledger and the customer CMS status checklist. This is
an implementation checkpoint, not evidence that customer self-service is live.

## Recovered baseline

Fresh branch starts at main `6b82be128f29101324f4d3db7930ec30f45d1d7d`.
Cloudflare readback identifies this same source on production Pages deployment
`630ec0a3-4db8-4b4c-98a8-bcd635314be1`. The original Dashboard working tree is
unrelated and remains untouched. The earlier temporary domain checkout no longer
exists; its merged history remains on main.

The user supplied two test mailboxes for hosted account/form acceptance. Keep
their addresses in the private acceptance record; do not infer other recipients.
The Cloudflare browser still requires sign-in. The last verified domain-provider
failure is HTTP 403; credential repair and the retained test-hostname verification
remain outstanding.

## Publication boundary

The existing agency publication transaction is extended for invited portal
clients. It requires an active admin/manager account in the site's business,
editor membership for the exact tenant/client/site, a current original portal
session and login binding, and an active entitlement with domain capacity.
Checks run before and after publication SQL. A change during the operation rolls
back its effects. No role, allowance or membership is granted by this work.

Portal login preparation reads the retained binding after registration: repeated
login resolution gives a new in-memory issuance timestamp, while the original
binding intentionally retains its first timestamp. This avoids rejecting an
otherwise valid returning publisher. Revoked bindings remain denied.

This boundary does not accept standalone native customer identities; their
session/workspace model remains separate. Launch UI, production artifacts and
hosted acceptance remain required before enabling self-service.

Validation: both admin/manager admission tests failed before implementation;
41 real PostgreSQL portal authority cases pass after implementation, including
access withdrawal before and during a transaction. The full selected agency,
Astro, runtime route and portal preparation group passes 135 tests. Changed-file
lint passes. No new migration, deployment, customer publication or test email has
occurred at this checkpoint.

## Portal release integration

Migration 452 adds separate client publisher/updater references alongside the
existing staff references. Constraints prevent a row from carrying both kinds.
Publication and rollback audits retain the real actor kind, and idempotency cannot
be reused across staff/client actors even when UUIDs match. Historical service
audit rows remain replayable by the original agency publisher. Agency release
history displays client publisher names within the same client scope.

The additive migration was applied to the configured database on 14 October at
22:03:37 UTC. Before/after snapshots verified all sites, entitlements, retained
release fields and live pointers unchanged. The new constraints are validated.
The application has not been deployed with these changes.

The portal now has local production-only static activation and rollback handlers.
They require an authenticated same-origin JSON request, strict input, an explicit
expected live release and an idempotency key. Ownership and actor identity come
from the original authenticated session. The selected domain must belong to the
exact site and have verified ownership, DNS and HTTPS. Access/domain checks run
before artifact reads and again inside the publication transaction. Remote
artifact verification runs outside database locks. Only retained approved
production Astro artifacts are accepted; runtime and feature release activation
remain separate and fail closed here.

The combined agency/static/runtime/portal test group passed 361 cases with one
existing conditional skip. A further rollback actor-kind regression was added
during review. Full-suite and final typecheck results are recorded separately;
the existing repository typecheck is not clean. No customer release was activated
and no test email was sent. Browser readback confirms the preview signup window
is expired; Cloudflare still shows its login page.

## Remaining work (preserved)

- Customer-facing launch controls and native-customer publication integration;
  invited portal backend integration is implemented locally.
- Production compiler registration and approved artifacts for imported sites.
- Cloudflare service credential repair and isolated end-to-end DNS/TLS proof.
- Hosted form insertion, per-form/shared settings, template/media and delivery
  acceptance; viewer/membership/capability withdrawal tests.
- Native progress-card accuracy and editor/save performance.
- Current-main release and live verification, including QR Codes and all four
  existing previews. Customer production activation remains separately gated.
- Public documentation/marketing only when the corresponding customer-facing
  functionality is actually available.

## Preview acceptance window and final checks

The full serial suite passed: 2,270 test files and 16,122 tests, with 76 files and
2,144 tests skipped. The production build passed its raw/gzip Worker budgets.
Typecheck remains unsuccessful with 943 repository diagnostics; none identified
in the changed publication source. This is not a clean repository typecheck.

A new preview-only native sign-in window is restricted to the two user-supplied
mailbox hashes and expires 15 October 2026 at 10:30 UTC. Original workspace
preview/build approvals retain their expired timestamps; this does not renew
their grants, change customer roles or enable production signup. Close this
window when hosted acceptance finishes. Configuration alone does not prove
email delivery, account creation or customer publishing.

## Hosted preview readback and expired-capacity fix

Guarded preview deployment `51dbd832-48ed-410a-8445-5aa01efe03f9` serves source
`c5a61cc0acdc667979adbc92e8d44150492a8ab9` at the stable preview alias. Cloudflare
readback confirms production remains `630ec0a3-4db8-4b4c-98a8-bcd635314be1` from
main `6b82be128`. Migration 452 is also applied to the isolated staging branch;
all four constraints validated and retained release/pointer digests unchanged.
All four existing customer previews return HTTP 200 with no-store responses.

The hosted native dashboard exposed a 403 when optional CMS availability reused
expired preview authority. Availability now independently rechecks the current
native login and workspace owner before returning false. CMS setup reads and
mutations still require the full unexpired preview authority. Real PostgreSQL
regressions reproduce both expired capacity and no-preview failures before the
fix, and cover four native access withdrawals. The targeted group passes 31
tests; independent source review found no blocking issues. This follow-up is
not yet included in the preview deployment above.

A normal sign-in email was requested for the first supplied mailbox through the
UI. Inbox delivery and completion of the link remain unverified. The original
two native preview policies and entitlements are expired and have not been
extended or replaced. Fresh hosted CMS/editor acceptance therefore still needs
a supported, reviewed test-site lifecycle; changing the signup window does not
authorize an expired site.
