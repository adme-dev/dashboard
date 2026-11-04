# Separate template publication — activation review packet

Status: local source candidate, **not independently approved, pushed, deployed or hosted-accepted**. The proposed production flag is not evidence of a live capability. Staging stays disabled. CUA browser tooling currently blocks hosted acceptance; the release owner must retain that open gate.

## Integrated default-off source

[PR #835](https://github.com/adme-dev/dashboard/pull/835) merged normally on 4 November 2026 at 16:02:53 UTC as `b2f47c3bd4a1ba2c841017346ba1d441d0a18ff8`. Parents are current-main `0a13cb061fec1f3727eb8c6e99a47bd03ebce965` (PR #834) and approved source `bbd7502a9c98d0925b008647c276bcaca134961f`. Its tree `913eadaa154ee4b83ef8a546a213d59fe1a621f1` exactly matches the independently reviewed and CI-tested tree. Both publication flags are false in this merge. Fresh main was checked before the normal `--merge --match-head-commit` operation; no admin bypass, required-check waiver or suppression was used.

Independent default-off source review passed 202 existing and three additional mounted Reka/router cases, with all 25 reviewed file hashes unchanged. [Broad CI 41850717009](https://github.com/adme-dev/dashboard/actions/runs/41850717009) passed the production build and size/isolation checks, 22,410 full-suite tests with 4,271 skipped, plus separately reported social/Pages checks. [Validation 41850717058](https://github.com/adme-dev/dashboard/actions/runs/41850717058) passed Worker checks (343 cases, 24 artifact admission scenarios) and 109 PostgreSQL cases, but its typecheck job failed. [Exact comparison 41850717038](https://github.com/adme-dev/dashboard/actions/runs/41850717038) retains **1,169 absolute errors on both base and candidate, zero introduced or removed diagnostics**, comparing full messages with only line/column shifts ignored. Neither typecheck job is green. These are source-integration receipts, not activation approval or hosted proof.

## Minimal proposed delta

Branch `adme-dev/figflow-template-publish-activation-20261105` starts at that exact merge. Only production `FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED` changes from literal `false` to literal `true`, together with the strict expected configuration in `workers/email-design/deploy.mjs`. Tests and this packet/task ledger document the change. Staging configuration, other flags, bindings, resource identities, Pages settings, application/native code, template-designer=true and the edm4 pointer remain byte-identical to the merge. No migration is added or run; migration 499 is excluded. No public endpoint, new owner, store, parser, rendering pipeline, email or customer operation is introduced.

| Flag | Merged production | Proposed production | Staging |
| --- | --- | --- | --- |
| DRAFT_SAVES | true | true | false |
| TEMPLATE_DESIGNER | true | true | false |
| TEMPLATE_PUBLISH | false | **true** | false |
| DESIGNER | false | false | false |
| LIBRARY | false | false | false |
| BRAND | false | false | false |

All flag names above have the `FIGFLOW_EDM_` prefix and `_ENABLED` suffix. Strict deployment validation accepts exactly one of the 64 combinations in each environment: production draft-save + template-designer + template-publish, staging none. Missing/nonliteral flags, different authority, target, bindings or extra capabilities remain rejected. This candidate deliberately changes the accepted production release configuration; it does not weaken equality checking.

## Permission and command matrix

| Boundary | Proposed behavior |
| --- | --- |
| Session and publisher | Fresh canonical session/read scope; ADMIN or MANAGEMENT plus CREATIVE permission, writable access; revalidated at discovery, transaction and immutable readback |
| Source | Existing persisted **template draft**, current saved head/revision and client scope only; campaign/module/published source refused, including replay |
| Command | Only explicit `publish-template`; copy/revise-template, modules, library/history reads, global designer/campaign and brand remain under their unchanged closed gates |
| Workspace | Separate Publish action; actual native snapshot must equal saved content, fresh metadata/head check, desktop/mobile compiled review, explicit confirmation; Save never publishes |
| Pending/native edits | Unsaved edits and pending writes block publication; active snapshot/review/write locks editing and navigation; name/category changes invalidate confirmation |
| Result | Existing transactional owner creates a new published template/document/revision; original draft ID, head and content remain unchanged |
| Recovery | Unknown result retains the exact operation ID, payload and original CAS/readback callback; modal-contained reconciliation remains reachable; immutable receipt/source mismatch never reports success |
| Stale/revoked | Stale CAS and definite pre-commit denial require a new review; post-commit readback failure remains uncertain with retained payload, not silent discard |

See [implementation contract](template-publish-narrow-gate-20261105.md). The activation does not grant authority through UI capability hints, a process environment fallback or broader library routes.

## Candidate verification

Tests first: the revised deploy suite failed three cases against the default-off source (29 passed), proving the proposed positive state and exact combination were not already admitted. After the two source-line changes, **203 tests across 16 suites pass, zero skipped/todo** on Node 24.18.0 in one worker with an owned cache. These include 32 deployment cases, exhaustive 64-combination matrices per environment, gate/route/access tests, 37 mounted workspace cases, recovery/CAS tests and campaign/successor regressions. Both staging and production `--check-only` commands pass; they perform no deployment or build. The initial check-only run used the uncommitted candidate over the merge; the final report records checks against the committed candidate.

Evidence is retained under `.verification/template-publish-activation-20261105/` (red/green logs, exact command, JSON counts, identity, source preservation, diff and report). Default-off merge receipts are under `.verification/template-publish-integration-20261105/`. Prior 109 PostgreSQL and actual Worker artifact results above are inherited source evidence, not fresh activation runtime tests. Mounted tests use synthetic native/network inputs and do not prove an actual iframe handoff. No heavy local Nuxt build or production DB access was performed.

## Required release and hosted gates

1. Independently review this exact minimal candidate and gate matrix; run relevant remote CI against the candidate and fresh current main. Reconcile any advancement before integration, preserving PR #834 activation, edm4 and all unrelated features. Retain the absolute baseline typecheck disclosure and do not override repository protections.
2. Only after separate activation approval/integration, the release owner uses the existing guarded deployment from exact current main, records source/tree/artifact/deployment IDs and reads back both environments. This packet does not authorize this worker to deploy or mutate the reserved release-root. Keep staging false and all unrelated flags unchanged.
3. When CUA tooling works, root-owned authenticated browser acceptance uses only the owned verification copy `c7105347-e840-59b8-a39d-ea80ab9e5497` and explicitly named synthetic QA blank/starter drafts. Preserve originals and QA labels. Prove direct route and real native iframe handoff, default compiled desktop/mobile output, native edit → review → same-ID Save/reload, saved publication review → explicit confirm → new published identity with unchanged source, revoked/non-publisher refusal, stale CAS and exact-payload uncertain recovery. Exercise modal/leave locks and retained non-designer/campaign fallbacks. No mocks count as hosted evidence; no customer submission, test send or email is required.
4. Report configuration, deployment, hosted application behavior and recipient/mail-client acceptance separately. Hosted acceptance is **pending and blocked by browser tooling**, not waived by the merge or local tests.

Rollback, if required, is a separately reviewed paired change of the production publish flag and its strict expected value back to false, preserving template authoring, edm4 and unrelated settings. Do not discard pending operation identities: disabling publication can block reconciliation until the release owner restores the authorized path. Preserve the operation and recovery evidence rather than attempting a new publication or modifying data directly.
