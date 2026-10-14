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
session/workspace model remains separate. It does not yet expose a portal publish
endpoint. Client actor attribution, approved artifact promotion/rollback routes,
launch UI and hosted acceptance remain required before enabling self-service.

Validation: both admin/manager admission tests failed before implementation;
41 real PostgreSQL portal authority cases pass after implementation, including
access withdrawal before and during a transaction. The full selected agency,
Astro, runtime route and portal preparation group passes 135 tests. Changed-file
lint passes. No new migration, deployment, customer publication or test email has
occurred at this checkpoint.

## Remaining work (preserved)

- Client actor attribution and publish/rollback integration, with scoped audits
  and immutable approved build checks.
- Production compiler registration and approved artifacts for imported sites.
- Cloudflare service credential repair and isolated end-to-end DNS/TLS proof.
- Hosted form insertion, per-form/shared settings, template/media and delivery
  acceptance; viewer/membership/capability withdrawal tests.
- Native progress-card accuracy and editor/save performance.
- Current-main release and live verification, including QR Codes and all four
  existing previews. Customer production activation remains separately gated.
- Public documentation/marketing only when the corresponding customer-facing
  functionality is actually available.
