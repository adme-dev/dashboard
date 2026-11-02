# Paired Page Studio generated verifier update

Dashboard base: `b28c6955dd2d85d337ab02d139950537e1607208`.
Paired Page Studio source: `7f63ffbc144af85e6965d040f430d239da9bf9ba`.

The prior Dashboard and Management checkpoint verifiers rejected valid
`page.presentation` and footer `contentPolicy: explicit`. This prevented those
authored values from passing native checkpoint validation. Both builder copies
and the Management transfer-copy verifier are now exact copies of the frozen
Studio generator outputs. They were not edited by hand.

| Generated output | Source digest | Module SHA256 |
| --- | --- | --- |
| Builder, both destinations | `47c36a6c0b25355a970a1a59438eed3f3493e7a503c30abad41dff5aa62ddd50` | `0cac0c5a79dafe470dedbb210858e1ab21eeab472d1e4f195217beebdc83cc9a` |
| Managed transfer copy | `53c04c1767608d40759a5170a83259b96d014391f52dee2fb9caff88aae044a4` | `7f4b4ed70ccdec43a1e20d9701252fea9224dc575329b109b2e8779060eea6b2` |

Builder destinations are `shared/pageStudio/generated` and
`workers/page-studio-management/src/generated`; transfer output is in the latter
directory's `managed-transfer-copy` subdirectory. All accompanying declarations,
fixtures and notices were copied and compared byte for byte; only the three
modules and their manifests changed. Zod remains the reviewed embedded 4.6.7.
The upstream delta also includes existing Studio form-protection schema and
capability declarations; no Dashboard form UI, handlers, flags or provider
configuration are changed here. Export names and declaration bytes are unchanged.

## Evidence

- Tests first: the new paired checkpoint suite failed six valid presentation and
  explicit-footer cases against the old generated modules; its other 17 cases
  passed. The exact generated sync makes all 23 cases pass.
- Both real generated checkpoint exports accept the new values, reject invalid
  colours/unknown keys/footer policies and retain scope/digest checks. Legacy
  generic columns/spacer props and fullbleed hero props remain accepted. Typed
  component audits are advisory for existing saved documents; this update does
  not make arbitrary component properties renderable or authorize asset imports.
- Four coordinator regressions exercise actual checkpoint byte reads, generated
  validation and immutable restore writes over an in-memory bucket. Valid
  presentation/footer/legacy props survive reload; invalid new values fail
  before SQL writes. Native authority and SQL are explicit fake test ports.
- Existing generated golden fixtures, provenance/dependency checks, local
  Workerd private Management RPC boundaries, checkpoint timing/storage/CAS and
  Management handler contracts pass: **224 tests in 14 files** in the final
  combined run. Management TypeScript and focused test lint pass. This is local
  evidence, not hosted save or database transaction proof.

Validation uses Node 24.22.1 and Dashboard-pinned pnpm 10.17.1. The owner linked an
existing dependency installation after verifying identical dependency manifests;
no install, lockfile or dependency change was made. `pnpm exec nuxt prepare`
generated the isolated worktree's missing `.nuxt` types, with existing duplicate
auto-import warnings.

```sh
pnpm exec vitest run \
  test/shared/pageStudioPresentationCompatibility.test.ts \
  test/workers/pageStudioPresentationCheckpoint.test.ts \
  test/shared/pageStudioFooterTypography.test.ts \
  test/shared/pageStudioBuilderGraphVerifier.test.ts \
  test/shared/pageStudioGeneratedVerifierDependencies.test.ts \
  test/workers/pageStudioManagedTransferCopyVerifier.test.ts \
  test/workers/pageStudioManagementRuntime.test.ts \
  test/workers/pageStudioManagementWorker.test.ts \
  test/workers/pageStudioCmsManagement.test.ts \
  test/workers/pageStudioCmsManagementContract.test.ts \
  test/workers/pageStudioCmsCheckpointTiming.test.ts \
  test/workers/pageStudioManagedTransferCopyBundle.test.ts \
  test/server/utils/pageStudioCheckpointCas.test.ts \
  test/server/utils/pageStudioCmsGraphStorage.test.ts
pnpm exec tsc --noEmit -p workers/page-studio-management/tsconfig.json
pnpm exec eslint test/shared/pageStudioPresentationCompatibility.test.ts test/workers/pageStudioPresentationCheckpoint.test.ts
git diff --check
```

The Studio owner retained the generator `--check` receipts and original
21-golden/11-compatibility proof under
`~/.local/state/xeroflow-page-studio/pr206-release-20261102/native-verifier-candidates`.
Those receipts are source provenance; they do not establish deployed identity.

## Release handoff

The Dashboard owner controls Dashboard Pages review, merge and deployment; the
Page Studio owner controls Studio and Management operations. Refresh current
main and complete normal paired release checks before either deployment. This
work does not deploy, activate a feature, publish a customer site or change
authority. Hosted Dashboard launch, Management save/restore, connected Kimi Kia
preview/apply/save/reload and desktop/mobile comparison remain required. Other
strict readers and renderers still need their own compatibility evidence.
