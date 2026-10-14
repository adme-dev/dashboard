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
