# Neon Lakebase Search Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and run a guarded, reproducible BM25-versus-GIN CRM search pilot in a separate non-production Neon project, with zero production or Cloudflare Vectorize changes.

**Architecture:** Pure safety and capability modules sit beneath small CLIs for Neon control-plane enablement and database setup. A pilot-only schema stores synthetic CRM search documents, with both GIN and Lakebase BM25 indexes over the same corpus; a deterministic evaluator compares relevance, isolation, and latency without changing production endpoints. Cloudflare remains the application and AI platform, and the hybrid vector slice remains disabled until the BM25 gate passes.

**Tech Stack:** TypeScript, Node.js 24, Vitest 4, `@neondatabase/serverless`, `pg`, PostgreSQL 16+, Neon Platform API, `lakebase_text`, existing CRM search contracts, Graphify.

## Global Constraints

- Work only in `.worktrees/neon-lakebase-hybrid-search` on `spike/neon-lakebase-hybrid-search`; never edit the active primary checkout or PMax worktree.
- Lakebase preload libraries are project-level. The pilot target must be a separate non-production Neon project, never a branch inside the production project.
- Require `LAKEBASE_PILOT_PROJECT_ID`, `LAKEBASE_PILOT_ENDPOINT_ID`, `LAKEBASE_PILOT_DATABASE_URL`, and `NEON_PRODUCTION_PROJECT_ID` before any mutation.
- Require `LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT=1` before any control-plane or database mutation.
- Reject any target whose pilot project ID equals `NEON_PRODUCTION_PROJECT_ID` or whose pilot database URL exactly equals `DATABASE_URL`.
- Require Postgres 16 or later and active `lakebase_text` and `lakebase_vector` preload libraries before database setup.
- Keep `off` as the default mode. `hybrid` must remain rejected throughout this plan.
- Never enable Lakebase on the production Neon project, run a production migration, deploy Cloudflare Pages, or modify Cloudflare Vectorize.
- Never log credentials, complete connection strings, raw user queries, or real CRM identifiers.
- Use only synthetic, PII-free fixtures in the checked-in pilot. A de-identified export requires a separate approval and is not part of this plan.
- Preserve the existing `CrmSearchHit` result shape and mandatory in-query `client_id` filtering.
- Follow red-green-refactor for every behavior change and commit each independently reviewable task.

---

## File Structure

### New files

- `scripts/lakebase-pilot/contracts.ts` — target/mode validation, typed safety errors, and redacted target descriptions.
- `scripts/lakebase-pilot/capability.ts` — pure capability inspection and readiness classification.
- `scripts/lakebase-pilot/preflight.ts` — read-only CLI using the pilot database URL.
- `scripts/lakebase-pilot/neonControlPlane.ts` — Neon API request construction, preload preservation, and pilot-endpoint restart handling.
- `scripts/lakebase-pilot/enable.ts` — guarded control-plane CLI.
- `scripts/lakebase-pilot/database.ts` — explicit pilot database client and guarded SQL execution.
- `scripts/lakebase-pilot/setup.ts` — schema creation, fixture load, post-load indexes, and vacuum.
- `scripts/lakebase-pilot/teardown.ts` — exact pilot-schema teardown, never project/database deletion.
- `scripts/lakebase-pilot/search.ts` — GIN and BM25 SQL builders, score mapping, and same-session BM25 execution.
- `scripts/lakebase-pilot/metrics.ts` — deterministic retrieval metrics and acceptance decision.
- `scripts/lakebase-pilot/evaluate.ts` — benchmark CLI and redacted JSON/Markdown report writer.
- `scripts/lakebase-pilot/sql/schema.sql` — extensions, pilot schema, table, checks, and tenancy index.
- `scripts/lakebase-pilot/sql/indexes.sql` — post-population GIN and BM25 index builds.
- `scripts/lakebase-pilot/sql/teardown.sql` — exact `lakebase_pilot` schema removal.
- `test/fixtures/lakebase-crm-search.json` — synthetic two-client corpus and relevance judgements.
- `test/lakebase/pilotContracts.test.ts` — safety and mode tests.
- `test/lakebase/pilotCapability.test.ts` — capability/readiness tests.
- `test/lakebase/neonControlPlane.test.ts` — Neon request boundary tests.
- `test/lakebase/pilotDatabase.test.ts` — SQL and fixture safety tests.
- `test/lakebase/pilotSearch.test.ts` — query and score contract tests.
- `test/lakebase/pilotMetrics.test.ts` — relevance/latency/isolation metric tests.
- `test/lakebase/pilotEvaluate.test.ts` — CLI argument, redaction, and report decision tests.
- `test/lakebase/pilotRunbook.test.ts` — package command and operational safety documentation tests.
- `docs/runbooks/neon-lakebase-search-pilot.md` — exact setup, execution, rollback, and evidence runbook.

### Modified files

- `package.json` — add bounded `pilot:lakebase:*` commands.
- `.env.example` — document variable names with empty values only.

### Deliberately unchanged

- `server/api/crm/search.get.ts`, `server/utils/crm/search.ts`, and CRM UI — the pilot does not alter production request behavior.
- `server/utils/aiVectorize.ts` and every Cloudflare binding/configuration — Vectorize remains untouched.
- `server/database/migrations/` — no production migration is created.
- Marketing pages — the pilot is not a customer-visible capability.

---

### Task 1: Pilot Target and Mode Safety Contract

**Files:**
- Create: `scripts/lakebase-pilot/contracts.ts`
- Test: `test/lakebase/pilotContracts.test.ts`

**Interfaces:**
- Consumes: environment-shaped `Record<string, string | undefined>` values.
- Produces: `resolvePilotTarget(env, intent)`, `resolvePilotMode(value, target)`, `redactPilotTarget(target)`, `LakebasePilotSafetyError`, `LakebasePilotTarget`, and `LakebasePilotMode`.

- [ ] **Step 1: Write the failing safety tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  LakebasePilotSafetyError,
  redactPilotTarget,
  resolvePilotMode,
  resolvePilotTarget
} from '../../scripts/lakebase-pilot/contracts'

