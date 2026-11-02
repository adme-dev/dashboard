# FigFlow EDM developer handoff

**The supported saved-draft content workflow is live and accepted, 2 November
2026.** Start from the [completed milestone](figflow-roundtrip-milestone.md) and
[production activation receipt](figflow-production-activation-20261102.json).
The [parent plan](../superpowers/plans/2026-10-30-figflow-edm.md) and
[PRD](../superpowers/specs/2026-10-30-figflow-edm-design.md) track the larger scope.

**Read the [real-template beta](figflow-beta-20261102.md) before the next task.**
Electric Drive passes native heading edit/review/Apply/reload; FuturaX opens blank
with zero editable fields. Six of eleven starters have zero editable fields in
local preflight. The standalone `/0.11.2-flow1/` build has no template browser.
Next bounded package: B01, an honest zero-editable-field admission guard and
composer fallback. B02–B05 track mapping, library, mobile triage and client proof.

## Staff workflow

Open a supported saved draft in the email composer and choose **Edit in FigFlow**.
Library originals require an independent draft. Edit supported text/image/button
content in the native content view, choose **Return for review**, inspect the
rendered email and field changes, then **Apply and save changes**. Apply is one
composer Undo step. Staff can edit/save in the composer and reopen FigFlow while
retaining those edits. Unsupported layout/style/linked-module changes are rejected.

## Current production

- Pages deployment `e2a2ff7e-96ea-4fa8-94f0-922bb00c4720`, source
  `ad9f18d6f6952a9587b5e03f1ad850041198d63b`; app.xeroflow.io.
- Private design Worker version `bbc8fb52-01cc-456d-9a1c-2b58728cf4fb`, source
  `0dc1274f85b2ea99d9104dd7cf4538c43088dbca`; no public endpoint, capability true.
- Migrations 491–493 applied to the verified production database.
- Native assets version `86f446f6-f9de-4ce1-b6af-10a0bf722cb1`; Creative gateway
  version `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce` retains its previous assets/secrets.
- Raw Pages Worker 25,468,436 bytes; 492 remain under the unchanged safety budget.
  Production adds no new presentation text binding. Staging remains disabled.

The private Worker uses fixed-origin canonical `/api/auth/me` verification and
needs no JWT_SECRET. Pages retains the original signing key and unchanged verifier.
Each session/access check keeps fresh database revocation/roles/client scope.
The `global_fetch_strictly_public` flag is mandatory for hosted auth routing;
local tests alone cannot prove same-zone routing. Build and deploy guards require
the reviewed authority implementation, exact targets, current source and private
exposure. Never replace this with caller actor headers or a second login system.

## Verification and recovery

Production proof includes native canvas mouse/keyboard edits, proposal isolation,
rendered review, explicit Apply, canonical content/HTML persistence, one Undo/Redo,
a composer CTA edit/save, second native return preserving it, and final reload.
Stale save returned 409 with head/content preserved; anonymous lookup returned 401.
The named synthetic verification draft is retained with immutable history; no
customer content or sending was involved. The receipt records its ID and hashes.

Unknown writes retain their exact operation payload. Reconcile that action before
new edits or retries. The rollout's temporary auth 522 was diagnosed content-free,
fixed via guarded Worker routing configuration, and its pending action reconciled.
Do not infer failure from a lost response or blindly repeat mutations.

Previous disabled Pages artifact:
`41fd8581-10e0-4d4a-ac7b-dc1bacf8fdcd`; private disabled version:
`29ab0af9-7309-4ee2-82d7-ee473b4fc5de`. Reconcile current main/live source and use
the appropriate guarded release/rollback. Preserve additive schema and history.
Do not rerun the one-time creative promotion against its old pinned baseline.

## Next contributor tasks

| Work | Boundary |
|---|---|
| Shared modules (F07) | Existing scoped library in both editors; preserve immutable pins/overrides and explicit update/conflict choices. Current handoff rejects linked-module designs. |
| Publication/assets (F03/F04) | Private staging, reconciled durable asset lifecycle and immutable publication. Reuse canonical libraries, renderer and authority; no second writer/send pipeline. |
| Client acceptance (F09/F10) | Exact Apple Mail/Gmail/Outlook rendering matrix and preflight/send gates. Current production proof does not establish those client variants. |
| Broader native mapping | Agree conversion/policy with all owners; preserve layout/mobile/lineage and reject unsupported edits. Native content view is not a faithful email-client preview. |

Kimi implemented native integration; Grok supplied relay/persistence review; Codex
integrated/released, with independent source review. Native source remains pinned
under `workers/craft-editors/` and CI 41296329622; no new Rust build is needed for
an unrelated backend task. Use Node 24.18.0 and targeted checks at the end of a
bounded implementation, as requested. Do not rerun unchanged passing suites.

The original dirty `xeroflow-email-builder-20261030` checkout and shared node_modules
were preserved. The owned release checkout is retained with evidence for further
contributions. Start each new branch from freshly fetched main, not a retained
release branch. The disposable test PostgreSQL cluster is stopped after acceptance.
