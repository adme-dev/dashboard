# First structured FigFlow round trip

Started 1 November 2026 from main `81b039bb4`, branch
`adme-dev/figflow-roundtrip-20261101`. Owner: Codex; Kimi native integration
research, Grok persistence/authority review. No test runs until the complete
milestone implementation is ready for final verification.

Acceptance: an existing supported template draft is saved, opened in the actual
FigFlow document, edited, returned as a durable proposal, previewed and explicitly
applied through revision CAS and the canonical renderer. Applying is one composer
undo action. A second round trip includes intervening staff content edits.
A conflicting newer revision must remain intact. No send or module publication.

- [x] Canonical composer conversion with stable lineage and restricted content edits.
- [ ] Native import/snapshot bridge with unsupported edits rejected.
- [x] Durable actor/document/revision-bound handoff and proposal lifecycle.
- [ ] Composer open/resume/preview/apply controls and revision-aware saves.
- [ ] Final source review, focused unit/database/native/browser verification.
- [ ] Hosted activation prerequisites, guarded merge/deploy, live round-trip evidence.

Parent owns shared canonical conversion, backend integration, composer controls
and this ledger. Native files stay unchanged until Kimi's mapping is agreed.
Unrelated original-worktree edits and shared dependencies remain untouched.

Ruling: the first milestone supports content changes to mapped text, images and
buttons, preserving layout/mobile/legacy data. Native structural changes that
cannot be represented must produce an actionable conflict, never silent loss.
This bounds the initial usable workflow; arbitrary canvas conversion remains a
separate task in the parent PRD.

Release prerequisite still pending: securely provision the existing matching
Pages JWT secret to the private design Worker. A question is pending with the
owner; no key rotation, extraction from browser state, or alternate auth path.

Implementation checkpoint: parent has authored canonical composer conversion,
content-return restrictions, handoff/proposal persistence and route, native
message consumer, revision-aware composer save/open/review/apply controls and one
undo-action application. These are unverified; no tests/builds have run. Kimi now
owns the native patches/relay and pinned packaging changes. Grok is reviewing the
new persistence boundary read-only. Migration 493 will be applied to the isolated
fixture database during final verification; production activation is separate.

Ruling: proposals reuse `EmailDesignDocument` and the existing revision saver.
No native artifact store or second live template writer is added. For this content
milestone, reopen reconstructs the supported native scene from canonical content.
Unsupported native structural edits must be rejected before a proposal is saved.

Source-review corrections before final tests: reject unsafe integer conversion;
serialize reactive values before cross-window messaging; retain and reconcile
uncertain operation payloads; bind operation IDs to complete handoff commands;
acquire operation locks before handoff/owner locks; preserve local edits across
remote apply; and refuse stale/unprojected canonical baselines. Draft-copy creation
has an explicit unknown-outcome state and cannot be blindly retried in the panel.

Grok source review found separate initialization could strand a legacy snapshot.
The composer now starts initialization, conversion and handoff in one transaction;
failed opens roll back all three. Unknown replies have an explicit retained-action
reconciliation path, and further Save actions are blocked until it resolves.
Native unsaved edits require an explicit discard confirmation on leaving the panel.
Linked-module designs are refused for this first content milestone; reusable module
import/save remains in the parent PRD and is not represented as delivered here.

Grok follow-up (`/private/tmp/figflow-roundtrip-grok-recovery-review.md`) confirms
those recovery fixes by source inspection. A separate bounded template-proposal
validator now reuses the existing envelope while retaining the original campaign
kind restriction. The review panel renders the proposed email through the existing
preview route and requires a successful preview before Apply. Tests are authored,
not yet run.

Native ownership split: Kimi owns Rust engine/bridge/controls, additive patches,
pins, packaging and CI. Grok owns only `figflow-edm-relay.mjs` and its relay tests.
The parent owns composer/backend integration and final cross-boundary verification.