const safeEnv = {
  LAKEBASE_PILOT_PROJECT_ID: 'pilot-green-river-12345678',
  LAKEBASE_PILOT_ENDPOINT_ID: 'ep-pilot-green-river-a1b2c3d4',
  LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-pilot-green-river-a1b2c3d4.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  NEON_PRODUCTION_PROJECT_ID: 'prod-silent-tree-87654321',
  DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
  LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: '1'
}

describe('Lakebase pilot safety contract', () => {
  it('rejects missing identifiers, same-project targets, same database URLs, and missing mutation acknowledgement', () => {
    expect(() => resolvePilotTarget({}, 'read')).toThrow(LakebasePilotSafetyError)
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_PROJECT_ID: safeEnv.NEON_PRODUCTION_PROJECT_ID }, 'read'))
      .toThrow('production_project_targeted')
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_DATABASE_URL: safeEnv.DATABASE_URL }, 'read'))
      .toThrow('production_database_targeted')
    expect(() => resolvePilotTarget({ ...safeEnv, LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT: undefined }, 'mutate'))
      .toThrow('mutation_not_confirmed')
  })

  it('requires the URL host to belong to the declared endpoint and rejects direct/pooler production aliases', () => {
    expect(() => resolvePilotTarget({
      ...safeEnv,
      LAKEBASE_PILOT_ENDPOINT_ID: 'ep-another-endpoint-aabbccdd'
    }, 'read')).toThrow('pilot_endpoint_database_mismatch')

    expect(() => resolvePilotTarget({
      ...safeEnv,
      LAKEBASE_PILOT_ENDPOINT_ID: 'ep-prod-silent-tree-z9y8x7w6',
      LAKEBASE_PILOT_DATABASE_URL: 'postgresql://pilot:secret@ep-prod-silent-tree-z9y8x7w6.ap-southeast-2.aws.neon.tech/app?sslmode=require',
      DATABASE_URL: 'postgresql://prod:secret@ep-prod-silent-tree-z9y8x7w6-pooler.ap-southeast-2.aws.neon.tech/app?sslmode=require'
    }, 'read')).toThrow('production_database_targeted')
  })

  it('never includes credentials in redacted output', () => {
    const target = resolvePilotTarget(safeEnv, 'mutate')
    const output = JSON.stringify(redactPilotTarget(target))
    expect(output).not.toContain('secret')
    expect(output).not.toContain('postgresql://')
    expect(output).toContain('ep-pilot-green-river-a1b2c3d4')
  })

  it('defaults to off, allows shadow and bm25 only for the pilot, and rejects hybrid', () => {
    const target = resolvePilotTarget(safeEnv, 'mutate')
    expect(resolvePilotMode(undefined, target)).toBe('off')
    expect(resolvePilotMode('shadow', target)).toBe('shadow')
    expect(resolvePilotMode('bm25', target)).toBe('bm25')
    expect(() => resolvePilotMode('hybrid', target)).toThrow('hybrid_not_approved')
  })
})
```

- [ ] **Step 2: Run the test and confirm the expected red state**

Run:

```bash
pnpm exec vitest run test/lakebase/pilotContracts.test.ts
```

Expected: FAIL because `scripts/lakebase-pilot/contracts.ts` does not exist.

- [ ] **Step 3: Implement the minimal safety contract**

```ts
export type LakebasePilotIntent = 'read' | 'mutate'
export type LakebasePilotMode = 'off' | 'shadow' | 'bm25'

export interface LakebasePilotTarget {
  projectId: string
  endpointId: string
  databaseUrl: string
  databaseHost: string
  productionProjectId: string
}

export class LakebasePilotSafetyError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'LakebasePilotSafetyError'
  }
}

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim()
  if (!value) throw new LakebasePilotSafetyError(`missing_${key.toLowerCase()}`)
  return value
}

function endpointFromHost(hostname: string): string {
  return hostname.split('.')[0]?.replace(/-pooler$/, '') || ''
}

export function resolvePilotTarget(
  env: Record<string, string | undefined>,
  intent: LakebasePilotIntent
): LakebasePilotTarget {
  const projectId = required(env, 'LAKEBASE_PILOT_PROJECT_ID')
  const endpointId = required(env, 'LAKEBASE_PILOT_ENDPOINT_ID')
  const databaseUrl = required(env, 'LAKEBASE_PILOT_DATABASE_URL')
  const productionProjectId = required(env, 'NEON_PRODUCTION_PROJECT_ID')
  let databaseHost: string
  try {
    databaseHost = new URL(databaseUrl).hostname
  } catch {
    throw new LakebasePilotSafetyError('invalid_pilot_database_url')
  }
  if (!databaseHost.endsWith('.neon.tech')) throw new LakebasePilotSafetyError('non_neon_database_host')
  if (projectId === productionProjectId) throw new LakebasePilotSafetyError('production_project_targeted')
  if (env.DATABASE_URL?.trim()) {
    let productionHost: string
    try {
      productionHost = new URL(env.DATABASE_URL).hostname
    } catch {
      throw new LakebasePilotSafetyError('invalid_production_database_url')
    }
    if (databaseUrl === env.DATABASE_URL.trim() || endpointFromHost(databaseHost) === endpointFromHost(productionHost)) {
      throw new LakebasePilotSafetyError('production_database_targeted')
    }
  }
  if (endpointFromHost(databaseHost) !== endpointId) {
    throw new LakebasePilotSafetyError('pilot_endpoint_database_mismatch')
  }
  if (intent === 'mutate' && env.LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT !== '1') {
    throw new LakebasePilotSafetyError('mutation_not_confirmed')
  }
  return { projectId, endpointId, databaseUrl, databaseHost, productionProjectId }
}

export function redactPilotTarget(target: LakebasePilotTarget) {
  return { projectId: target.projectId, endpointId: target.endpointId, databaseHost: target.databaseHost }
}

