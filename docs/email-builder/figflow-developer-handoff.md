# FigFlow EDM developer handoff

Updated 2 November 2026. The content-round-trip implementation is merged and
production artifacts are deployed, **with the feature disabled**. The next step
is authenticated hosted activation, not another rewrite of the editor or draft
storage. Read the [milestone ledger](figflow-roundtrip-milestone.md) and
[machine-readable release receipt](figflow-release-20261101.json) first.
The [implementation plan](../superpowers/plans/2026-10-30-figflow-edm.md) and
[PRD](../superpowers/specs/2026-10-30-figflow-edm-design.md) remain canonical for the
larger module/publication/send-readiness work.

## What is merged and deployed

[PR #807](https://github.com/adme-dev/dashboard/pull/807) merged as
`b63cd1e59bebcbc6f88d698f7eac62ee52953924`. Release readback verified:

- Pages `agency-dashboard`: deployment `41fd8581-10e0-4d4a-ac7b-dc1bacf8fdcd`,
  serving app.xeroflow.io. Raw Worker 25,468,500 bytes; 428 bytes remain below the
  unchanged budget. Pages mounts the design-only proxy and EMAIL_DESIGN binding.
- Private design Worker: version `29ab0af9-7309-4ee2-82d7-ee473b4fc5de`.
  Flag false, no public endpoint, matching JWT_SECRET still absent.
- Migrations 491–493 committed together to the verified production database.
- Native private assets: version `86f446f6-f9de-4ce1-b6af-10a0bf722cb1`.
- Creative gateway: version `595f31ce-abd5-4e3d-ba7c-b9e1f3f59fce`, deployment
  `89c76119-d31d-4dfe-b438-b778a9235399`; adds the authenticated immutable
  `/figflow/0.11.2-edm1/` prefix and retains old editor assets/runtime/secrets.

Existing template PATCH/DELETE remain local in Pages. Heavy design endpoints run
only in the private Worker. Both frontend and backend capabilities remain off.
An uploaded/deployed package is not proof that a staff member can complete the
hosted workflow. Signed-in composer save/reload, QR Codes/navigation and hosted native startup
passed on 2 November. The temporary verification draft was removed. The canonical
hosted round trip remains blocked by the missing matching signing key.

Rollback references: previous Pages deployment
`77a1835c-c48d-4f72-aaa6-f589307fe225`; previous creative version
`e5de27cd-41cd-456f-a7f7-9a91e0276777`. Keep additive schema in place. Reconcile
fresh main and current live source before any release or rollback; never replay
the one-time creative promotion script against a changed baseline.

## Immediate remaining work

| Action | Owner / acceptance |
|---|---|
| Matching session key | Operator must identify the approved source of the existing Pages JWT_SECRET or provision the same value securely to the private Worker. Existing checked env files, GitHub secrets and shared Secrets Store did not supply it. Never print/rotate it or extract browser tokens. |
| Reviewed activation | Release developer verifies staging schema/service/key, adds staging caller binding where needed, and reviews capability/configuration guard changes. Current scripts intentionally accept false flags only. No ad hoc guard bypass. |
| Hosted round trip | Signed-in staff opens a supported saved draft, edits actual native content, returns, previews/applies, undoes/redoes and saves; a second handoff retains staff edits. Verify client scope, revoked access, stale revisions and uncertain-write recovery on the actual hosts. |
| Established UI | Passed on 2 November: signed-in composer/modules, temporary draft save/reload/delete and QR Codes navigation/records. Hosted native canvas/bridge startup also passed; canonical round-trip acceptance remains open. |
| Full product acceptance | Shared modules/publication and Apple Mail/Gmail/Outlook acceptance remain separate PRD tasks; do not claim send readiness. |

## Contribution boundaries

| Work package | Current status / source owner |
|---|---|
| Canonical conversion | `shared/emailRendering/designComposer.ts`, `designRoundtrip.ts`, existing design contract/adapter. First milestone patches content only and preserves layout/mobile/lineage. Agree mapping changes with native and server owners. |
| Native EDM and relay | Kimi native code; Grok relay/review. Pinned Rust patch and relay under `workers/craft-editors/`; source/lockfile hashes and Linux CI are mandatory. 43 native tests, 15 relay checks and the actual-WASM round trip pass. |
| Durable handoffs | `server/utils/email-marketing/designHandoffs.ts`, `/api/email/design/roundtrip`, migration 493. Reuse canonical revision saver/renderer and payload-bound operation receipts. No second live template writer. |
| Composer controls | `useEdmDesignRoundtrip.ts`, `useEdmBuilder.ts`, `EdmFlyhubBuilder.client.vue`, `EdmFigflowHandoff.client.vue`. Preserve confirmed-write recovery until readback succeeds, explicit preview/Apply, CAS and one undo action. |
| Durable assets/publication | Parent tasks F03/F04 remain open. Reuse existing libraries and scope authority; private staging, immutable publication and reconciliation need separate implementation. |
| Shared modules | F07 remains open. Same scoped library in both editors; immutable pins/overrides, explicit update/conflict choices. Current content handoff rejects linked-module designs. |
| Release | `workers/email-design`, `workers/figflow-edm-assets`, guarded Pages scripts. Source and target checks remain mandatory. |

## Evidence and continuation

Native CI [41296329622](https://github.com/adme-dev/dashboard/actions/runs/41296329622)
built source `018c306c366e3e9cc1d6a02cb51dddbefec65a6b`, an ancestor of the release;
native inputs are unchanged. Archive checksum and deployment hashes are in the
release receipt. The isolated Chromium test uses the real WASM, composer flow,
private Worker and PostgreSQL, with all requests intercepted. Native edits use
the bridge and Nuxt UI controls are stubbed: it does not prove full-dashboard
appearance, native mouse/keyboard interaction or hosted acceptance.

Use Node 24.18.0. The browser case in
`test/integration/emailDesignWorker.database.test.ts` runs only with
FIGFLOW_DESIGN_PG_SOCKET, FIGFLOW_DESIGN_WORKER_ARTIFACT and
FIGFLOW_EDM_NATIVE_PACKAGE set; its helper requires a verified package under an
owned `/private/tmp/figflow-*` directory or `.verification`. Provision the matching
Playwright headless runtime if absent. The retained run log is
`/private/tmp/figflow-actual-native-browser-3.log`; the screenshot is
`/private/tmp/figflow-roundtrip-browser-evidence-20261101/native-before-return.png`.
The owned disposable PostgreSQL cluster is stopped after final verification.
These local paths are evidence pointers, not portable release sources.

The owner requested tight implementation and tests only at the end; that final
verification has now run. Do not rerun unchanged passing suites. Start follow-ups
from freshly fetched main, claim files, and preserve the original dirty
`xeroflow-email-builder-20261030` worktree and shared node_modules. The owned
`figflow-edm-release-20261101` checkout is retained for the remaining activation
and evidence handoff; it is not a permanent release base.


Activation branch checkpoint (2 November): the original key-copy requirement is
being replaced by the existing fixed-origin `/api/auth/me` verifier, as Creative
Suite already uses. The private Worker will not require a signing key. Source
review and local real Worker/PG/native verification pass; follow the dated
milestone ledger for the production build and hosted acceptance before relying
on the older blocker table above.
