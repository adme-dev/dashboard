# Page Studio launcher handoff — 11 September 2026

The website card kept its launch button loading after a successful editor handoff.
Resetting that state in `finally` allows another launch after success or failure,
while duplicate clicks remain blocked during session creation.

The popup explicitly uses `strict-origin` so signed form POSTs retain their origin
even when the parent portal uses `no-referrer`. The form submits in its own popup;
it no longer names a separate browsing target after detaching the opener. The
token stays in the POST body, and the Worker still validates origin and scope.

These launcher changes match the version tested in staging preview `1b291f6e`
(source `062ff5c42`). Real Chrome sign-in, popup launch, browser edit, database/R2
save verification and fresh-session reconnect passed there. The deployed portal
button was enabled again after handoff. Extended-session stale-runtime recovery
remains a separate open issue; this update does not claim to fix that runtime.

The two mounted Vue launch tests pass against this production branch and the
changed code passes ESLint. The real browser origin regression used the exact
launcher HTML; its before/after headers are recorded in
`evidence/page-studio-launch-origin-20260911.json`. Production release verification
must record the deployment separately from this staging evidence.

This backport contains the two launcher fixes and their tests/evidence. Preview
portal policy, self-service provisioning and staging domains remain on their
existing rollout paths. No client setup is approved or published by this change.