export function resolvePilotMode(value: string | undefined, _target: LakebasePilotTarget): LakebasePilotMode {
  const mode = value?.trim() || 'off'
  if (mode === 'hybrid') throw new LakebasePilotSafetyError('hybrid_not_approved')
  if (mode === 'off' || mode === 'shadow' || mode === 'bm25') return mode
  throw new LakebasePilotSafetyError('invalid_pilot_mode')
}
```

- [ ] **Step 4: Run the focused tests**

Run: `pnpm exec vitest run test/lakebase/pilotContracts.test.ts`

Expected: PASS, with no credential material in snapshots or output.

- [ ] **Step 5: Commit the safety boundary**

```bash
git add scripts/lakebase-pilot/contracts.ts test/lakebase/pilotContracts.test.ts
git commit -m "feat(lakebase): add pilot target safety contract"
```

---

### Task 2: Read-Only Capability Inspection

**Files:**
- Create: `scripts/lakebase-pilot/capability.ts`
- Create: `scripts/lakebase-pilot/preflight.ts`
- Test: `test/lakebase/pilotCapability.test.ts`

**Interfaces:**
- Consumes: `LakebasePilotTarget` and `query(sql, params?)` returning rows.
- Produces: `inspectLakebaseCapability(query)`, `classifyLakebaseReadiness(capability)`, `runLakebasePreflight(args, deps)`, and redacted `LakebaseCapabilityReport`.

- [ ] **Step 1: Write failing capability tests**

Cover these exact cases:

```ts
it('passes only on PG16+ with both libraries preloaded and both extensions available', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ server_version_num: 160004, database_name: 'app' }])
    .mockResolvedValueOnce([{ shared_preload_libraries: 'pg_stat_statements,lakebase_text,lakebase_vector' }])
    .mockResolvedValueOnce([
      { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
      { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
    ])
    .mockResolvedValueOnce([{ pilot_schema_exists: false }])

  const report = await inspectLakebaseCapability(query)
  expect(classifyLakebaseReadiness(report)).toEqual({ ready: true, blockers: [] })
})

it('blocks Postgres versions earlier than 16', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ server_version_num: 150009, database_name: 'app' }])
    .mockResolvedValueOnce([{ shared_preload_libraries: 'lakebase_text,lakebase_vector' }])
    .mockResolvedValueOnce([
      { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
      { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
    ])
    .mockResolvedValueOnce([{ pilot_schema_exists: false }])
  expect(classifyLakebaseReadiness(await inspectLakebaseCapability(query)).blockers)
    .toContain('postgres_16_required')
})

it('blocks when either preload library is absent', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([{ server_version_num: 160004, database_name: 'app' }])
    .mockResolvedValueOnce([{ shared_preload_libraries: 'lakebase_text' }])
    .mockResolvedValueOnce([
      { name: 'lakebase_text', default_version: '0.1.0', installed_version: null },
      { name: 'lakebase_vector', default_version: '0.1.0', installed_version: null }
    ])
    .mockResolvedValueOnce([{ pilot_schema_exists: false }])
  expect(classifyLakebaseReadiness(await inspectLakebaseCapability(query)).blockers)
    .toContain('lakebase_preloads_missing')
})
```

Also assert that SQL is read-only (`SELECT`, `SHOW`, or `WITH` only) and that the CLI returns exit code `1` with structured blocker codes rather than raw database errors.

- [ ] **Step 2: Run the test and verify it fails for the missing module**

Run: `pnpm exec vitest run test/lakebase/pilotCapability.test.ts`

Expected: FAIL because the capability and CLI modules do not exist.

- [ ] **Step 3: Implement the capability inspector**

Use four bounded queries:

```ts
const server = await query(`
  SELECT current_setting('server_version_num')::int AS server_version_num,
         current_database() AS database_name
`)
const preload = await query(`
  SELECT current_setting('shared_preload_libraries') AS shared_preload_libraries
`)
const extensions = await query(`
  SELECT name, default_version, installed_version
  FROM pg_available_extensions
  WHERE name = ANY($1::text[])
  ORDER BY name
`, [['lakebase_text', 'lakebase_vector']])
const schema = await query(`
  SELECT to_regnamespace('lakebase_pilot') IS NOT NULL AS pilot_schema_exists
`)
```

Normalize preloads by splitting on commas and trimming. Readiness blockers are exactly:

```ts
type LakebaseReadinessBlocker =
  | 'postgres_16_required'
  | 'lakebase_preloads_missing'
  | 'lakebase_extensions_unavailable'
