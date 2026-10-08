# Controlled native signup acceptance — 8 October 2026

The operator supplied two real controlled mailboxes and authorized Page Studio
signup/sign-in emails. Keep addresses, cookies and email-link secrets private.
Terms acceptance and normal mailbox verification are user actions.

## Current candidate

Refresh the controlled preview from current Dashboard main
`008f8c8dd2357837b3586fab8fc9a5b577f8cdeb`, in the owned
`page-studio-resume-20261007` worktree on
`chore/studio-signup-preview-refresh-20261008`. Preserve the original acceptance
branch as historical evidence until the new deployment is verified.

The only configuration difference from main is the existing temporary preview
signup policy: the same two approved address digests, expiry **10 October 2026,
00:00 UTC**, existing terms version `xeroflow-terms-20260802`, and verified
XeroFlow sender `notification@xeroflow.io`. The preview origin remains
https://preview.agency-dashboard-6cm.pages.dev. The private Cloudflare email
service binding is already on main. No Resend fallback is introduced.

Editor/browser/provisioning and Forms activation remain closed, and approvals
remain empty. Production configuration is byte-for-byte unchanged. This branch
must never be merged into main while temporary signup is enabled.

Current main adds the host-prefixed HTTPS customer session cookie. Old preview
cookies are not accepted after refresh; use normal fresh sign-in. The guided
signup design, Automotive topic, fourteen goals and scrollable topic picker are
retained. A is email-verified; B verification and both workspace setups remain
pending at the last readback. Earlier provider delivery does not prove a current
usable browser session. Do not mint or extract authentication cookies.

## Verification and release

Run the existing signup, Forms cookie-boundary, email and deployment-policy
regressions. Compare the final configuration against main to prove only the
preview policy changed. Deploy the clean reviewed candidate through
`pnpm deploy:check` and `pnpm deploy:preview`, recording exact source and provider
deployment IDs. Verify the hosted signup UI and ordinary access denial before
starting customer acceptance. Do not claim a new email was sent unless a new
request and delivery were verified.

Previous preview: `18797d36-b78c-4102-863d-915d6a168520`, source
`11f1a912ce7364815183945aa6edda5066457c74`. Production remains
`a7190881-c08b-43b0-9016-296bc4998752`, source `008f8c8dd`, with native
customer gates closed. This preview refresh does not activate production.

## Hosted acceptance and closeout

Complete supported verification and onboarding for both accounts, then follow
the [native hosted matrix](2026-10-02-native-forms-acceptance.md) using fresh exact
workspace approvals and retained runtime/storage receipts. Existing immutable
approvals cannot be renewed by merely changing entitlement dates.

Close the temporary signup gate and private caller after acceptance and verify
the deployed closed state. Expiry is only a backstop. Preserve account/setup
receipts and resources needed to resolve uncertain outcomes. Native production
activation remains pending explicit authorization.
