# Page Studio resumption — 7 October 2026

The user requested all remaining Page Studio work. The goal remains active.
The recovered [canonical PRD](../prd/page-studio-customer-cms-prd.md) retains its
24 RND tasks; [customer-cms-status.md](customer-cms-status.md) records the later
form/template implementation. Neither local tests nor a closed preview complete
hosted acceptance.

## Current source

Dashboard integration branch `feature/page-studio-resume-20261007` combines main
`eeefcc40f5514f4444b4d1021af174b588a28a2a` with saved feature
`9a5e00c020b70d6481e1936104349dd331c1ecf9` (previously 10 behind / 67 ahead).
The local merge checkpoint has no conflicts. Fresh fetch confirms its main parent.
The checkpoint preserves work; it is not a releasable artifact or production merge.
Durable worktree: `/Users/paulgiurin/Documents/Projects/page-studio-resume-20261007`.

Studio remains clean at `6adea020968da49c9a0aa46ff7665b0872b976e9`, branch
`feat/customer-form-settings-drafts`, including main
`50d372e1cb0bc92a661379866062dbe75a4539d0` with 29 additional commits.
Original development workspaces and the durable Fantasy Limo demo are preserved.

Dashboard PR #599 and Studio PR #108 are merged; their earlier incomplete handoffs
are superseded. The native customer stacks Dashboard #602–613 and Studio #110–118
remain open. Preserve subsequent feature-branch work when reconciling those PRs.
The seven canonical planning artifacts were restored byte-for-byte from PR #601
branch checkpoint `99a404db7d668963b84fd69d0edc83eab2b1239d`. ADR-010 remains
proposed; restoring it does not approve its unresolved design choices.

## Reviewed integration corrections

Independent review verified all 39 main-only changed files survive exactly,
including QR, social publishing and Meta changes. Both marketing overlap files
retain both branches' intended text. Native and portal adapters remain separate;
deployment guards and closed native preview gates are preserved.

The pre-correction run recorded 2,731 passed, 3 failed and 1,602 skipped tests.
Failures were stale test expectations, now corrected:

- 33 added form/workspace/media/history routes: 17 native, 16 portal, 10 mutations.
 Route inventory becomes 2,230/1,213, retaining 400 inline-guarded and 47 transactional.
- The Meta webhook replaced its config read with `resolveMetaOAuthRuntimeConfig`;
 native Forms added one lexical flag. Gate inventory has 1,596 rows, governance 1,622/unrelated 432, other counts
 unchanged; no God mode mutation bypass was added.
- Manage website intentionally targets `/studio/sites/:id`; `/content` remains
 available from the authorized workspace. The test now checks labels and links.

The prior review covered integration and authority boundaries; it was not a new
review of every historical feature file.

Fresh verification in the durable worktree:

- The three corrected test files passed all 16 tests.
- The Page Studio, QR, portal middleware, deployment/source guards and God mode
  inventory regression run passed 2,734 tests in 261 files. Another 1,602 tests
  in 53 files were skipped because their required environments were not configured.
- The workspace PostgreSQL cases used a disposable local database, now stopped.
- A follow-up run enabled the separately named portal workspace database variable:
  all 19 portal authority cases plus the 16 corrected integration cases passed.
  These overlap the earlier corrected-test run; do not add them as 35 new tests.
- On integration checkpoint `93aaeacf54bb4f0cc40d994c60d8d947f1cf2e8a`, all 17
  previously gated CMS/Astro PostgreSQL files passed: 616 tests, one cross-repository
  runtime case skipped. They used a separate disposable `studio_cms_activation_*`
  database and cover adoption, graph acceptance, commit authority, publication,
  rollback, runtime delivery, staging and checkpoint outbox behavior.
- The remaining public D1 recovery case and connected native action suite then
  passed with the saved Studio source `6adea020968da49c9a0aa46ff7665b0872b976e9`:
  11 selected tests passed; 134 unrelated cases were excluded by the test-name filter.
  Actual local Workerd, D1 and R2 fixtures verified restart/lost-response recovery.
  These are local runtime results, not hosted acceptance. Fixtures were disposed
  and PostgreSQL shutdown was confirmed. Logs: `cms-astro-postgres.log` and
  `connected-runtime.log` in the evidence directory.
- Both staged and unstaged whitespace checks passed.
- The combined build completed compilation but failed the fixed artifact guard:
  raw 25,484,769 / 25,468,928 bytes (15,841 over); gzip 7,036,899 / 9,750,000.
  This candidate is not deployable. The budget and compactor remain unchanged.
- Focused lint passes after fixing one quote-style error. The earlier attempt
  could not load generated configuration while the build was replacing `.nuxt`.

