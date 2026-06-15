# Google Spend Sync — Queue Fan-out Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task.

**Goal:** Make the daily Google ad-spend sync actually complete by fanning it out to the `agency-jobs` queue — one message per ad account — exactly like Meta, instead of looping ~102 accounts sequentially inside one Cloudflare `waitUntil` context that gets killed (~143 s of work) before finishing.

**Root cause (proven):** `syncGoogleSpend` loops all connections in `runSpendSyncInBackground` (`waitUntil`). A live probe showed token-refresh + MCC + GAQL all work (~1.4 s/account, real data returned), so the only failure is orchestration: 102 × 1.4 s ≫ the `waitUntil` budget → killed mid-loop → job stuck `running`, last data Jun 9. Meta avoids this via per-account queue fan-out.

**Architecture:** Extract the per-account loop body into a reusable `processGoogleConnection`; `syncGoogleSpend` keeps using it in a loop (local-dev fallback, unchanged behavior); add `syncGoogleSpendByConnectionId` (one account → `SyncJobResult`) + `listGoogleConnectionIds`; the queue consumer gains a `spend.sync.google.account` handler that fans results into the job row via the existing `recordSyncJobAccountResult` (atomic, completes on the last account); the cron kickoff fans Google out per-account like Meta. **No worker change** (the generic `jobs-consumer` already forwards every `agency-jobs` message to `/api/internal/process-job`, and its `max_concurrency=2` throttle keeps Google under its rate limit), **no migration, no new binding.**

**Tech Stack:** Nitro, Neon Postgres, Cloudflare Queues, Vitest.

**Diagnosis source:** this session's investigation; [[budget-health-campaigns-not-loading]].

---

## File Structure

- `server/utils/spendSync.ts` — **modify**: extract `processGoogleConnection`, refactor `syncGoogleSpend` to use it, add `syncGoogleSpendByConnectionId` + `listGoogleConnectionIds`.
- `server/utils/queueConsumer.ts` — **modify**: add `processGoogleAccountSpendSync` + `case 'spend.sync.google.account'`.
- `server/utils/spendSyncKickoff.ts` — **modify**: Google → queue fan-out (fallback to background).
- `test/server/utils/spendSyncKickoff.test.ts` — **new**: fan-out unit test (mocked queue/deps).

---

## Task 1: Extract per-account Google sync (behavior-preserving)

**Files:** `server/utils/spendSync.ts`

The current `syncGoogleSpend` body has: (a) load connections + mappings, (b) resolve `mccId`, (c) `for (const conn of connections)` loop doing token-refresh → `getMonthlySpend` (403-retry-without-mcc) → per-campaign `media_spend` upsert (+ rolling budget) → daily-spend pass. Lift the **loop body** into a helper so one account can be synced in isolation.

- [ ] **Step 1: Add `processGoogleConnection` (the lifted loop body) + a shared connection type**

Define a context type and a per-connection function. The body is the EXACT current loop body (lines ~302–446), returning counts instead of mutating outer vars:
```ts
interface GoogleSyncCtx {
  month: number
  year: number
  period: string
  mccId: string | undefined
  mappings: Array<{ connection_id: string, campaign_id: string | null, campaign_name_pattern: string | null, xero_client_name: string, xero_client_code: string | null }>
  config: { googleClientId: string, googleClientSecret: string, googleDeveloperToken: string }
}

interface GoogleConnRow {
  id: string
  account_id: string
  account_name: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  metadata: any
}

async function processGoogleConnection(
  conn: GoogleConnRow,
  ctx: GoogleSyncCtx,
  deps: { refreshGoogleToken: any, getMonthlySpend: any, getDailySpend: any }
): Promise<{ synced: number, totalSpend: number, failures: Array<{ account: string, reason: string }> }> {
  const failures: Array<{ account: string, reason: string }> = []
  let synced = 0
  let totalSpend = 0
  const { month, year, period, mccId, mappings, config } = ctx
  // <PASTE the existing loop body verbatim: token refresh, getMonthlySpend with
  //  403-retry-without-mcc, the `for (const campaign of campaigns)` upsert block
  //  (using `mappings`/`period`/`conn`), and the daily-spend pass.
  //  Replace `failures.push(...)` (same), `totalSpend +=` (same), `totalSynced++`
  //  with `synced++`, and `continue` stays. Use deps.refreshGoogleToken /
  //  deps.getMonthlySpend / deps.getDailySpend instead of the closure imports.>
  return { synced, totalSpend: Math.round(totalSpend * 100) / 100, failures }
}
```
> **Engineer note:** This is a mechanical lift. Copy lines 302–446 of the current `for (const conn of connections)` body into the function, swapping the three accumulator references. Do not change any SQL or logic. `findMapping`, `getRollingBudget`, `queryOne`, `queryRows` are module-scoped and remain in scope.