Creative host readback on 1 November: `xeroflow-creative-tools` currently serves
version `e5de27cd-41cd-456f-a7f7-9a91e0276777` at 100%, deployment
`d75c00fc-5168-4ddf-b410-aaf9967c1457`. Static `ASSETS` and both existing creative
secrets are present. The old temporary full asset checkout is no longer available.
Publishing only the new editor asset folder over this Worker would remove the
existing editor assets; native promotion must retain the complete active asset
set or use a separately bound private asset service. No upload was performed.

An opt-in actual-WASM browser fixture is authored in
`test/helpers/figflowBrowserRoundtrip.ts`, invoked by the existing real Worker/PG
suite when `FIGFLOW_EDM_NATIVE_PACKAGE` points to the extracted immutable native
package. It exercises real store/flow/panel logic and native bridge changes with
all network requests intercepted into the isolated Worker fixture. It does not
claim full-dashboard styling, native mouse/keyboard controls or hosted acceptance.
The fixture is still unrun. The private native asset service and guarded creative
version-upload path are also authored under `workers/figflow-edm-assets/`; no
preparation, tests, build, upload or deployment has run.

Final verification started 1 November after the implementation packet was ready.
The initial focused run had 67 passing checks and one expected inventory update:
the sole added lexical row is the composer presentation toggle. Removing that
row reproduces the previous inventory digest exactly; all existing classifications,
seeds and authority assertions are unchanged. The updated inventory passes.

Current local evidence (not hosted acceptance):

- Private email-design Worker build passed.
- PostgreSQL revisions plus actual private Worker fixtures: 73 passed, one native
  browser case intentionally pending the real WASM package. Migrations 491–493
  were applied in disposable fixture databases; production remains untouched.
- Existing email-design/security/deploy regressions: 259 passed across 18 files.
- Post-review conversion/route/composable/panel/inventory checks: 33 passed.
- Asset-service boundaries: two Node checks passed; archive preparation: three
  Python checks passed. No real package preparation or upload yet.
- Relay startup test was corrected to await its observable ready message; Grok
  reported 12 passing relay checks. Further snapshot recovery/race corrections
  and their focused checks are in progress.

Native final review found locked ancestors prevented real canvas hit-testing.
Kimi is correcting container selection and strengthening world-coordinate/image
replacement assertions. Linux native tests, actual WASM browser verification,
full Pages bundle verification and hosted activation remain open. The signing-key
provisioning question remains unanswered; do not turn on either feature flag.

End-stage update: all 15 relay checks now pass, including exact unresolved
snapshot replay and rejecting image bytes when the native revision changes while
they load. Production-file lint passes. Native container selection and the image
replacement/world-coordinate tests are corrected; Linux compilation is pending.

The full Pages build passed: raw Worker 25,468,603 / 25,468,928 bytes
(325 remaining); gzip 7,338,848 / 9,750,000 bytes. This still excludes every
`/api/email/design/**` handler, including the proxy, and has no EMAIL_DESIGN
binding. Hosted activation also requires a separately verified proxy/binding
release within the existing bundle budget; do not raise that budget.

Independent review found confirmed-save/readback failures cleared recovery too
early. The flow now keeps the original operation until the required revision
read succeeds; all nine focused recovery cases pass. Unsupported native image
fill changes must be rejected before URL image replacement; that correction is
being incorporated into the native packet.

Native packet `15cae76de` was pushed for Linux CI. Run 41293959364 stopped before
Rust because setup-node attempted unnecessary pnpm caching. Commit `b597764f3`
disables that cache without adding an install; run 41294060281 passes validation
and is running native tests. Neither run is browser or hosted acceptance.

Grok reviewed private native asset release helpers without finding a concrete
blocker. A local `creative-release.py plan` reproduces the verified creative base
and prepares only its authenticated immutable-prefix routing addition, retaining
assets and the existing secrets. It performs no remote mutation.
