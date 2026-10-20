# Final fix report — R1 native CMS regression fixtures

20 October 2026. Starting head: `d576c6bd9a4090603285e93b77296d935282779e`.
Worktree: `/Users/paulgiurin/Documents/Projects/studio-customer-launch-20261015`.
Branch: `feat/studio-transfer-controls-20261020`; upstream:
`origin/feat/studio-transfer-controls-20261020`. Locally recorded
`origin/main...HEAD` before this fix: 0 behind / 11 ahead. Root owns fresh fetch,
exact-head CI, integration and release.

## Finding and correction

Reproduced the eight failures from CI run 39350348086 against disposable local
PostgreSQL before editing. The dispatcher correctly rejected production native
customer requests for staging content because their fixtures supplied only the
legacy shared-staging aliases and no dedicated native runtime configuration.

Added `nativeSourceCmsEnvironment` in the test helper. Native source fixtures now
explicitly describe the production control/provisioning context, logical staging
content, enabled dedicated runtime, dedicated provisioner methods, router,
checkpoint storage and editor origin. The provisioner methods throw if invoked:
these CMS tests do not pretend to exercise provisioning. Native adoption and the
staging-content branch of native saves use this explicit environment. The
production-destination saves fixture explicitly keeps production content/storage.
The existing `attachCmsManagement` legacy behavior is unchanged.

Added six PostgreSQL regressions through the real management dispatcher: a native
source save succeeds with dedicated storage while shared/production bindings
throw; disabled runtime and each missing provisioner/router/bucket/editor-origin
setting fail with 503 before storage reads or graph mutation, even though shared
storage is available. All original authority, replay, concurrency, rollback and
provenance assertions remain unchanged. No production code or migration changed.

## Commands and results

All commands ran from the worktree above using Node `v24.18.0` and pnpm `10.17.1`.
The common shell setup was:

```sh
source /tmp/pi-ui-env.sh
```

Only `postgresql://paulgiurin@127.0.0.1:55439/studio_cms_transfer` was used.
No `.env` database was read or used. Each suite retains its disposable schema
creation/cleanup and the real SQL authority/transaction paths.

Before the fix:

```sh
PAGE_STUDIO_WORKSPACE_TEST_URL=postgresql://paulgiurin@127.0.0.1:55439/studio_cms_transfer corepack pnpm exec vitest run test/server/utils/pageStudioCustomerCmsAdoptionPostgres.test.ts test/server/utils/pageStudioCustomerCmsSavesPostgres.test.ts
```

Exit 1: **8 failed / 69 passed**, two files failed. Log:
`.verification/release-20261020/r1-reproduce.log`. Failures were the three adoption
cases (later-save launch, initial-application launch guard, adopt-and-save) and
five staging save cases (atomic save, revocation after read, stale/tampered save,
competing saves, logout replay), matching the reviewed CI failure.

The same focused command after the fixture correction and six regressions:
exit 0, **83 passed**, two files passed. Log:
`.verification/release-20261020/r1-focused.log`.

The complete **Page Studio customer workspace ownership database tests** command
and environment key from `.github/workflows/ci.yml`, replacing only the database
URL with the isolated local database:

```sh
PAGE_STUDIO_WORKSPACE_TEST_URL=postgresql://paulgiurin@127.0.0.1:55439/studio_cms_transfer corepack pnpm exec vitest run test/server/utils/pageStudioCustomerPlanGrantsPostgres.test.ts test/server/utils/pageStudioCustomerPublishAuthorityPostgres.test.ts test/server/utils/pageStudioCustomerWorkspacesPostgres.test.ts test/server/utils/pageStudioCustomerSignupPostgres.test.ts test/server/utils/pageStudioCustomerSitesPostgres.test.ts test/server/utils/pageStudioLegacyOwnershipUpgradePostgres.test.ts test/server/utils/pageStudioCustomerProvisioningPostgres.test.ts test/server/utils/pageStudioCustomerEditorHandoffPostgres.test.ts test/server/utils/pageStudioCustomerEditorSessionsPostgres.test.ts test/server/utils/pageStudioCustomerCmsSavesPostgres.test.ts test/server/utils/pageStudioCustomerCmsAdoptionPostgres.test.ts test/server/utils/pageStudioCustomerSchemaUpgradePostgres.test.ts
```

Exit 0: **489 passed**, 12 files passed. Repeated after the final tuple typing and
lint-only formatting adjustment: **489 passed**, 12 files passed, 22.17 seconds.
Final log: `.verification/release-20261020/r1-workspace-ci-step.log`.

Unaffected real-staging/legacy agency, client and studio-session CMS regressions,
plus management routing/transport coverage:

```sh
PAGE_STUDIO_CMS_DATABASE_TEST_URL=postgresql://paulgiurin@127.0.0.1:55439/studio_cms_transfer corepack pnpm exec vitest run test/server/utils/pageStudioCmsGraphPostgres.test.ts test/server/utils/pageStudioReleaseFeatureSealsPostgres.test.ts test/server/utils/pageStudioCmsAdoptionPostgres.test.ts test/server/utils/pageStudioCmsAdoptionCoordinatorPostgres.test.ts test/server/utils/pageStudioCmsCommitAuthorityPostgres.test.ts test/server/utils/pageStudioCmsAuthoringScopePostgres.test.ts test/workers/pageStudioCmsManagement.test.ts test/workers/pageStudioCmsManagementClient.test.ts
```

Exit 0: **247 passed / 1 skipped**, eight files passed, 38.19 seconds. Log:
`.verification/release-20261020/r1-legacy-cms.log`. The existing conditional test
`commits actual public D1 prepared records after restart and a lost preparation response`
in `pageStudioReleaseFeatureSealsPostgres.test.ts` was skipped because
`PAGE_STUDIO_ACTION_TEST_ROOT` is unset. This run does not claim that external
Studio/D1 integration check.

Scoped lint:

```sh
corepack pnpm exec eslint test/helpers/pageStudioCmsManagement.ts test/server/utils/pageStudioCustomerCmsAdoptionPostgres.test.ts test/server/utils/pageStudioCustomerCmsSavesPostgres.test.ts
git diff --check
```

Both exit 0. An initial lint run found one new inline-throw formatting violation;
it was corrected and lint rerun clean. Final lint log:
`.verification/release-20261020/r1-eslint.log`.

## Review and bounds

Read the final review, approved plan and retained failed CI log. Re-read all three
modified test/helper files end-to-end and reviewed their complete diff before
commit. Checked that existing assertions were preserved, native and legacy
configuration are explicit/separate, failed configuration cannot reach shared
storage, and no production imports/routes/configuration were modified.

Vitest still emits the accepted pre-existing `vitest.config.ts:23` `__dirname`
future-native-config-loader warning. Verification is not warning-free.

No Nuxt build, full repository suite, deployment, hosted acceptance or Pi
activation was attempted in this bounded fix wave. Root must obtain passing
exact-head CI, including the remaining authority suites/build/full suite/guards,
before treating the branch as release-ready. Dedicated runtime remains disabled
in the prepared deployment configuration; these local tests do not activate it.