- [ ] **Step 2: Refactor `syncGoogleSpend` to call `processGoogleConnection`**

Replace the inline loop with:
```ts
  const { refreshGoogleToken, getMonthlySpend, getDailySpend } = await import('~~/server/utils/googleAdsClient')
  const deps = { refreshGoogleToken, getMonthlySpend, getDailySpend }
  const ctx: GoogleSyncCtx = { month, year, period, mccId, mappings, config: config as any }
  for (const conn of connections) {
    const r = await processGoogleConnection(conn, ctx, deps)
    totalSynced += r.synced
    totalSpend += r.totalSpend
    failures.push(...r.failures)
  }
```
(Keep the existing connection/mapping/mcc resolution above it, and the existing `return { synced: totalSynced, ... }`.) The imports of `getMonthlySpend`/`getDailySpend` already happen at the top of `syncGoogleSpend` — reuse them; just thread them through `deps`.

- [ ] **Step 3: Add `syncGoogleSpendByConnectionId` (single account → SyncJobResult)**

```ts
/**
 * Sync ONE Google connection's spend — the per-account queue chunk. Mirrors
 * syncMetaSpendByConnectionId. Catches per-account errors into `failures` so the
 * queue fan-in stays exactly-once (rarely throws).
 */
export async function syncGoogleSpendByConnectionId(connectionId: string, month: number, year: number): Promise<{ synced: number, totalSpend: number, failures: Array<{ account: string, reason: string }> }> {
  const { refreshGoogleToken, getMonthlySpend, getDailySpend, listAccessibleCustomers } = await import('~~/server/utils/googleAdsClient')
  const period = `${year}-${String(month).padStart(2, '0')}`
  const config = useRuntimeConfig()

  const conn = await queryOne<GoogleConnRow>(
    `SELECT id, account_id, account_name, access_token, refresh_token, token_expires_at, metadata
     FROM social_connections WHERE id = $1 AND platform = 'google' AND status = 'active'`,
    [connectionId]
  )
  if (!conn) return { synced: 0, totalSpend: 0, failures: [{ account: connectionId, reason: 'connection not found' }] }

  const mappings = await queryRows<GoogleSyncCtx['mappings'][number]>(
    `SELECT connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code FROM ad_account_client_map`
  )

  // Resolve the manager id once for this account (configured MCC wins, else detect).
  const configuredMcc = (config.googleAdsLoginCustomerId as string) || ''
  let mccId: string | undefined
  if (configuredMcc) {
    mccId = resolveGoogleManagerId({ configured: configuredMcc })
  } else {
    try {
      const accessibleIds = await listAccessibleCustomers(conn.access_token, config.googleDeveloperToken)
      mccId = resolveGoogleManagerId({ accessibleIds, connectionAccountIds: new Set([conn.account_id.replace(/-/g, '')]) })
    } catch { /* leave undefined; processGoogleConnection retries without mcc on 403 */ }
  }

  const ctx: GoogleSyncCtx = { month, year, period, mccId, mappings, config: config as any }
  return processGoogleConnection(conn, ctx, { refreshGoogleToken, getMonthlySpend, getDailySpend })
}

/** Active Google connection ids — mirror of listMetaConnectionIds. */
export async function listGoogleConnectionIds(): Promise<string[]> {
  const rows = await queryRows<{ id: string }>(
    `SELECT id FROM social_connections WHERE platform = 'google' AND status = 'active'`
  )
  return rows.map(r => r.id)
}
```

- [ ] **Step 4: Verify the extraction didn't change `syncGoogleSpend`'s behavior**

Run: `npx vitest run test/server/utils/spendSync.test.ts`
Expected: PASS (existing spend-sync tests still green — the refactor is behavior-preserving).

