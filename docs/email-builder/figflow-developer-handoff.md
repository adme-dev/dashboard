# FigFlow EDM developer handoff

Updated 1 November 2026. This is an entry point for contributors, not a feature
completion certificate. The [task ledger](../superpowers/plans/2026-10-30-figflow-edm.md)
and [PRD](../superpowers/specs/2026-10-30-figflow-edm-design.md) remain canonical.

## Active contribution

[PR #807](https://github.com/adme-dev/dashboard/pull/807) implements the first
content round-trip subset on `adme-dev/figflow-roundtrip-20261101` in the isolated
`figflow-edm-release-20261101` checkout. Codex owns integration, Kimi native code,
and Grok relay/review. Read the [active milestone ledger](figflow-roundtrip-milestone.md)
before claiming overlapping files. Backend, composer, relay and bundle checks
pass locally; native compilation/browser acceptance and hosted activation remain
open. The production receipt below is still the disabled foundation.

## What is merged and deployed

- Native source/build prerequisites: [PR #798](https://github.com/adme-dev/dashboard/pull/798).
- Disabled backend foundation: [PR #801](https://github.com/adme-dev/dashboard/pull/801).
- Production application source: `a193e82a52ba107cb1a42db2b55f3f518b9c7caf`.
- Target: Cloudflare Pages `agency-dashboard`, production branch `main`.
- Deployment: `77a1835c-c48d-4f72-aaa6-f589307fe225`,
  [artifact](https://77a1835c.agency-dashboard-6cm.pages.dev).
- Previous rollback artifact: `1fb374e5-2057-46d4-8d66-c51c02802ebb`, source `6bca8f2`.

Cloudflare readback confirmed the production source. After release, the signed-in
composer rendered its modules/Save control and QR Codes rendered its records and
navigation. No production save/delete round trip or email-client acceptance was
performed. The hosted FigFlow editor was not replaced by this Pages deployment.

Existing template PATCH/DELETE still execute locally in Pages through
`templateUpdateHandler.ts` and `templateDeleteHandler.ts`. All
`server/api/email/design/**` routes, including the transport, are excluded by
`nuxt.config.ts`. Pages has no `EMAIL_DESIGN` binding. Setting a flag cannot
activate those excluded routes. Keep this release shape until an explicit,
reviewed activation change is ready.

The foundation contains canonical contracts, capability checks, immutable draft
revision/receipt services, metadata/legacy initialization, paired schema files,
a prepared private Worker and pinned native build inputs. It does **not** deliver
EDM editing in FigFlow, shared-module publication, staff round trips or ready-to-send
cross-client output.

## Working agreement

The owner requested tight development and **no further test runs until the end**
on 1 November. This overrides the older per-task red/green execution convention.
Implement bounded changes and review source as you go; defer automated test runs
to final implementation verification. Do not silently redefine “end” as each
small edit. Record unverified work honestly. Do not disable or rewrite required
release guards to satisfy that instruction.

Start every contribution from freshly fetched `origin/main`; the source commit
above is a release receipt, not a permanent branch base. Claim a ledger task and
list owned files before editing. Send small PRs with exact behavior, dependencies,
remaining work and verification status. Avoid unrelated cleanup, dependency
upgrades, new sending paths or public compatibility claims.

The original `xeroflow-email-builder-20261030` worktree has unrelated dirty work.
Do not reset, clean or reuse it as a release base. The release checkout uses shared
node_modules; do not delete that dependency target. Use Node `24.18.0`. Native
Rust/WASM builds use the committed Linux CI recipe and source pins, not ad hoc
multi-GB installs on this Mac.

## Next implementation and contribution boundaries

The next usable milestone is **one supported structured template round trip**:
open current composer content in FigFlow, edit text/image/button content, return
as an explicit proposal, apply without losing newer staff edits, and save through
the existing renderer. Module publication follows that same contract. No arbitrary
canvas-to-HTML export should be presented as send-ready email.

| Work package | Owner status | Files / boundary | Concrete next action |
|---|---|---|---|
| Canonical/native conversion (F02/F05) | Codex; content subset in review in PR #807 | `shared/emailRendering/designAdapter.ts`, `designContract.ts`, capability matrix; coordinate contract edits with all consumers | Verify the first content mapping in `designComposer.ts` and the pinned native patch against the actual WASM package. Extend mappings only as a separately reviewed follow-up with preservation fixtures. |
| FigFlow EDM mode and bridge (F01/F06) | Kimi / Grok; native/relay packet in CI | `workers/craft-editors/source-pins.json`, native patches and build recipe; `designHandoffs.ts` and `/api/email/design/roundtrip` | Finish native compilation and actual-WASM acceptance for the authored EDM operations, then promote the immutable package through the guarded private asset service. Keep the existing authority and receipt boundaries. |
| Durable assets and publication (F03/F04) | Unassigned; coordinate with conversion owner | Proposed `designAssets.ts`, `designPublishing.ts`, publish route and additive schema | Implement private staging and reconciled storage/database state, source-read/destination-write authorization, immutable publication and payload-bound receipts. Reuse canonical libraries and renderer. |
| Shared modules (F07) | Unassigned; depends on publication and bridge contracts | Existing custom-module service/composable and module menu; FigFlow library panel | Expose the same scoped library in both editors, preserve immutable pins and overrides, and require explicit update/conflict choices. |
| Staff controls and return flow (F08/F09) | Codex; content return implemented, acceptance open | Existing EDM builder/property panels, proposed handoff component, native preflight/sendability owner | Keep normal edits in composer; persist before handoff; preview/apply return as one undoable action with CAS conflicts. Add only controls required by supported mappings. |

No contributor owns unrelated source files by implication. Native and conversion
contributors must agree the mapping before independently changing either format.
Use the existing action envelope in `shared/emailRendering/designActions.ts`;
its presence does not mean publishing/proposal persistence is implemented.

## Activation hurdles and their owners

| Hurdle | Required resolution | Does it block independent implementation? |
|---|---|---|
| Matching service signing key | Operator must identify the approved source of the existing Pages JWT_SECRET or provision the same value securely. Local checked env files, GitHub repository secrets and shared Cloudflare Secrets Store did not contain it. Do not print or rotate it. | No; blocks service authentication/activation. |
| Design schema | Apply migrations 491, 492 and 493 together to the explicitly verified environment before activating current revision writers. None has been applied to production. Existing local template CRUD does not require them. | No; existing disposable database fixtures support final verification. |
| Pages size | Current release has only 690 raw bytes remaining. Restoring transport adds code: remeasure and solve that specific size change without raising the budget. | No; standalone service/native development can continue. |
| Native hosted bridge | The pinned native build prerequisites are merged, but the new browser package has not been deployed/accepted as an EDM bridge. | Blocks real round-trip acceptance. |
| Cross-client email proof | Obtain designated test recipients or rendering-service access; cover the exact Apple Mail, Gmail and Outlook variants in F10. No customer sends. | No; blocks compatibility acceptance and ready-to-send claims. |

Future activation order: finish the integrated behavior; perform final verification;
provision the private service and matching key/origin; apply paired schema on the
verified target; verify hosted staging behavior; explicitly restore the Pages
transport and service bindings in a reviewed release; run guarded release checks;
then verify the live author/save/return/publish flow. Do not enable an unfinished
workflow simply because its foundation has shipped.

## Evidence and final verification entry points

Prior evidence is historical, not a reason to skip verification of new code:

- [Disabled-release review](reviews/2026-11-01-kimi-disabled-release.md): exact source hashes, preserved legacy authority, absent service dependency and deferred schema rationale.
- [Inventory review](reviews/2026-11-01-kimi-ci-inventory.md): exact route/gate changes and no authorization bypass.
- Candidate focused run before the owner's deferral instruction: 398 tests / 24 files passed. Earlier full run had 21,318 passes and two stale inventory failures, subsequently repaired and rerun. Do not describe that full run as green.
- Earlier explicit PostgreSQL/Worker run: 430 tests / 24 files passed; default-skipped database suites are not equivalent evidence.
- Clean production build: 25,468,238 raw bytes, 7,338,615 gzip. Budget remains 25,468,928 raw bytes.
- Local release receipt and preserved artifacts: `/private/tmp/figflow-release-evidence-20261101/production-release.json`. Temporary files may expire; durable source/review evidence is committed and release identities are recorded above.

At the end, use the existing unit/integration suites and the pinned native CI;
include real database CAS/idempotency/revocation coverage, actual Worker/renderer
RPC, both editor directions, module updates, staff-only edits and real-client
output. Source, local runtime, hosted behavior and client acceptance are separate
results. F10/F12 define the final acceptance; none is completed by this handoff.
