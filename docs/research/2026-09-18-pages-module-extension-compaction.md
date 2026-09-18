# Pages generated module filename compaction

18 September 2026. Build-packaging follow-up for the CMS read-authority release.

## Trigger and change

The clean release build of Dashboard `84bc84bad` produced 25,471,549 raw Worker
bytes, exceeding the unchanged 25,468,928-byte guard by 2,621 bytes. The deployment
stopped before upload. The earlier build from the implementation worktree was
smaller; its passing size was insufficient evidence for the clean release build.

Generated chunk filenames now use `chunks/m/<base36>.js` instead of `.mjs`.
Each rewritten reference saves one byte. Module logic, SQL, authorization,
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
- Full suite passes 13,990 tests across 2,066 files; 542 tests and 27 files retain
  their configured skips. The clean build prerendered 169 routes and passed at
  25,457,685 raw bytes (11,243 remaining), with 6,623,172 gzip bytes.
- Wrangler 4.110.0 compiled all generated modules successfully as ES modules.
  The subsequent upload request failed with a network error. Metadata readback
  confirmed the previous preview deployment remained active, after checking
  that production, Pages configuration and all five Studio Worker configurations
  and deployments were unchanged. The complete guarded retry succeeded as
  `416b85f9-85da-48ca-96fb-73e09b925f4c`, at 25,457,688 raw bytes (11,240 remaining)
  and 6,623,183 gzip bytes. Provider readback matches source `d8da869cb` exactly.
- No build guard was raised or bypassed. The final release result is recorded in
  the [CMS release report](./2026-09-18-page-studio-cms-read-authority.md).

Evidence: `.verification/page-studio-builder-rnd-20260917/cms-module-*` and
`cms-read-deploy-preview.log` (the original failed release build).

## Release recovery

The previously successful preview deployment is
`4f64466c-ba5e-4e70-827d-f630b7eee5fc` (source `ffafb98441179a403445405840dd81a807788fbf`).
Cloudflare's [instant rollback is production-only](https://developers.cloudflare.com/pages/configuration/rollbacks/);
preview deployments are not eligible. If the new preview fails runtime checks,
stop acceptance, retain the old immutable deployment for reference, and revert
the failing source change on a current-main-inclusive branch. Run tests and the
guarded `pnpm deploy:check` / `pnpm deploy:preview` flow to restore the branch alias.
Any reverted packaging change must still satisfy the unchanged bundle guard;
the original oversized candidate cannot be redeployed as-is. There is no migration
or data transformation to reverse. Production is outside this staging release.
