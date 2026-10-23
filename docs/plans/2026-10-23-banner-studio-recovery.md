# Banner Studio upgrade recovery — 23 October 2026

## Scope and preservation
Recover the complete Banner Studio work from `feat/banner-effects-panel-20261006` (`752c362e5c3abacf084611731fe0dfa76b68a28e`) onto current main (`961520050d4e6f25330a0f6d67fda9f8095217d9`). Preserve the source branch, original imports and unrelated working trees. DriveChat is excluded. No bulk reimport is part of recovery; existing imported projects must remain intact and reusable.

## Acceptance checklist
- [ ] Inventory banner commits and all direct dependencies; account for every included/deferred change.
- [ ] Recover compact/grid library, source categories/folders, client filters and existing project navigation.
- [ ] Recover TheBrief importer, batch continuation, deduplication, managed asset/font upload and explicit unsupported-content holds.
- [ ] Recover native playback, typography/weights, rotation, gradients, cropping, pulse/fade and text rendering fixes.
- [ ] Recover native effects, reusable scoped presets, AI artwork/review/refinement and native glyph depth/texture.
- [ ] Recover design assistant, client reference/brand guides, revision retention and export retry/handoff dependencies.
- [ ] Preserve newer main fixes; reconcile conflicts rather than replace newer shared files.
- [ ] Verify regression tests, changed-file lint/types, build and guarded deployment target.
- [ ] Browser check library/editor/import preview/effects and established QR navigation; compare saved project IDs and source tags.
- [ ] Review, push/merge, deploy verified artifact and record production receipt. Do not claim completion before these checks.
- [ ] Retire only this task's completed worktree after preserving committed evidence.

## Implementation groups
1. Recover source and dependency inventory, then reconcile current main contracts.
2. Library/import and native rendering regression verification.
3. Effects/AI/export integration verification with private-asset and client-scope checks.
4. Current-main build/preview acceptance, release and receipt.

## UI approach
Restore the established XeroFlow Nuxt UI components, semantic colors, typography and compact creative-library presentation. Keep categories grounded in persisted source tags. Do not redesign forms or replace unrelated navigation; restore prior responsive controls with visible focus and accessible labels.

## Evidence and limitations
The read-only investigation found 187 projects, 169 source:thebrief tags, all165 ledger IDs and155/155 comparable source hashes present. Source hashes do not prove every edited canvas is unchanged. The user's175+ imported count remains to reconcile. Original receipts and report are under Documents/XeroFlow Imports/Investigation2026-10-23 (directory has spaces).

## Primary sources consulted
- https://ui.nuxt.com/docs/components/modal — accessed2026-10-23; Nuxt UI4 component lifecycle/API, applies to recovered import/effect dialogs. Use controlled open state and existing Nuxt UI conventions.
- https://developers.cloudflare.com/pages/configuration/rollbacks/ — accessed2026-10-23; Pages production rollback contract. Preserve the exact prior production deployment and release source. Preview is not itself a production rollback target.

## Release state
Not deployed. Recovery source and verification are in progress. No current release gate is waived; database/provider changes require explicit reconciliation and verification before execution.

## Recovery reconciliation
- Initial171 Banner/TheBrief paths restored with git three-way application from merge-base23ab2f936. All applied cleanly against currentmain.
- Current main Website preparations navigation and newsroom self-authentication route retained; sidebar and signed-video capability changes applied as individual source hunks.
- Current main build compaction supersedes older e18e88532 and is retained. Acorn8.17.0 restored without removing the lockfile integrity check for SheetJS.
- Design references require the shared client-profile reader and historical schema. Renumbered historical migrations444/445/450 to473/474/475 to avoid current-main collisions. Read-only schema inspection found both tables and brand_kit_id already present; no data restore or bulk import performed.
- Importer dedup checks write/client permission before reading existing records. Project/export listing/private download paths check saved ownership; agency projects remain available to their creator or all-client staff.
- The social handoff restores MP4 previews, saved metadata, draft client selection, caption/schedule guidance and saving without a publishing account, while approval still requires accounts. Broader social campaign/live-operation changes excluded.
- Recovered original files retain preexisting style lint findings; introduced changes are reviewed separately. Production build and hosted acceptance remain outstanding.

## Verification checkpoint
- 85 suites /662 tests pass, including real Chromium native texture/depth proof.
- Independent review: importerclient scope/replay, scopedlists, effectscolour fix approved; no unresolved findings from that review.
- Changed-file lint:1763 inherited errors across restored/current code, zero new diagnostics relative to the union of main and recovered source baselines. This is not a repository-wide clean-lint claim.
- Server typecheck has existing unrelated errors; recovered jobs/easing/indexed-regex diagnostics corrected. Full frontendtypecheck inprogress withrepositoryheap ceiling.
- Live audio-jobs worker95d45f5f-0f15-4d26-bad8-9da2b6bf2208 remains100% (deployment40eaeac2-53c7-4d60-bafe-6463bc8a5030). Downloaded artifact SHA2560c39e4b0c116ea04fec2ce830e72a092712aae2a05a5292cab68dabc75839234 contains exact recovered fencing/atomic completion SQL and lease-loss markers; final protocol verification pending.
- Another user session owns Page Studio. This branch does not alter Page Studio functionality, and release guard must recheck currentmain before and after build.
