# Measurement Destination-Version Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator test or attest any current measurement destination even after another destination advances the parent profile version.

**Architecture:** Keep profile mutation concurrency profile-versioned and make provider tests plus health evidence destination-versioned. The existing request field stays intact, but its validation-path meaning becomes the target destination version from UI through reservation, evidence, and audit.

**Tech Stack:** Nuxt 4, Vue 3, Nitro, TypeScript, Zod, Neon/PostgreSQL, Vitest, `pg`

## Global Constraints

- Profile mutations, approvals, and activation remain guarded by `client_measurement_profiles.config_version`.
- Provider tests, attestations, and health evidence are guarded by `conversion_destinations.config_version`.
- Preserve the profile-then-destination lock order in validation transactions.
- Keep the existing `expectedConfigVersion` wire field and existing version-conflict responses.
- Add no database migration and no visible UI controls.
- The database smoke test must run inside a transaction, roll back, and prove no scratch client remains.
- `DATABASE_URL` points at production; only the rollback-only smoke test may use it.
- Server imports use the `~~/` alias.

---

### Task 1: Make Provider Tests Destination-Versioned

**Files:**
- Modify: `server/utils/measurement/providerTestRepository.ts`
- Modify: `app/components/clients/ClientMeasurementProviderTest.vue`
- Modify: `app/components/clients/ClientMeasurementPanel.vue`
- Test: `test/server/utils/measurement/providerTestRepository.test.ts`
- Test: `test/app/clientMeasurementProviderTest.test.ts`
- Test: `test/app/clientMeasurementPanel.test.ts`

**Interfaces:**
- Consumes: `MeasurementDestination.configVersion: number`
- Produces: `ClientMeasurementProviderTest` prop `destinationConfigVersion: number`
- Preserves: provider-test request body field `expectedConfigVersion: number`

- [ ] **Step 1: Add a failing repository regression for divergent versions**

Add a test whose provider context has a newer profile but a current destination:

```ts
it('uses the destination version when the profile advanced independently', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{
      profile_id: '77777777-7777-4777-8777-777777777777',
      profile_enabled: false,
      profile_environment: 'test',
      profile_config_version: 4,
      destination_enabled: false,
      destination_environment: 'test',
      destination_config_version: 3,
      platform: 'meta',
      external_destination_id: '573284833843027',
      credential_ref: 'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
      provider_event_name: 'QualifiedLead',
      account_id: '5717158431690024',
      refresh_token: null,
      scopes: [],
      metadata: {},
      allowed_origins: [],
      capability_modes: ['meta_crm_capi']
    }] })
    .mockResolvedValueOnce({ rows: [{
      id: '33333333-3333-4333-8333-333333333333',
      mode: 'meta_test_events',
      status: 'requested',
      provider_request_id: null,
      error_class: null,
      redacted_error: null,
      completed_at: null
    }] })
  const repository = createPostgresMeasurementProviderTestRepository(
    async callback => callback({ query })
  )

  await expect(repository.reserve(input)).resolves.toMatchObject({
    status: 'reserved'
  })
  expect(String(query.mock.calls[1]![0])).toContain(
    'd.config_version AS destination_config_version'
  )
  expect((query.mock.calls[2]![1] as unknown[])[7]).toBe(3)
})
```

- [ ] **Step 2: Run the repository test and verify red**

Run:

```bash
pnpm exec vitest run test/server/utils/measurement/providerTestRepository.test.ts
```

Expected: FAIL because the repository compares `profile_config_version` and does
not select `destination_config_version`.

- [ ] **Step 3: Compare and persist the destination version**

In `ProviderContextRow`, replace the profile version field with:

```ts
destination_config_version: number | string
```

In the context query, select:

```sql
d.config_version AS destination_config_version,
```

Replace the reservation guard with:

```ts
if (Number(row.destination_config_version) !== input.expectedConfigVersion) {
  return { status: 'version_conflict' }
}
```