```

The CLI must call `resolvePilotTarget(process.env, 'read')`, instantiate `neon(target.databaseUrl, { fullResults: true })`, print only `redactPilotTarget(target)` plus capability data, and convert failures to codes through a dependency-injected `runLakebasePreflight` function.

- [ ] **Step 4: Run capability and existing CRM baseline tests**

Run:

```bash
pnpm exec vitest run test/lakebase/pilotCapability.test.ts test/crm/search.test.ts
```

Expected: PASS, 0 failures.

- [ ] **Step 5: Commit capability inspection**

```bash
git add scripts/lakebase-pilot/capability.ts scripts/lakebase-pilot/preflight.ts test/lakebase/pilotCapability.test.ts
git commit -m "feat(lakebase): add read-only capability preflight"
```

---

### Task 3: Guarded Neon Preload Enablement

**Files:**
- Create: `scripts/lakebase-pilot/neonControlPlane.ts`
- Create: `scripts/lakebase-pilot/enable.ts`
- Test: `test/lakebase/neonControlPlane.test.ts`

**Interfaces:**
- Consumes: a mutation-approved `LakebasePilotTarget`, scoped Neon API token, and injected `fetch`.
- Produces: `mergePreloadLibraries(available, current)`, `enableLakebasePreloads(input, deps)`, and `runLakebaseEnable(args, deps)`.

- [ ] **Step 1: Write the failing request-boundary tests**

Tests must prove:

```ts
expect(mergePreloadLibraries(
  [
    { library_name: 'pg_stat_statements', is_default: true },
    { library_name: 'lakebase_text', is_default: false },
    { library_name: 'lakebase_vector', is_default: false }
  ],
  ['custom_existing']
)).toEqual(['custom_existing', 'lakebase_text', 'lakebase_vector', 'pg_stat_statements'])
```

And the fake fetch call sequence must be exactly:

1. `GET /api/v2/projects/<pilot>`
2. `GET /api/v2/projects/<pilot>/endpoints/<pilot-endpoint>`
3. `GET /api/v2/projects/<pilot>/available_preload_libraries`
4. `PATCH /api/v2/projects/<pilot>` with defaults + existing + Lakebase libraries
5. `POST /api/v2/projects/<pilot>/endpoints/<pilot-endpoint>/restart`

The endpoint detail response must have `endpoint.id === target.endpointId`, `endpoint.project_id === target.projectId`, and a host whose direct/pooler-normalized endpoint label matches `target.databaseHost`. Perform these checks before the preload PATCH. Assert no URL contains the production project ID and no emitted value contains the API token. Treat a restart response whose body contains `endpoint is not active, could not restart` as `restartDeferred: true`; every other non-2xx response is a coded failure.

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `pnpm exec vitest run test/lakebase/neonControlPlane.test.ts`

Expected: FAIL because `neonControlPlane.ts` does not exist.

- [ ] **Step 3: Implement the fixed-origin Neon client**

Use a hardcoded API origin and encoded identifiers:

```ts
const NEON_API_ORIGIN = 'https://console.neon.tech'

function projectPath(projectId: string, suffix = '') {
  return `${NEON_API_ORIGIN}/api/v2/projects/${encodeURIComponent(projectId)}${suffix}`
}

const headers = {
  authorization: `Bearer ${apiKey}`,
  accept: 'application/json',
  'content-type': 'application/json'
}
```

Never accept an API base URL from environment or CLI input. Call `resolvePilotTarget(env, 'mutate')` before reading the API key or issuing any request. Retrieve and validate the project and endpoint before PATCHing settings. Preserve comma-packed default library names by splitting each `library_name` before de-duplication. The runbook requests a least-privilege Neon API key limited to the pilot project wherever the account's key policy supports the required preload-setting operation.

- [ ] **Step 4: Run safety and control-plane tests together**

Run:

```bash
pnpm exec vitest run test/lakebase/pilotContracts.test.ts test/lakebase/neonControlPlane.test.ts
```

Expected: PASS; request snapshots contain only the pilot project and endpoint.

- [ ] **Step 5: Commit control-plane automation**

```bash
git add scripts/lakebase-pilot/neonControlPlane.ts scripts/lakebase-pilot/enable.ts test/lakebase/neonControlPlane.test.ts
git commit -m "feat(lakebase): guard pilot preload enablement"
```

---

### Task 4: Pilot Schema, Synthetic Corpus, Setup, and Teardown

**Files:**
- Create: `scripts/lakebase-pilot/database.ts`
- Create: `scripts/lakebase-pilot/setup.ts`
- Create: `scripts/lakebase-pilot/teardown.ts`
- Create: `scripts/lakebase-pilot/sql/schema.sql`
- Create: `scripts/lakebase-pilot/sql/indexes.sql`
- Create: `scripts/lakebase-pilot/sql/teardown.sql`
- Create: `test/fixtures/lakebase-crm-search.json`
- Test: `test/lakebase/pilotDatabase.test.ts`

**Interfaces:**
- Consumes: mutation-approved pilot target, capability readiness, SQL files, and the synthetic fixture.
- Produces: `createPilotDatabase(target)`, `loadFixtureRows(fixture)`, `runPilotSetup(deps)`, and `runPilotTeardown(deps)`.

- [ ] **Step 1: Write failing SQL and fixture contract tests**

Read the SQL files as text and assert:

- schema SQL creates `lakebase_text` and `lakebase_vector`, then only `lakebase_pilot.crm_search_documents`;
- the table has `client_id`, constrained `entity_type`, primary key `(client_id, entity_type, entity_id)`, stored `search_vector`, `content_hash`, and timestamps;
- index SQL drops/rebuilds only named indexes in `lakebase_pilot`, creates one B-tree tenant index, one GIN index, and one `lakebase_bm25` index;
- teardown SQL is exactly scoped to `DROP SCHEMA IF EXISTS lakebase_pilot CASCADE;`;
- fixture records belong to two clients with overlapping text and contain all five entity types;
- fixture judgements never expect a record owned by the other client or a soft-deleted record.

The checked-in fixture shape is:

```json
{
  "clients": [
    { "id": "10000000-0000-4000-8000-000000000001", "name": "Harbour Auto" },
    { "id": "20000000-0000-4000-8000-000000000002", "name": "Summit Studio" }
  ],
  "documents": [
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "person", "id": "11000000-0000-4000-8000-000000000001", "title": "Jordan Lee", "subtitle": "jordan@harbour.example", "body": "Fleet manager interested in electric demonstrator vehicles", "deleted": false },
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "company", "id": "12000000-0000-4000-8000-000000000002", "title": "North Star Logistics", "subtitle": "northstar-logistics.example", "body": "Commercial fleet replacement and servicing", "deleted": false },
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "opportunity", "id": "13000000-0000-4000-8000-000000000003", "title": "Electric fleet renewal", "subtitle": "qualified", "body": "Twenty vehicle replacement program with charging consultation", "deleted": false },
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "activity", "id": "14000000-0000-4000-8000-000000000004", "title": "Test drive follow-up", "subtitle": "call", "body": "Jordan requested a Thursday electric demonstrator test drive", "deleted": false },
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "task", "id": "15000000-0000-4000-8000-000000000005", "title": "Prepare fleet proposal", "subtitle": "open", "body": "Include trade-in and charging options", "deleted": false },
    { "clientId": "10000000-0000-4000-8000-000000000001", "type": "person", "id": "16000000-0000-4000-8000-000000000006", "title": "Deleted Electric Record", "subtitle": null, "body": "Must never appear", "deleted": true },
    { "clientId": "20000000-0000-4000-8000-000000000002", "type": "person", "id": "21000000-0000-4000-8000-000000000001", "title": "Jordan Lee", "subtitle": "jordan@summit.example", "body": "Creative director for an electric vehicle launch", "deleted": false },
    { "clientId": "20000000-0000-4000-8000-000000000002", "type": "task", "id": "25000000-0000-4000-8000-000000000005", "title": "Prepare launch proposal", "subtitle": "open", "body": "Brand campaign and studio production estimate", "deleted": false }
  ],
  "queries": [
    { "id": "q-electric-fleet", "clientId": "10000000-0000-4000-8000-000000000001", "query": "electric fleet", "relevantIds": ["13000000-0000-4000-8000-000000000003", "11000000-0000-4000-8000-000000000001"] },
    { "id": "q-jordan", "clientId": "10000000-0000-4000-8000-000000000001", "query": "Jordan Lee", "relevantIds": ["11000000-0000-4000-8000-000000000001"] },
    { "id": "q-domain", "clientId": "10000000-0000-4000-8000-000000000001", "query": "northstar logistics", "relevantIds": ["12000000-0000-4000-8000-000000000002"] },
    { "id": "q-test-drive", "clientId": "10000000-0000-4000-8000-000000000001", "query": "test drive Thursday", "relevantIds": ["14000000-0000-4000-8000-000000000004"] },
    { "id": "q-proposal", "clientId": "10000000-0000-4000-8000-000000000001", "query": "proposal charging", "relevantIds": ["15000000-0000-4000-8000-000000000005"] },
    { "id": "q-none", "clientId": "10000000-0000-4000-8000-000000000001", "query": "marine insurance", "relevantIds": [] }
  ]
}
```

- [ ] **Step 2: Run the database contract test and verify it fails**

Run: `pnpm exec vitest run test/lakebase/pilotDatabase.test.ts`

Expected: FAIL because the SQL, fixture, and database modules do not exist.

- [ ] **Step 3: Add the schema and post-load indexes**

`schema.sql` must contain:

```sql
CREATE EXTENSION IF NOT EXISTS lakebase_vector CASCADE;
CREATE EXTENSION IF NOT EXISTS lakebase_text CASCADE;
CREATE SCHEMA IF NOT EXISTS lakebase_pilot;

