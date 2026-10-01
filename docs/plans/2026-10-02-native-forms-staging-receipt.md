# Native forms staging release — 2 October 2026

## Scope and status

Native runtime/storage setup and explicit scoped draft capability are implemented
and independently reviewed. This release deploys the matching backend with customer
activation closed. Hosted two-customer acceptance and production promotion are pending.
The local Fantasy Limo demo on port 3044 remains intact.

## Source and Pages receipt

- Dashboard source: `5b9b978e0ee2f19b68428fc25e0ea9fb9003fc36`.
- Freshly fetched Dashboard main: `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`; ancestor verified.
- Target: `agency-dashboard`, branch `preview`; guarded `pnpm deploy:check` and
  `pnpm deploy:preview` from the clean isolated `customer-cms-release` checkout.
- Pages deployment: `9fef28bd-b866-4d8a-be04-1dcefbf686de`.
- URL: https://9fef28bd.agency-dashboard-6cm.pages.dev
- Alias: https://preview.agency-dashboard-6cm.pages.dev
- Provider deployment readback matches source `5b9b978` and preview branch.
- Final build size: raw 25,457,777 / 25,468,928 bytes; gzip 7,026,778 / 9,750,000.
  Existing limits preserved. Raw headroom is 11,151 bytes.
- Chrome visible-UI checks after deployment: signed-in `/studio/sites` loads;
  `/agency/qr-codes` loads its existing synthetic QR entry and navigation.
  This does not establish native form save acceptance.

## Private worker and migration receipt

Studio source: `e26199556cdcb33780500482ed74c4f9db53f622`; freshly fetched main
`50d372e1cb0bc92a661379866062dbe75a4539d0` is an ancestor. Source tree was clean.
Normal pre-commit hook checked 1,544 files in 631 seconds with no fixes. Both
implementation branches are pushed. All three private deployment dry runs passed.

Coordinator database: `xeroflow-provisioning-staging`,
`f19256aa-ddb6-47fe-b7e9-7287d0be6a19`. Migrations 0011, 0012 and 0013 were applied
in order and read back in the D1 ledger. Form upgrade/runtime/capability tables all
contain zero rows. No customer D1 schema was modified directly.

| Private staging service | Version at 100% | Deployment ID |
| --- | --- | --- |
| xeroflow-provisioning-executor-staging | `0a8cd82c-9f03-4f46-a2fd-4081d71c513d` | `e8f9e437-b6bc-45c7-8d26-784e0ba88f0a` |
| xeroflow-provisioning-staging | `5237b912-4268-4a09-a4c5-5fcdcc226f2d` | `89eeee1f-1fc5-4ca7-ae0c-4c858f6203a4` |
| xeroflow-content-router-staging | `efb24dbe-dd5d-4754-9be0-f44649edafa6` | `66e9ca7e-0732-45eb-a724-74b4af75c714` |

Provider version metadata confirms the exact staging D1, private service bindings
and `xeroflow-page-studio-dispatch-staging` namespace. The form runtime policy is
absent. Existing coordinator cron `* * * * *` is preserved; no public worker route
was added. Readback files are `native-forms-{executor,coordinator,router}-after.json`
and corresponding `-version.json` files. Dashboard native gates remain false and
approval list empty. The expired hosted workspace still displays Website unavailable;
site list and agency QR Codes remain accessible through their existing signed-in UI.

Prepared customer runtime candidate (not uploaded or enabled): SHA-256
`2e88e4447eacd5cec74ead599214dd1e8584d1ed6702b1a8c6f511d4ceb9790e`, 904,968 bytes,
compatibility date `2026-08-18`. Manifest digest and actual bytes match. Keep its
`releaseApproved:false` status until exact native scopes and hosted acceptance are ready.

## Local verification

Studio: build 28 tasks; types 44 tasks plus security types; lint 1,544 files;
full root tests 40 package tasks, 36 security tests and 48 action-runtime tests.
Business worker has 1,046 passing tests; Sandbox 900. Dashboard focused regressions
pass 78 tests, including 46 real local PostgreSQL cases. Independent final scoped
review approved the running-status and bounded integration-test deadline fixes.
Dashboard full typecheck retains the existing 934-diagnostic baseline; it is not green.
Normal commits and release guards are used, without bypasses.

## Retained design decisions

Runtime and storage setup retain separate native authorization identities and
recovery histories. Setup completion does not activate CRUD: a separate retained
capability binds exact scope, runtime and physical receipt. Ordinary CRUD uses the
current caller and does not require the original setup user to stay logged in.

## Remaining acceptance

Source audit after deployment found an additional prerequisite: the existing Forms
UI and HTTP handlers use the invited-client session, while native self-service
sign-up has a separate account/session. The native CMS authority/UI adapter and a
private activation caller must be completed before claiming browser acceptance.
See the [integration and acceptance plan](2026-10-02-native-forms-acceptance.md).

Two fresh native test identities are required because previous preview approval
expired. Their email addresses were requested and are pending; no sign-in email
has been sent and no replacement approval manufactured. The original immutable
approval and entitlement cannot be repaired by changing an expiry date alone.

After supported sign-up/approval, finish CMS prerequisites, select reviewed runtime
bytes and exact scopes, run runtime then storage setup, verify physical receipts,
and explicitly call private `PROVISIONER.activateFormDraftsCapability(fullScope)`.
The Dashboard setup handler currently stops at installed storage; it does not call
activation automatically. Test all three draft types, audience independence, stale
writes, cross-customer denial, recovery, revocation and old CMS behavior. Preserve
uncertain operations and use readback rather than blind retries. Close temporary
test gates afterward. No email sending, public form delivery or production promotion
is claimed or enabled by this release.

## Evidence and rollback

Local logs: `customer-cms-demo/private/native-forms-*` and
`native-form-dashboard-{build,types}.log`. Detailed SDD reports remain in Studio
`.superpowers/sdd/2026-10-02-form-native-integration/` while hosted work is pending.

Previous verified Pages deployment: `2632007c-c8b9-4a4a-9b7e-840da2e830b9`, source
`fb1e1b61069ba95c0848b2d787ba8872d4166eab`. Private worker rollback versions are
recorded in `native-forms-staging-rollback.json`. Leave additive coordinator tables
and immutable history intact during a code rollback. Keep feature configuration
closed until hosted acceptance passes.

Completed isolated build checkout `customer-cms-release` was clean, had no open
files/processes under it, and was retired after deployment verification. It contained
2.9 GiB of disposable build/dependency files. Logs and source commits remain in the
retained repositories/private evidence directory. Active implementation branches and
the local demo are preserved; they are not obsolete release bases.