Keep `input.expectedConfigVersion` as the inserted test-run `config_version`.

- [ ] **Step 4: Add a failing component contract for the destination version**

Change component test fixtures so the destination carries:

```ts
configVersion: 3
```

Render with:

```ts
destinationConfigVersion: 3
```

Assert the outgoing body:

```ts
expect(fetchMock).toHaveBeenCalledWith(
  expect.stringContaining('/test'),
  expect.objectContaining({
    body: expect.objectContaining({ expectedConfigVersion: 3 })
  })
)
```

In `test/app/clientMeasurementPanel.test.ts`, assert the provider-test stub gets
the selected destination's version rather than `profile.configVersion`.

- [ ] **Step 5: Run component tests and verify red**

Run:

```bash
pnpm exec vitest run \
  test/app/clientMeasurementProviderTest.test.ts \
  test/app/clientMeasurementPanel.test.ts
```

Expected: FAIL because the component still declares `profileConfigVersion` and
the panel passes the profile version.

- [ ] **Step 6: Rename the prop and pass the destination version**

Update `ClientMeasurementProviderTest.vue`:

```ts
const props = defineProps<{
  clientId: string
  destinationConfigVersion: number
  destination: Pick<
    MeasurementDestination,
    'id' | 'platform' | 'configVersion' | 'capabilities' | 'mappings'
  >
}>()
```

Build the request with:

```ts
expectedConfigVersion: props.destinationConfigVersion,
```

Update `ClientMeasurementPanel.vue`:

```vue
<ClientsClientMeasurementProviderTest
  v-if="testingDestinationId === destination.id"
  :client-id="clientId"
  :destination-config-version="destination.configVersion"
  :destination="destination"
  @close="testingDestinationId = null"
  @completed="handleProviderTestCompleted"
/>
```

- [ ] **Step 7: Run the provider-test slice**

Run:

```bash
pnpm exec vitest run \
  test/server/utils/measurement/providerTestRepository.test.ts \
  test/server/utils/measurement/providerTestService.test.ts \
  test/app/clientMeasurementProviderTest.test.ts \
  test/app/clientMeasurementPanel.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add \
  server/utils/measurement/providerTestRepository.ts \
  app/components/clients/ClientMeasurementProviderTest.vue \
  app/components/clients/ClientMeasurementPanel.vue \
  test/server/utils/measurement/providerTestRepository.test.ts \
  test/app/clientMeasurementProviderTest.test.ts \
  test/app/clientMeasurementPanel.test.ts
git commit -m "fix(measurement): version provider tests by destination"
```

---

### Task 2: Record Health Evidence Against the Destination Version

**Files:**
- Modify: `server/utils/measurement/healthRepository.ts`
- Test: `test/server/utils/measurement/healthRepository.test.ts`
- Test: `test/server/utils/measurement/healthService.test.ts`
- Test: `test/server/utils/measurement/attestationService.test.ts`

**Interfaces:**
- Consumes: `RecordDestinationValidationEvidence.expectedConfigVersion`
- Produces: `DestinationValidationEvidenceState.configVersion` from the locked destination
- Preserves: `MEASUREMENT_VERSION_CONFLICT` and profile-first lock ordering

- [ ] **Step 1: Make the happy-path test reproduce the divergence**

Change the profile mock in the successful repository test to version 4 while
leaving the destination and input at version 3:

```ts
if (/client_measurement_profiles[\s\S]*FOR UPDATE/.test(sql)) {
  return { rows: [{ id: PROFILE_ID, config_version: 4 }] }
}
if (/conversion_destinations[\s\S]*FOR UPDATE/.test(sql)) {
  return {
    rows: [{
      platform: 'meta',
      config_version: 3,
      health_status: 'configured'
    }]
  }
}
```

Keep the expected evidence and audit version at 3.

- [ ] **Step 2: Replace the stale-profile test with a stale-destination test**

Use a profile at version 4 and destination at version 4 with input version 3:

```ts
it('rejects evidence when the destination itself changed', async () => {
  const db = {
    query: vi.fn(async (sql: string) => {
      if (/client_measurement_profiles/.test(sql)) {
        return { rows: [{ id: PROFILE_ID, config_version: 5 }] }
      }
      return {
        rows: [{
          platform: 'meta',
          config_version: 4,
          health_status: 'configured'
        }]
      }
    })
  }
  const repository = createPostgresMeasurementHealthRepository({
    transaction: (async callback => callback(db)) as never
  })

  await expect(repository.recordValidation(input())).resolves.toEqual({
    status: 'version_conflict',
    currentVersion: 4
  })
  expect(db.query).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 3: Run the health repository test and verify red**

Run:

```bash
pnpm exec vitest run test/server/utils/measurement/healthRepository.test.ts
```

Expected: the divergent happy path returns a profile version conflict.

- [ ] **Step 4: Use the locked destination as the concurrency owner**

Keep the profile lock first:

```sql
SELECT id
  FROM client_measurement_profiles
 WHERE client_id = $1
 FOR UPDATE
```

Delete the profile-version comparison. After locking the destination:

```ts
const destinationVersion = Number(destination.config_version)
if (destinationVersion !== input.expectedConfigVersion) {
  return {
    status: 'version_conflict' as const,
    currentVersion: destinationVersion
  }
}
```

Use `destinationVersion` for:

```ts
const evidence: DestinationValidationEvidenceState = {
  clientId: input.clientId,
  destinationId: input.destinationId,
  configVersion: destinationVersion,
  healthStatus: updated.health_status,
  observedAt: iso(updated.last_validated_at),
  capabilities: input.capabilities
}
```

Pass `destinationVersion` as the audit row's `config_version`.

- [ ] **Step 5: Run the full validation/attestation slice**

Run:

```bash
pnpm exec vitest run \
  test/server/utils/measurement/healthRepository.test.ts \
  test/server/utils/measurement/healthService.test.ts \
  test/server/utils/measurement/attestationService.test.ts \
  test/server/utils/measurement/runtime.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  server/utils/measurement/healthRepository.ts \
  test/server/utils/measurement/healthRepository.test.ts
git commit -m "fix(measurement): validate health by destination version"
```

---

### Task 3: Prove Divergent Versions Against PostgreSQL

**Files:**
- Modify: `test/integration/measurementOnboarding.database.test.ts`
- Verify: `package.json`

**Interfaces:**
- Consumes: `MEASUREMENT_DATABASE_SMOKE_URL`
- Produces: rollback-only proof covering real CHECK, FK, trigger, and version behavior

- [ ] **Step 1: Extend the smoke setup to create divergent versions**

After creating destination A and its capability, advance the profile and create
destination B:

```ts
await client.query(
  `UPDATE client_measurement_profiles
      SET config_version = 2
    WHERE client_id = $1`,
  [clientId]
)

await client.query(
  `INSERT INTO conversion_destinations (
     client_id, profile_id, platform, external_destination_id,
     enabled, environment, health_status, config_version
   ) VALUES (
     $1, $2, 'google_data_manager', 'smoke-customer-2',
     false, 'test', 'configured', 2
   )`,
  [clientId, profile!.id]
)
```

Before validating A, assert the intentional divergence:

```ts
await expect(queryOne<{
  profile_version: number
  destination_version: number
}>(`
  SELECT p.config_version AS profile_version,
         d.config_version AS destination_version
    FROM client_measurement_profiles p
    JOIN conversion_destinations d
      ON d.client_id = p.client_id
     AND d.id = $2
   WHERE p.client_id = $1
`, [clientId, destinationId])).resolves.toEqual({
  profile_version: 2,
  destination_version: 1
})
```

- [ ] **Step 2: Strengthen evidence and audit assertions**

Keep `expectedConfigVersion: 1` and add:

```ts
expect(evidence).toMatchObject({
  configVersion: 1,
  healthStatus: 'ready'
})