CREATE TABLE IF NOT EXISTS lakebase_pilot.crm_search_documents (
  client_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('person','company','opportunity','activity','task')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  body TEXT NOT NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || COALESCE(subtitle, '') || ' ' || body)
  ) STORED,
  source_updated_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, entity_type, entity_id)
);
```

`indexes.sql` must drop and recreate only these indexes after fixture insertion:

```sql
DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_client_idx;
DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_gin_idx;
DROP INDEX IF EXISTS lakebase_pilot.crm_search_documents_bm25_idx;
CREATE INDEX crm_search_documents_client_idx ON lakebase_pilot.crm_search_documents (client_id);
CREATE INDEX crm_search_documents_gin_idx ON lakebase_pilot.crm_search_documents USING gin (search_vector);
CREATE INDEX crm_search_documents_bm25_idx ON lakebase_pilot.crm_search_documents USING lakebase_bm25 (search_vector)
  WITH (default_limit = 50, prefilter = true);
```

- [ ] **Step 4: Implement guarded setup and teardown**

`runPilotSetup` order is fixed:

1. `resolvePilotTarget(env, 'mutate')`.
2. `inspectLakebaseCapability` and block unless ready.
3. Execute `schema.sql`.
4. `TRUNCATE lakebase_pilot.crm_search_documents`.
5. Insert only `deleted: false` fixture rows with parameterised SQL and SHA-256 `content_hash`.
6. Execute `indexes.sql` after population.
7. Execute `VACUUM ANALYZE lakebase_pilot.crm_search_documents` outside a transaction.
8. Return redacted counts and index names.

`runPilotTeardown` resolves the mutation target again and executes only the checked-in `teardown.sql`. It never drops a database, branch, endpoint, or project.

`createPilotDatabase` uses `pg.Client` with the explicit pilot URL and exposes `query`, `transaction`, and `close`. Its transaction wrapper issues `BEGIN`, executes the callback on the same client, and then `COMMIT`; on callback or commit failure it attempts `ROLLBACK` and rethrows. No module-level client or process-wide connection cache is permitted.

- [ ] **Step 5: Run database, capability, and safety tests**

Run:

```bash
pnpm exec vitest run test/lakebase/pilotContracts.test.ts test/lakebase/pilotCapability.test.ts test/lakebase/pilotDatabase.test.ts
```

Expected: PASS; fixture contains no real domains, emails, or identifiers.

- [ ] **Step 6: Commit the reproducible corpus**

```bash
git add scripts/lakebase-pilot/database.ts scripts/lakebase-pilot/setup.ts scripts/lakebase-pilot/teardown.ts scripts/lakebase-pilot/sql test/fixtures/lakebase-crm-search.json test/lakebase/pilotDatabase.test.ts
git commit -m "feat(lakebase): add isolated CRM pilot corpus"
```

---

### Task 5: GIN and BM25 Search Engines

**Files:**
- Create: `scripts/lakebase-pilot/search.ts`
- Test: `test/lakebase/pilotSearch.test.ts`

**Interfaces:**
- Consumes: query text, client UUID, bounded limit, and a transaction-capable pilot DB client.
- Produces: `buildLegacyPilotSearchQuery`, `buildBm25PilotSearchQuery`, `normalizeBm25Rank`, `searchLegacyPilot`, `searchBm25Pilot`, and `PilotSearchHit` compatible with `CrmSearchHit`.

- [ ] **Step 1: Write failing SQL boundary tests**

```ts
it.each([buildLegacyPilotSearchQuery, buildBm25PilotSearchQuery])(
  'parameterises query, client, and limit and filters the client before ranking',
  build => {
    const built = build('10000000-0000-4000-8000-000000000001', 'electric fleet', 20)
    expect(built.params).toEqual(['electric fleet', '10000000-0000-4000-8000-000000000001', 20])
    expect(built.sql).not.toContain('electric fleet')
    expect(built.sql).toMatch(/WHERE\s+client_id\s*=\s*\$2/i)
    expect(built.sql).toContain('LIMIT $3')
  }
)

