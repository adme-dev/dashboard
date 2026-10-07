# Controlled native signup acceptance — 8 October 2026

The operator supplied two real controlled mailboxes and explicitly authorized
Page Studio signup/sign-in emails. Keep addresses and email-link secrets out of
this record. Terms acceptance remains a distinct user action before signup.

## Prepared scope

Source base: freshly fetched Dashboard main `db07d709714e6fcd4724c8f3a3871c0c0698349d`.
Owned worktree: `page-studio-resume-20261007`; branch
`chore/page-studio-signup-acceptance-20261008`.

Temporary preview signup admits only the two approved address digests and expires
at **10 October 2026, 00:00 UTC**. Editor/browser/provisioning preview remain false,
approvals remain empty and Forms remains disabled. Production configuration is
unchanged. The published terms/privacy pages show 2 August 2026; configuration now
identifies that existing terms version rather than the prior synthetic label.
This supports controlled staff acceptance, not general customer launch.

Review found that enabling the old switch alone would admit every preview visitor.
Added bounded optional email-hash/expiry configuration to the existing signup
boundary, retaining generic denied responses and existing rate limits. Nine new
HTTP regression cases failed before the correction; all 58 focused signup/email,
Forms and deployment checks pass afterward. Follow-up independent review approved the scoped boundary with no must-fix
findings. Its oversized-fixture note was corrected to exercise the byte bound
with valid nonempty JSON. Preview build/deployment remain pending.

## Readiness evidence

- Authenticated Resend domain UI reports `adme.net.au` Verified; configured sender
  belongs to that domain. This is sender readiness, not delivery evidence.
- Preview Hyperdrive `3865ea5568234fc7b0e9e3e595a30286` is
  `xeroflow-page-studio-control-staging-db`, targeting
  `ep-raspy-water-a4v6q356.us-east-1.aws.neon.tech` / `neondb`.
- Neon branch `br-long-mountain-a4f73v10` in project `square-tooth-23821574` is
  `staging/page-studio`, non-primary/non-default. Read-only queries confirm account,
  session, workspace, owner and site-request tables; neither test account exists.
- No account, email, database mutation, expired approval renewal or deployment has
  occurred at this checkpoint.

## Next / closeout

Deploy the reviewed clean source through `pnpm deploy:check` and
`pnpm deploy:preview`; retain exact source/deployment IDs. Prepare both supported
signup forms, obtain user terms acceptance, send the authorized messages and verify
actual provider delivery. Let the user complete email verification normally; never
extract authentication cookies or copy email-link secrets into evidence.

Continue the [native hosted matrix](2026-10-02-native-forms-acceptance.md) with fresh
exact workspace approvals. Revert temporary signup-enabled configuration after
acceptance and deploy/read back the closed gate; retain account/setup receipts.
Expiry is a backstop, not a substitute for cleanup. Rollback preview reference is
`875b42c1-d085-4303-879c-dad1beca293d` from clean `12d2b3226`; preserve existing
renderer while referenced. Production remains `8810de23` from `1ab514938`.