await expect(queryOne<{
  actor_type: string
  config_version: number
}>(`
  SELECT actor_type, config_version
    FROM measurement_config_audit
   WHERE client_id = $1
   ORDER BY created_at DESC
   LIMIT 1
`, [clientId])).resolves.toEqual({
  actor_type: 'team_member',
  config_version: 1
})
```

Retain the `ROLLBACK` and zero-residue assertion in `afterAll`.

- [ ] **Step 3: Run the smoke test without a database and verify safe skip**

Run:

```bash
pnpm test:measurement-db-smoke
```

Expected: one skipped test and exit 0 when
`MEASUREMENT_DATABASE_SMOKE_URL` is absent.

- [ ] **Step 4: Run the rollback-only smoke against configured PostgreSQL**

From this worktree, source only the connection value and do not print it:

```bash
set -a
source /Users/paulgiurin/Documents/Projects/dashboard/.env
set +a
MEASUREMENT_DATABASE_SMOKE_URL="$DATABASE_URL" pnpm test:measurement-db-smoke
```

Expected: PASS, followed by the test's explicit zero-residue assertion.

- [ ] **Step 5: Commit**

```bash
git add test/integration/measurementOnboarding.database.test.ts
git commit -m "test(measurement): cover divergent destination versions"
```

---

### Task 4: Battle-Test and Ship

**Files:**
- Review: every file changed since `origin/main`
- Verify: `docs/superpowers/specs/2026-07-27-measurement-destination-version-validation-design.md`

**Interfaces:**
- Consumes: Tasks 1-3
- Produces: reviewed, buildable branch ready for PR

- [ ] **Step 1: Run the focused measurement suite**

Run:

```bash
pnpm exec vitest run \
  test/app/clientMeasurement*.test.ts \
  test/server/api/measurement*.test.ts \
  test/server/utils/measurement/*.test.ts \
  test/integration/measurementOnboarding.database.test.ts
```

Expected: all non-database tests pass; the database test skips unless its
dedicated URL is present.

- [ ] **Step 2: Run the full repository suite**

Run:

```bash
pnpm exec vitest run
```

Expected: no new failures relative to the documented baseline of 39 unrelated
failures; record the exact pass/fail totals.

- [ ] **Step 3: Run changed-file type analysis**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm typecheck
```

Expected: the repository may retain its documented baseline errors, but none
may reference a file changed by this plan.

- [ ] **Step 4: Run the production build and worker-size guard**

Run:

```bash
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH pnpm build
```

Expected: build succeeds and `scripts/check-worker-size.mjs` remains below
24.50 MiB.

- [ ] **Step 5: Perform the mandatory pre-commit deep review**

Read every changed file end to end and verify:

```text
- no profile-version comparison remains in provider-test or health validation
- destination version reaches request, reservation, evidence, and audit
- profile-first lock ordering remains intact
- version conflicts report the locked destination version
- no server import uses ~/ instead of ~~/ 
- no raw secret, provider payload, or DATABASE_URL is logged
- rollback smoke leaves no persistent client or append-only audit row
- git diff --check passes
```

- [ ] **Step 6: Request independent review and fix all Critical/Important findings**

Review scope:

```text
origin/main..HEAD
Focus: concurrency ownership, stale-write protection, transaction lock order,
provider test run version provenance, audit correctness, rollback safety, and
whether a profile-newer/destination-current case works end to end.
```

Expected: READY with no Critical or Important findings.

- [ ] **Step 7: Push, create PR, wait for CI, and merge**

```bash
git push -u origin measurement-onboarding-completion
gh pr create \
  --base main \
  --head measurement-onboarding-completion \
  --title "fix(measurement): validate each destination independently"
gh pr checks --watch --interval 10
gh pr merge --squash
```

Expected: PR merged into `main`; the production deployment, origin smoke, and
agency-workflow readiness smoke all pass.