it('uses the schema-qualified BM25 index and ascending raw score', () => {
  const built = buildBm25PilotSearchQuery(CLIENT, 'proposal', 20)
  expect(built.sql).toContain("'lakebase_pilot.crm_search_documents_bm25_idx'")
  expect(built.sql).toContain('<@>')
  expect(built.sql).toMatch(/ORDER BY\s+raw_score ASC/i)
})

it('runs BM25 prefilter and query inside one transaction', async () => {
  const client = { query: vi.fn().mockResolvedValue({ rows: [] }) }
  const transaction = vi.fn(async callback => callback(client))
  await searchBm25Pilot({ transaction }, CLIENT, 'proposal', 20)
  expect(client.query.mock.calls[0][0]).toBe('SET LOCAL lakebase_bm25.prefilter = on')
  expect(client.query.mock.calls[1][0]).toContain('lakebase_pilot.crm_search_documents')
})
```

Also test blank queries return `[]`, limits clamp to `1..50`, and `normalizeBm25Rank(-8) > normalizeBm25Rank(-2) > 0`.

- [ ] **Step 2: Run the search test and verify it fails**

Run: `pnpm exec vitest run test/lakebase/pilotSearch.test.ts`

Expected: FAIL because `search.ts` does not exist.

- [ ] **Step 3: Implement the legacy and BM25 query builders**

Legacy query core:

```sql
SELECT entity_type AS type, entity_id::text AS id, title, subtitle,
       ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS raw_score
FROM lakebase_pilot.crm_search_documents
WHERE client_id = $2
  AND search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY raw_score DESC, title ASC, entity_id ASC
LIMIT $3
```

BM25 query core:

```sql
SELECT entity_type AS type, entity_id::text AS id, title, subtitle,
       search_vector <@> to_bm25query(
         to_tsvector('english', $1),
         'lakebase_pilot.crm_search_documents_bm25_idx'
       ) AS raw_score
FROM lakebase_pilot.crm_search_documents
WHERE client_id = $2
  AND search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY raw_score ASC, title ASC, entity_id ASC
LIMIT $3
```

Return public BM25 `rank` as `Math.max(0, -rawScore)`. Lakebase's more-relevant score is more negative, so negation makes the existing higher-is-better public contract monotonic without exposing a reversed direction. Implement and test this exact transformation.

- [ ] **Step 4: Run search and CRM regression tests**

Run:

```bash
pnpm exec vitest run test/lakebase/pilotSearch.test.ts test/crm/search.test.ts test/ai/tools/searchCrm.test.ts
```

Expected: PASS; existing CRM result shape remains unchanged.

- [ ] **Step 5: Commit both engines**

```bash
git add scripts/lakebase-pilot/search.ts test/lakebase/pilotSearch.test.ts
git commit -m "feat(lakebase): compare CRM GIN and BM25 search"
```

---

### Task 6: Retrieval Metrics and Acceptance Decision

**Files:**
- Create: `scripts/lakebase-pilot/metrics.ts`
- Test: `test/lakebase/pilotMetrics.test.ts`

**Interfaces:**
- Consumes: fixture judgements, ordered result IDs, latency samples, failure/fallback counts, and leakage counts.
- Produces: `precisionAtK`, `recallAtK`, `reciprocalRank`, `percentile`, `summarizeEngine`, and `decideBm25Gate`.

- [ ] **Step 1: Write failing metric tests with exact expected values**

```ts
expect(precisionAtK(['a', 'x', 'b'], new Set(['a', 'b']), 3)).toBeCloseTo(2 / 3)
expect(recallAtK(['a', 'x', 'b'], new Set(['a', 'b', 'c']), 3)).toBeCloseTo(2 / 3)
expect(reciprocalRank(['x', 'b', 'a'], new Set(['a', 'b']))).toBe(0.5)
expect(percentile([10, 20, 30, 40], 0.95)).toBe(40)
```

Gate tests must prove:

- any leakage blocks;
- any fallback/missing-extension failure blocks;
- relevance regression blocks even when latency improves;
- `mrrImprovement >= 0.10` passes when Precision@5 is not worse;
- `p95Improvement >= 0.30` passes when Precision@5 and MRR do not regress;
- a passing result is `eligible_for_hybrid_review`, never automatic hybrid activation.

- [ ] **Step 2: Run the metric test and verify the red state**

Run: `pnpm exec vitest run test/lakebase/pilotMetrics.test.ts`

Expected: FAIL because `metrics.ts` does not exist.

- [ ] **Step 3: Implement pure deterministic metrics**

Use this decision result:

```ts
export interface Bm25GateDecision {
  status: 'eligible_for_hybrid_review' | 'hold'
  passed: boolean
  blockers: Array<
    | 'cross_client_leakage'
    | 'soft_delete_leakage'
    | 'query_failure'
    | 'precision_regression'
    | 'insufficient_improvement'
  >
}
```

Empty relevant sets count as a correct no-result query only when the returned list is empty. Sort blockers in the order defined above so reports and tests are stable.

- [ ] **Step 4: Run the focused test**

Run: `pnpm exec vitest run test/lakebase/pilotMetrics.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit metrics**

```bash
git add scripts/lakebase-pilot/metrics.ts test/lakebase/pilotMetrics.test.ts
git commit -m "feat(lakebase): score pilot retrieval evidence"
```

---

### Task 7: Evaluation CLI and Redacted Evidence Reports

**Files:**
- Create: `scripts/lakebase-pilot/evaluate.ts`
- Test: `test/lakebase/pilotEvaluate.test.ts`

