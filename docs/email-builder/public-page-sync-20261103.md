# FigFlow public-page copy sync — 3 November 2026

Ready for review: concise copy alignment within existing feature entries. This does not activate FigFlow authoring or establish deployment, browser, inbox or release acceptance.

## Scope and availability

- Updated the existing Email Builder catalog description and its `/features/email-builder` detail entry in the Communication category.
- Added one availability sentence to the existing Email Campaigns “Build and Target” section. Existing campaign targeting, delivery and list descriptions remain intact.
- Existing composer sections/starters, supported HTML import and table-based email preview remain described as current capabilities. Imported HTML is explicitly not an automatic conversion to native FigFlow layers.
- FigFlow native authoring, saved template/module versions and campaign workflows are described as being prepared/validated for a controlled staff preview, with general release pending. Native campaign editing and publishing new versions of shared templates are explicitly unfinished.
- Retained rendered review, explicit Apply and protection against conflicting staff edits as preview benefits. Apple Mail, Gmail and Outlook acceptance remains a separate gate.
- Removed the asset “file hash” implementation detail from the import paragraph in favour of keeping OEM originals and review notes for comparison. No OEM fidelity, arbitrary HTML conversion, inbox certification, deployed native campaign/successor publication or external Figma/plugin integration claim was added.

Only these three paths were written by this task:

1. `app/pages/features/index.vue`
2. `app/pages/features/[slug].vue`
3. `docs/email-builder/public-page-sync-20261103.md` (this report)

`app/components/MarketingNav.vue` was inspected and left byte-identical: its Email Marketing link already describes existing campaigns, the visual builder and lists, and points to `/features/email-campaigns`. Its creative workspace entry already labels its discovery connection as preview/development. No new route, menu item, top-level category, feature entry, component, form or style was needed. Other referencing counts/descriptions did not require changes because the catalog inventory is unchanged.

## Source and exact hashes

Observed local HEAD before and after the copy edit: `6c7f60c5586f9d199f2192e25cf76811fd151532`. The pushed c22 CI checkpoint is prior evidence only; it does not validate this uncommitted copy or the concurrent native40/UI/499 work. PR 827 and expanded authoring remain unreleased per the canonical queue and task instruction. No global clean-tree claim is made.

SHA-256 for the changed application files:

| Path | Before | After | Source bytes delta |
| --- | --- | --- | ---: |
| `app/pages/features/index.vue` | `8c1500a1fb4cfe6a3e7246549262e27afa8ae3412a03b48a44036cd9d6b21c60` | `bde86fbafacf41a41a477afdbcb839795caf605d2a16e5fa629e0f313ede3976` | -19 |
| `app/pages/features/[slug].vue` | `ce209bb71122e70b425c6b5c435dd14b20a9ab744119867f39080d0a03aba990` | `e282d42b44ef7d7073adb40e2624e707b33bcff2037b702575275f60eac20485` | +286 |

Combined application source delta: **+267 bytes**. This is raw source text, not a measured Worker bundle delta. No repeated large feature entry was added; all four Email Builder sections were retained. No size guard was changed and no Pages build was run. The known c22 raw headroom of 59,122 bytes applies to c22 only; the next coherent candidate still needs its own build/budget checks.

Unchanged MarketingNav SHA-256: `74e35936595515e91ec22fd64a43633ffbbfef6562829dd39d6e03be9123203f`.

Availability references read (unchanged through this task):

- `AGENTS.md`: `5fc97fa17118c369b33f3b242f9e39f5d3f9ee4510cf7f0860bbfcf29e224853`.
- `docs/email-builder/figflow-current-task-list.md`: `5e9061d32178b3d035f5bad2ea4096dbba52706f5a4b5ae640ea088df7114e08`.
- `docs/superpowers/specs/2026-10-30-figflow-edm-design.md`: `3869e2faee86181b5d574fb4dbe75e863d2ae7bc0ceb1d6bb297500e36bd392e`.

The PRD defines intended scope, not present availability. The current queue and explicit unreleased status control the copy. The existing composer view modes were inspected read-only (Editor, Preview, HTML); no Table tab or new editing control was invented. “Table-based email” refers to the rendered email output.

## Verification and baseline findings

Existing Node **24.18.0**, existing dependencies only:

- Before and after copy changes: scoped ESLint, `node node_modules/eslint/bin/eslint.js --no-cache app/pages/features/index.vue 'app/pages/features/[slug].vue'`, exit 0, zero errors/warnings.
- Vue `@vue/compiler-sfc` parse, `compileScript` and `compileTemplate`: **3/3 passed**, both edited pages plus unchanged MarketingNav; no compiler errors or tips.
- Before/after descriptor comparison: templates and style blocks are byte-identical. Nuxt UI components, layout, dark-mode classes and form markup were unchanged.
- TypeScript AST/source inventory check: **14 categories, 133 catalog entries, 132 detail entries** preserved, with original keys, feature titles/icons, category metadata, ordering and detail-section counts/expressions unchanged. Email Builder remains Communication with **4 sections**.
- All feature-catalog slugs resolve to existing detail entries. Every unrelated feature record is unchanged, including the QR Codes entry; navigation is byte-identical and retains `/features/qr-codes`.
- Baseline-only consistency findings: `page-studio` appears twice in the catalog and already has a category-label mismatch with its detail entry. These explain 133 catalog rows versus 132 detail entries; both findings are unchanged. Existing “90+” metadata remains accurate and unchanged. No new consistency issue was introduced.
- `git diff --check` for the edited pages passed. The scoped diff is six changed data lines (five in the detail-page data and one catalog description).

The first inventory helper assumed every `details` value was a literal array; an existing imported CRM copy expression required preserving that expression instead. The corrected check completed successfully; this was a verification-helper adjustment, not a product/source issue.

No mirrored unit tests were added for copy-only edits. No full Pages/native build, install, browser, provider, configured database, real email, deployment, Git commit, staging, push or reset was performed. No protected email component, backend, shared contract, native/pin/workflow/migration/harness or parent queue/ledger file was edited.

## Remaining release gates (parent-owned)

- Complete and accept the campaign-owned round trip and successor publication under the existing shared template identity, including conflict, saved-version and image-replacement behaviour.
- Freeze the coherent native40/UI/499 candidate and obtain its own exact-source CI, package/runtime checks and immutable raw/gzip budget result; c22 cannot substitute for that revision.
- Keep authoring/publishing/campaign eligibility and the M06 review rollout controlled until their acceptance is recorded. The canonical queue records zero configured498 opt-ins and the review flag remaining off.
- Use the existing guarded release owners for any later publication, with source/artifact/deployment provenance and hosted whole-flow checks. The public copy does not announce that release.
- Complete authorized real email-client acceptance separately. No email was sent and no inbox compatibility certification is claimed here.

No canonical queue box was changed by this task; the coordinator owns integration and release status.
