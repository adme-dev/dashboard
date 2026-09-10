# Staging editor browser launch — 11 September 2026

The deployed portal could issue signed sessions but could not launch Studio:
preview had an empty editor URL, and portal CSP allowed only same-origin form
submissions. A popup inherits that CSP.

The portal Website Builder pages now allow form submissions to the configured
HTTPS editor origin. Empty, invalid, credential-bearing, wildcard and directive-
injecting configuration retains the same-origin policy. Other portal pages and
API responses keep their existing form policy and hardening headers. Preview
configuration selects `https://studio-staging.xeroflow.io`.

Cloudflare Sandbox staging version `462e5828-091c-45d1-b5ce-67ecdf93d2d9`
serves that origin plus the exact synthetic workspace custom domain. The Worker
still checks signed identity, capabilities and its two-site pilot allowlist.
This does not enable arbitrary customer editor hosts or production provisioning.

This preview also copies the reviewed production setup fixes from `c2719e4d8`:
latest-revision approval locking, explicit environment-scoped provisioning authority,
and retained confirmation topics for unverified business details. The preview
provisioning environment is explicitly `staging`; generation-2 production remains
disabled. No migration or real-client approval is performed in this change.

Verification: the launch-policy regression failed before the change; all 17
portal middleware tests now pass. Combined setup/authority/portal checks: 101
tests across nine files pass. All 39 approval/authority tests also pass against
an isolated localhost PostgreSQL cluster, including concurrent proposal decisions
and immediate revocation. The deployment target guard passes for
`agency-dashboard`. Browser launch/save/reconnect and deployed preview readback
remain pending until this release is built and published.

The synthetic portal website list is `/portal/page-studio`; there is no portal
`/portal/page-studio/:siteId` detail page. Real Fantasy Limo remains a draft at
`https://app.xeroflow.io/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.
