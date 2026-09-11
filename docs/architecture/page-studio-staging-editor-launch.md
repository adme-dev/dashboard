# Staging editor browser launch — 11 September 2026

The deployed portal could issue signed sessions but could not launch Studio:
preview had an empty editor URL, and portal CSP allowed only same-origin form
submissions. A popup inherits that CSP.

Portal documents now allow form submissions to the configured
HTTPS editor origin. Empty, invalid, credential-bearing, wildcard and directive-
injecting configuration retains the same-origin policy. Every portal document needs this origin because sidebar navigation preserves
the document CSP; portal APIs keep their existing form policy. All other
hardening directives remain unchanged. Preview
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

Verification: the launch-policy regression failed before the change; all 19
portal middleware tests now pass (including three sidebar-navigation cases that
failed before correcting the initial URL-only policy). Combined setup/authority/portal checks: 101
tests across nine files passed before the two additional middleware cases. All 39 approval/authority tests also pass against
an isolated localhost PostgreSQL cluster, including concurrent proposal decisions
and immediate revocation. The deployment target guard passes for
`agency-dashboard`. Browser launch/save/reconnect and deployed preview readback
remain pending until this release is built and published.

The synthetic portal website list is `/portal/page-studio`; there is no portal
`/portal/page-studio/:siteId` detail page. Real Fantasy Limo remains a draft at
`https://app.xeroflow.io/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2`.

The first preview build was stopped before deployment to include the
client-side-navigation correction. Browser acceptance remains pending.

## Browser Origin regression

Preview `4f2b5884-5d3d-4977-8959-85998ab2fafc` deployed source
`f4a434c52a9ec10eb6218460c0bc6abd081334ac` successfully at
`2026-09-10T22:56:58.440701Z`. Live portal headers contain the exact staging
form destination, and the Launch Studio button is visible after sidebar navigation.
A desktop accessibility click creates the popup and reaches the staging Worker,
which rejects its null Origin. Synthetic JavaScript clicks are separately subject
to Chrome's popup blocking and must not be mistaken for successful UI acceptance.

The popup inherits the portal's `no-referrer` policy. HTML form POSTs under that
policy send `Origin: null`. The popup document now explicitly selects
`strict-origin`, retaining only the origin and suppressing HTTPS-to-HTTP referrers.
The main portal still uses `no-referrer`; Worker origin checks are unchanged.
[MDN documents the effect on Origin](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy).

A real Chrome regression served the exact launcher HTML under a `no-referrer`
response header at localhost:4381 and submitted synthetic fixture text to :4382.
Before the meta change: POST Origin was `null`, with no Referer. After: Origin was
`http://127.0.0.1:4381` and Referer was `http://127.0.0.1:4381/`. No real token
was used in this regression.

## Deployed browser acceptance and remaining runtime failure

Preview `4a733703-70c9-40f2-ac95-9afdc4879353` deployed clean source
`30e73b87b099d75db96cf48b60e904fe2bed9f26` successfully at
`2026-09-10T23:59:14.842405Z`, independently confirmed through Cloudflare.
Chrome DevTools then completed real magic-link verification and a trusted click
on Launch Studio. The signed popup exchange reached the exact staging workspace
and rendered both desktop and mobile previews plus the canonical editor controls.

Editing the homepage SEO description and leaving the field displayed `Saved`.
Checkpoint `checkpoint_6bdf3b8c-cf93-4113-a8d9-d1dfa4af219c` was recorded at
`2026-09-11T00:09:56.482Z`, digest
`25abd3b3fdcd75be873d49b7067db430bdb10c7844716fdcdc267e7d28bf164d`.
Independent R2 readback validates the 7,355-byte snapshot, its scope, matching
digest and exact synthetic description. Reconnect restored that description.
However, one iframe returned HTTP 410 `STALE_PREVIEW_URL`; a repeated reconnect
subsequently showed that error in both frames. Full reconnect acceptance remains
open until runtime recovery is fixed and retested. Durable save is independently
proven; no real customer content or business runtime was provisioned.

The portal launch button also remained disabled after a successful handoff.
Its loading state now resets in `finally`. A mounted Vue regression failed on
successful handoff before the fix and now verifies repeat launch after success
and failure, plus duplicate-click suppression while pending. The focused launch,
creation and portal-policy suite passes all 23 tests; changed code passes ESLint.