**Interfaces:**
- Consumes: pilot target, synthetic fixture, both search engines, metrics, `--runs`, `--output`, and optional `--cold-start` label.
- Produces: `parseEvaluateArgs`, `runLakebaseEvaluation(options, deps)`, JSON report, and Markdown summary under `.data/lakebase-pilot/` by default.

- [ ] **Step 1: Write failing CLI and report tests**

Assert:

```ts
expect(parseEvaluateArgs(['--runs', '20', '--cold-start'])).toEqual({
  runs: 20,
  coldStart: true,
  outputDir: '.data/lakebase-pilot'
})
expect(() => parseEvaluateArgs(['--runs', '0'])).toThrow('Usage:')
expect(() => parseEvaluateArgs(['--runs', '501'])).toThrow('Usage:')
```

With injected search functions, verify the report:

- contains fixture query IDs but not query text;
- contains hashed result IDs but not source UUIDs;
- contains no database URL, API key, email address, or production identifier;
- reports p50/p95/max, Precision@5, Recall@10, MRR, overlap, failures, fallbacks, and leakage;
- marks `--cold-start` as an operator assertion rather than claiming the script suspended compute;
- returns exit `0` only when `decideBm25Gate` passes.

- [ ] **Step 2: Run the evaluation test and verify it fails**

Run: `pnpm exec vitest run test/lakebase/pilotEvaluate.test.ts`

Expected: FAIL because `evaluate.ts` does not exist.

- [ ] **Step 3: Implement bounded evaluation**

For each synthetic query:

1. Run legacy search once and BM25 once for relevance.
2. Repeat each engine `runs` times for latency, bounded to `1..500`.
3. Verify every returned ID belongs to the requested fixture client and is not deleted.
4. Hash IDs with SHA-256 before adding them to report details.
5. Aggregate overlap and ranking metrics by query ID.
6. Write atomically using a temporary file followed by `rename`.

The report header is exactly:

```ts
{
  schemaVersion: 1,
  generatedAt: now.toISOString(),
  corpus: 'synthetic_crm_v1',
  identifiersEmitted: false,
  rawQueriesEmitted: false,
  cloudflareVectorizeChanged: false,
  productionDatabaseChanged: false,
  coldStartOperatorAsserted: options.coldStart
}
```

- [ ] **Step 4: Run all Lakebase unit tests**

Run: `pnpm exec vitest run test/lakebase`

Expected: all Lakebase test files pass with no network or database dependency.

- [ ] **Step 5: Commit the evaluator**

```bash
git add scripts/lakebase-pilot/evaluate.ts test/lakebase/pilotEvaluate.test.ts
git commit -m "feat(lakebase): generate redacted pilot evidence"
```

---

### Task 8: Operational Commands and Runbook

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Create: `docs/runbooks/neon-lakebase-search-pilot.md`
- Test: `test/lakebase/pilotRunbook.test.ts`

**Interfaces:**
- Consumes: all pilot CLIs from Tasks 1–7.
- Produces: stable package commands and a fail-closed operator sequence.

- [ ] **Step 1: Write the failing runbook/package contract test**

Read `package.json`, `.env.example`, and the runbook. Assert these scripts exist exactly:

```json
{
  "pilot:lakebase:preflight": "tsx scripts/lakebase-pilot/preflight.ts --json",
  "pilot:lakebase:enable": "tsx scripts/lakebase-pilot/enable.ts --json",
  "pilot:lakebase:setup": "tsx scripts/lakebase-pilot/setup.ts --json",
  "pilot:lakebase:evaluate": "tsx scripts/lakebase-pilot/evaluate.ts",
  "pilot:lakebase:teardown": "tsx scripts/lakebase-pilot/teardown.ts --json"
}
```

Assert the runbook contains:

- the separate-project requirement;
- production project/database refusal behavior;
- exact command order: preflight, enable, wake/restart confirmation, preflight, setup, evaluate;
- a five-minute idle instruction before `evaluate -- --cold-start` when measuring scale-to-zero behavior;
- explicit statements that Cloudflare Vectorize, production migrations, and deployments are untouched;
- BM25 gate thresholds from the design;
- teardown only after evidence retention and exact target re-verification;
- no example credentials or complete URLs.

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm exec vitest run test/lakebase/pilotRunbook.test.ts`

Expected: FAIL because scripts and runbook are not wired.

- [ ] **Step 3: Add environment names and package commands**

Append empty values only to `.env.example`:

```dotenv
LAKEBASE_PILOT_PROJECT_ID=
LAKEBASE_PILOT_ENDPOINT_ID=
LAKEBASE_PILOT_DATABASE_URL=
NEON_PRODUCTION_PROJECT_ID=
LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT=
LAKEBASE_PILOT_MODE=off
NEON_API_KEY=
```

Add the five package scripts from Step 1. Do not add these variables to `nuxt.config.ts`, Wrangler, or Cloudflare Pages because they are local/operator pilot controls.

- [ ] **Step 4: Write the exact runbook**

The runbook must instruct operators to load a gitignored `.env.lakebase-pilot`, then execute:

```bash
set -a
source .env.lakebase-pilot
set +a
pnpm pilot:lakebase:preflight
pnpm pilot:lakebase:enable
pnpm pilot:lakebase:preflight
pnpm pilot:lakebase:setup
pnpm pilot:lakebase:evaluate -- --runs 20
```

For a cold-start-labelled run, wait at least five minutes with no pilot connections, then run:

```bash
pnpm pilot:lakebase:evaluate -- --runs 20 --cold-start
```

The runbook must state that `--cold-start` records the operator assertion; it does not suspend or restart compute.

- [ ] **Step 5: Run runbook and full Lakebase tests**

Run:

```bash
pnpm exec vitest run test/lakebase
git diff --check
```

Expected: PASS and clean whitespace check.

- [ ] **Step 6: Commit operator controls**

```bash
git add package.json .env.example docs/runbooks/neon-lakebase-search-pilot.md test/lakebase/pilotRunbook.test.ts
git commit -m "docs(lakebase): add guarded pilot runbook"
```

---

### Task 9: Live Non-Production Capability and BM25 Pilot

**Files:**
- Generated but ignored: `.data/lakebase-pilot/*.json`
- Generated but ignored: `.data/lakebase-pilot/*.md`
- No tracked source change unless live evidence exposes a defect that is fixed through a new red-green cycle.

**Interfaces:**
- Consumes: a separate pilot project, scoped Neon API access, and the runbook commands.
- Produces: redacted capability evidence and a BM25 gate decision.

- [ ] **Step 1: Verify external authority without printing values**

Run:

```bash
node -e 'const keys=["LAKEBASE_PILOT_PROJECT_ID","LAKEBASE_PILOT_ENDPOINT_ID","LAKEBASE_PILOT_DATABASE_URL","NEON_PRODUCTION_PROJECT_ID","LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT","NEON_API_KEY"]; for (const key of keys) { if (!process.env[key]) { console.error(`missing:${key}`); process.exit(1) } } console.log("Lakebase pilot environment: present")'
```

Expected: only `Lakebase pilot environment: present`. If any value is absent, stop before all network or database mutations and report the exact missing variable name.

- [ ] **Step 2: Run read-only preflight**

Run: `pnpm pilot:lakebase:preflight`

Expected before enablement: the target is redacted; blockers may include missing preloads/extensions but must not include production-target errors.

- [ ] **Step 3: Enable preloads only on the verified pilot project**

Run: `pnpm pilot:lakebase:enable`

Expected: the response names only the pilot project/endpoint, preserves existing/default libraries, and reports either restart complete or restart deferred because the endpoint was idle.

- [ ] **Step 4: Re-run preflight before database mutation**

Run: `pnpm pilot:lakebase:preflight`

Expected: `ready: true`, PG16+, both preloads active, and both extensions available. Do not continue on any blocker.

- [ ] **Step 5: Build the synthetic pilot corpus**

Run: `pnpm pilot:lakebase:setup`

Expected: only `lakebase_pilot` objects are created, deleted fixtures are omitted, both indexes exist, and the output is aggregate-only.

- [ ] **Step 6: Execute warm and operator-asserted cold evaluations**

Run warm evaluation:

```bash
pnpm pilot:lakebase:evaluate -- --runs 20
```

After at least five minutes with no pilot connections, run:

```bash
pnpm pilot:lakebase:evaluate -- --runs 20 --cold-start
```

Expected: redacted reports under `.data/lakebase-pilot/`, with `eligible_for_hybrid_review` or `hold`. Neither result activates hybrid or production behavior.

- [ ] **Step 7: Retain evidence and defer teardown decision**

Summarize the aggregate report in the PR without attaching raw database output. Do not run `pilot:lakebase:teardown` until the evidence has been reviewed and the exact pilot target is re-confirmed. Project or endpoint deletion is outside this implementation plan and requires a separate destructive-action confirmation.

---

### Task 10: Deep Review, Graphify Confirmation, and Draft PR

**Files:**
- Review every file listed in this plan end-to-end.
- Graphify output remains ignored and is not committed.

**Interfaces:**
- Consumes: completed implementation and live/blocked pilot evidence.
- Produces: verified branch and draft PR; no merge or deployment.

- [ ] **Step 1: Re-read every changed and new file**

Confirm:

- no server import uses `~/server`; pilot scripts use relative imports or `~~/` only with the Nuxt server tsconfig;
- no connection string, API token, real user query, real email, or real identifier appears in source, tests, snapshots, or reports; synthetic `.example` values and fixture UUIDs are permitted only in the checked-in test corpus;
- all mutation paths invoke `resolvePilotTarget(..., 'mutate')` before constructing clients or fetch requests;
- Neon API origin is hardcoded and all IDs are encoded;
- every SQL query is parameterised and candidate retrieval includes `client_id = $2` before ordering/limit;
- teardown names only `lakebase_pilot`;
- BM25 score direction and public rank direction agree with tests;
- `hybrid` remains rejected;
- no production endpoint, migration, Worker binding, marketing page, or Vectorize file changed.

- [ ] **Step 2: Run focused and regression tests**

Run:

```bash
pnpm exec vitest run test/lakebase test/crm/search.test.ts test/ai/tools/searchCrm.test.ts
pnpm exec eslint scripts/lakebase-pilot test/lakebase
pnpm typecheck
```

Expected: focused tests and ESLint pass. For typecheck, distinguish pre-existing repository errors from any modified-path error; no modified-path error is acceptable.

- [ ] **Step 3: Run the full repository and build gates**

Run:

```bash
pnpm test:run
pnpm build
git diff --check
```

Expected: full suite and production build pass; the immutable Cloudflare Worker size budget remains unchanged.

- [ ] **Step 4: Refresh and query Graphify**

Run:

```bash
pnpm graphify:rebuild
graphify query "How is the Lakebase pilot isolated from production Neon and Cloudflare Vectorize?" --budget 1800
```

Expected: the graph connects the pilot safety contract, separate-project controls, CRM search experiment, and unchanged Vectorize boundary. If the graph contradicts the implementation, correct the source and repeat verification.

- [ ] **Step 5: Commit any review-only corrections atomically**

If review finds a defect, add a failing test first, fix it, re-run its gates, then commit only that correction. If no correction is needed, create no empty commit.

- [ ] **Step 6: Push and create a draft PR**

Run:

```bash
git push
gh pr create --draft --base main --head spike/neon-lakebase-hybrid-search --title "feat: pilot Neon Lakebase CRM search" --body-file docs/superpowers/specs/2026-08-08-neon-lakebase-search-pilot-design.md
```

The PR summary must explicitly state: separate non-production Neon project, no production migration, no Cloudflare deployment, no Vectorize change, live pilot evidence status, and whether the BM25 gate is `eligible_for_hybrid_review`, `hold`, or blocked by missing external credentials.

Do not merge the PR. The other session remains authoritative for main and production coordination.
