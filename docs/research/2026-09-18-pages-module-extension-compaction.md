# Pages generated module filename compaction

18 September 2026. Build-packaging follow-up for the CMS read-authority release.

## Trigger and change

The clean release build of Dashboard `84bc84bad` produced 25,471,549 raw Worker
bytes, exceeding the unchanged 25,468,928-byte guard by 2,621 bytes. The deployment
stopped before upload. The earlier build from the implementation worktree was
smaller; its passing size was insufficient evidence for the clean release build.

Generated chunk filenames now use `chunks/m/<base36>.js` instead of `.mjs`.
Each rewritten reference saves one byte. Module contents, SQL, authorization,
dependencies and deployment limits are unchanged. Existing compact `.mjs` trees
remain a no-op; mixed compact/generated trees are rejected before writes.
Ordinary `.js` assets outside the compact directory retain their filenames.

## Runtime basis

The installed Wrangler Pages implementation explicitly assigns both `**/*.js`
and `**/*.mjs` to `ESModule` in `produceWorkerBundleForWorkerJSDirectory` and the
Pages development loader (`node_modules/wrangler/wrangler-dist/cli.js`). This
applies to this application's Pages Worker-directory deployment. It is not a
claim about standalone Workers' default `.js` classification. Cloudflare's
[module rules](https://developers.cloudflare.com/workers/wrangler/configuration/#rules)
and [bundling documentation](https://developers.cloudflare.com/workers/wrangler/bundling/)
describe how module type rules control loading.

## Verification

- The two changed filename expectations failed before implementation.
- All 37 focused cases pass. Coverage includes actual Node imports, static and
  dynamic references, re-exports, query suffixes, deterministic naming,
  idempotence, legacy output and mixed-tree rejection. The new Miniflare case
  executes static, dynamic and re-exported `.js` modules using Pages' rules.
- The runtime fixture uses the application's `2024-12-01` compatibility date
  and an explicit module root. Initial fixture attempts used an unsupported
  date and omitted that root; both harness errors were corrected before the
  final passing focused run.
- Changed-file ESLint passes. Independent review found no Critical or Important
  issues; its two suggested legacy/mixed-tree cases were added.
- A disposable copy of the failed artifact saved 13,869 bytes across 2,763
  renamed modules. This is an isolated size experiment, not deployment proof.
- Full-suite and clean release results are recorded in the CMS release report
  once available. No build guard was raised or bypassed.

Evidence: `.verification/page-studio-builder-rnd-20260917/cms-module-*` and
`cms-read-deploy-preview.log` (the original failed release build).

## Release recovery

The previously successful preview deployment is
`4f64466c-ba5e-4e70-827d-f630b7eee5fc` (source `ffafb98441179a403445405840dd81a807788fbf`).
If the new preview fails runtime checks, restore that verified preview artifact
using the provider's deployment rollback mechanism and verify its alias before
continuing. There is no migration or data transformation to reverse. Production
is outside this staging release.