- [ ] **Step 5: Commit**

```bash
git add server/utils/spendSync.ts
git commit -m "refactor(spend): extract per-account Google sync (processGoogleConnection + byConnectionId)"
```

---

## Task 2: Queue consumer — per-account Google handler

**Files:** `server/utils/queueConsumer.ts`

- [ ] **Step 1: Add the handler + route the new job type**

Add a case in the `switch (job.type)` next to `spend.sync.google`:
```ts
      case 'spend.sync.google.account':
        await processGoogleAccountSpendSync(job.payload)
        break
```
And the handler (mirror `processMetaAccountSpendSync`):
```ts
async function processGoogleAccountSpendSync(payload: Record<string, any>): Promise<void> {
  const { syncGoogleSpendByConnectionId } = await import('~~/server/utils/spendSync')
  const { recordSyncJobAccountResult } = await import('~~/server/utils/spendSyncJobs')
  const jobId = payload.jobId as string | undefined
  const result = await syncGoogleSpendByConnectionId(payload.connectionId, payload.month, payload.year)
  if (jobId) await recordSyncJobAccountResult(jobId, result)
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/queueConsumer.ts
git commit -m "feat(spend): queue consumer handles per-account Google sync (spend.sync.google.account)"
```

---

## Task 3: Kickoff — fan Google out per account

**Files:** `server/utils/spendSyncKickoff.ts`, `test/server/utils/spendSyncKickoff.test.ts`

- [ ] **Step 1: Write the failing fan-out test**

```ts
// test/server/utils/spendSyncKickoff.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sends: any[] = []
const queue = { send: vi.fn(async (m: any) => { sends.push(m) }) }
vi.mock('~~/server/utils/queue', () => ({ getQueue: () => queue }))
vi.mock('~~/server/utils/spendSync', () => ({
  listMetaConnectionIds: async () => ['m1', 'm2'],
  listGoogleConnectionIds: async () => ['g1', 'g2', 'g3'],
  syncMetaSpend: vi.fn(), syncGoogleSpend: vi.fn(), syncMicrosoftSpend: vi.fn(),
  syncPinterestSpend: vi.fn(), syncTikTokSpend: vi.fn(), syncLinkedinSpend: vi.fn(),
  syncSnapchatSpend: vi.fn(), syncTwitterSpend: vi.fn(),
}))
vi.mock('~~/server/utils/spendSyncJobs', () => ({
  createSpendSyncJob: vi.fn(async () => 'job-1'),
  setSyncJobTotalAccounts: vi.fn(),
}))
vi.mock('~~/server/utils/asyncBackground', () => ({ runSpendSyncInBackground: vi.fn() }))

import { startSpendSyncAllPlatforms } from '~~/server/utils/spendSyncKickoff'

beforeEach(() => { sends.length = 0; queue.send.mockClear() })

describe('startSpendSyncAllPlatforms — Google fan-out', () => {
  it('enqueues one spend.sync.google.account message per Google connection', async () => {
    const event = { context: {} } as any
    await startSpendSyncAllPlatforms(event, 6, 2026)
    const googleMsgs = sends.filter(m => m.type === 'spend.sync.google.account')
    expect(googleMsgs.map(m => m.payload.connectionId)).toEqual(['g1', 'g2', 'g3'])
    expect(googleMsgs.every(m => m.payload.jobId === 'job-1' && m.payload.month === 6 && m.payload.year === 2026)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/server/utils/spendSyncKickoff.test.ts`
Expected: FAIL — no `spend.sync.google.account` messages sent (Google still uses background).

- [ ] **Step 3: Implement the Google fan-out**