Logs are in `.verification/resume-20261007/`. These checks do not establish hosted
acceptance, delivery readiness or customer production authorization.

## Recovery and evidence limits

The temporary checkout and logs disappeared during continuation. Git retained its
index and merge parents, allowing exact staged-source restoration with checkout-index
and worktree repair. The three unstaged reviewed test edits were reconstructed.
No prior build completion is claimed: its process handle and final logs were gone.
Earlier nested-checkout test attempts never ran assertions because OXC traversed
the outer Dashboard tsconfig. The durable sibling avoids that configuration leak.

New evidence is written under this worktree's ignored `.verification/resume-20261007/`.
Use Node 24.18.0, Dashboard pnpm 10.17.1, Studio pnpm 11.9.0. Private demo data and
credentials stay out of Git. Do not run in the unrelated dirty Dashboard root.

## Next work

1. Retain the reviewed integration checkpoint and its failing build evidence.
   Repair capacity before any preview release.
2. Measure Pages capacity. Last verified 2 October build had 6,152 raw bytes spare.
   Review the [private rendering proposal](2026-10-07-private-email-rendering-proposal.md)
   before adding backend features; do not raise
   the safety budget or change compaction just to fit features.
3. Complete two-customer native signup/provisioning/editor and hosted Forms/template
   activation acceptance using the supported flow and exact retained scopes.
4. Complete AI template proposals with credit admission, validation and explicit Apply;
   then verified senders, notification outbox, published outcomes and safe webhooks.
5. Converge enquiry storage, add operating controls and form reuse/detach, then follow
   the PRD order for domains, invitations/handover, editorial CMS, audience/members,
   bookings/sales and paid subscriptions. Unresolved commercial/domain decisions
   remain explicit; do not invent them.
6. Integrate verified PRs, update marketing from evidence and retire only completed
   owned branches. Production activation remains separate.

Two real user-controlled test mailboxes are still requested and pending. No email
recipients are inferred or messages authorized by that request alone. User terms
acceptance and email verification use supported onboarding. Do not extend expired
approval dates or substitute portal identities for native customer accounts.

## Provider readback — 7 October 2026

Cloudflare project and deployment APIs were read without changing configuration.
Production deployment `c2232396-e128-46b0-9712-19f570e3d170`, created 6 October,
reports success on clean main `eeefcc40f5514f4444b4d1021af174b588a28a2a`.
Latest preview remains `00e6ade1-0d35-4784-8b3b-9a7c62ea298d`, created 2 October,
source `3f48a78455818c1ee617ca06775c5681c9ac69b9`, branch `preview`.
Native browser/editor/signup/preview flags are false and approval list is empty.
No enabled Forms flag was returned. Customer sender syntax and terms are configured,
and a Resend credential is present; this does not verify the sender or delivery.
There is no `TRANSACTIONAL_EMAIL` service binding. Content environment is staging.
No addresses, credentials or tokens were retained in this report.

Independent follow-up review found no must-fix in the three test corrections or
checkpoint/proposal documents. Its two minor wording/caller-inventory comments
were applied. This remains a scoped review, not new whole-feature certification.

No cloud deployment, customer mutation, production activation or remote cleanup
has occurred during this resumption. The renderer proposal requires review before
implementation; two real test mailbox identities remain outstanding.

## Approved renderer extraction — local verification

Implemented the approved private Worker boundary in `1ce1c1d0e`, `5f68bc674`,
`b1a044ef8`. Agency save/preview/test-send now await the environment-bound renderer;
customer previews recheck authority after RPC. The Worker has no privileged
bindings and no public rendering endpoint. Original renderer modules are removed
from Pages; actual module/map inspection passes. No email was sent or customer
access activated. See [service runbook](../runbooks/email-rendering-service.md).

The unchanged Pages guard now passes: raw **25,408,250 /25,468,928**, leaving
**60,678 bytes**; gzip **7,019,987 /9,750,000**. Raw savings are 76,519 bytes.
This falls 4,858 bytes short of the plan's aspirational64KiB headroom. The boundary
is retained for review because it clears the blocker beyond the unchanged128KiB
provider margin; this does not establish capacity for future roadmap additions.

Full repository run: **15,612 passed /1,939 skipped**, 2,220 passing files and69
skipped files. Skips remain conditional environments, not acceptance evidence.
Strict Worker types, reproducible environment declarations, both target guards,
staging/production dry builds, source and emitted Workerd RPC tests pass.
Independent review, exact type-baseline comparison and hosted staging acceptance
are pending; these local results do not authorize production customer activation.