In `spendSyncKickoff.ts`: import `listGoogleConnectionIds`, `createSpendSyncJob`, `setSyncJobTotalAccounts` (the latter two are already imported). Replace the Google entry in the `SECONDARY_PLATFORMS` loop with a dedicated queue fan-out BEFORE the secondary loop (and drop `google_ads` from `SECONDARY_PLATFORMS`):
```ts
  // Google — per-account queue fan-out (same durable path as Meta). The old
  // single-waitUntil loop was killed by Cloudflare's time budget at ~100 accounts.
  try {
    const queue = getQueue(event)
    const googleIds = queue ? await listGoogleConnectionIds() : []
    if (queue && googleIds.length > 0) {
      const jobId = await createSpendSyncJob('google', period, null)
      await setSyncJobTotalAccounts(jobId, googleIds.length)
      const enqueuedAt = new Date().toISOString()
      await Promise.all(googleIds.map(connectionId =>
        queue!.send({ type: 'spend.sync.google.account', payload: { connectionId, month, year, jobId }, enqueuedAt }, { contentType: 'json' })
      ))
    } else {
      runSpendSyncInBackground(event, {
        label: `cron google sync-spend ${period}`,
        sync: () => syncGoogleSpend(month, year),
        kvKeys: [`spend:summary:${period}:all`, `spend:summary:${period}:google_ads`, `spend:google:accounts:${period}`, `spend:daily:google:${period}`],
      })
    }
  } catch (err) {
    console.error('[cron sync-spend] google kickoff failed:', err)
  }
```
Remove `{ platform: 'google_ads', short: 'google', fn: syncGoogleSpend }` from `SECONDARY_PLATFORMS` (the other secondaries — microsoft/tiktok/etc. — keep the background path; they have few/no accounts). Add `google` to the `secondary`/result list or note it in the return as queued.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run test/server/utils/spendSyncKickoff.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/spendSyncKickoff.ts test/server/utils/spendSyncKickoff.test.ts
git commit -m "feat(spend): fan Google sync out per-account to the queue (durable, like Meta)"
```

---

## Task 4: Deploy + verify end-to-end

This fix can only be truly verified by a real run (the per-account logic is I/O; the live probe already proved the Google API path works at ~1.4 s/account).

- [ ] **Step 1: Full suite**

Run: `npx vitest run test/server/utils/spendSyncKickoff.test.ts test/server/utils/spendSync.test.ts`
Expected: PASS.

- [ ] **Step 2: Deploy Pages** (no worker redeploy needed — `jobs-consumer` is generic)

Deploy from `.worktrees/deploy-prod` (`pnpm deploy:production`).

- [ ] **Step 3: Trigger a sync + watch the Google job complete**

Trigger the cron route (or the manual UI sync), then poll:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT platform, status, processed_accounts, total_accounts, synced_count, total_spend, started_at, finished_at FROM spend_sync_jobs WHERE platform='google' ORDER BY started_at DESC LIMIT 3"
```
Expected (within a few minutes, throttled at concurrency 2): a `google` job with `status='completed'`, `processed_accounts == total_accounts` (~102), non-zero `synced_count`/`total_spend`, and `finished_at` set.

- [ ] **Step 4: Confirm fresh data landed**

```bash
psql "$DATABASE_URL" -c "SELECT MAX(synced_at) AS last_google_sync, ROUND(EXTRACT(EPOCH FROM (NOW()-MAX(synced_at)))/60,1) AS mins_ago FROM media_spend WHERE platform='google_ads' AND period='2026-06'"
```
Expected: `mins_ago` in single digits — Google spend is now fresh. Bust the KV summary cache if the page still shows stale (`spend:summary:no-tenant:2026-06:{all,google_ads}`), or just wait out the 300 s TTL.

---

## Self-Review

**Coverage:** root cause (sequential waitUntil) → per-account queue fan-out (Task 1 extraction + Task 3 kickoff) ✓; consumer routing (Task 2) ✓; atomic fan-in reuses `recordSyncJobAccountResult` ✓; no worker/migration/binding change ✓; local-dev fallback preserved (Task 1 keeps `syncGoogleSpend`; Task 3 falls back when no queue) ✓; throttle inherited from `jobs-consumer` config ✓; verified end-to-end (Task 4) ✓.

**Placeholder scan:** one explicit "paste the loop body verbatim" engineer-note in Task 1 Step 1 — a mechanical lift with exact line references, not missing logic.

**Type consistency:** `processGoogleConnection` / `syncGoogleSpendByConnectionId` return the `{ synced, totalSpend, failures }` shape that `recordSyncJobAccountResult` consumes (matches `syncMetaSpendByConnectionId`); `listGoogleConnectionIds` mirrors `listMetaConnectionIds`; the queue message shape matches the Meta `spend.sync.meta.account` payload (`connectionId, month, year, jobId`).
```
