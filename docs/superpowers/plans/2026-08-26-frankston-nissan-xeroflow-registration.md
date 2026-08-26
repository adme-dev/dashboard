# Frankston Nissan XeroFlow Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register Frankston Nissan under Frankston Motor Group and safely reuse its existing Meta product feed through XeroFlow's confirmation-gated MCP workflow.

**Architecture:** Add an idempotent client alias and thread an optional exact Meta product-feed ID through the existing platform, application, proposal-preview, and confirmation layers. A shared selector fails closed when an explicitly requested feed is not inside the selected catalogue. Operational registration uses existing audited boundaries and is accepted only after MCP readback.

**Tech Stack:** Nuxt 4/Nitro, TypeScript, Vitest, Neon Postgres, Meta Graph API, XeroFlow MCP tools

**Spec:** `docs/superpowers/specs/2026-08-26-frankston-nissan-feed-management-design.md`

## Global Constraints

- Work only in `/Users/paulgiurin/Documents/Projects/dashboard/.worktrees/frankston-nissan-feed-management` on `feature/frankston-nissan-feed-management`.
- Preserve the user's active dashboard checkout and every other worktree.
- Canonical client ID is `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`; `Frankston Nissan` is an alias, not a new client.
- Frankston Nissan Meta catalogue is `952157521953514`; existing product feed is `638660590098129`.
- Explicit product-feed selection must fail closed and must never fall back to feed creation.
- Omitted product-feed selection retains the existing URL-match/create behavior.
- The Frankston Nissan proposal uses an hourly schedule in `Australia/Sydney`.
- `propose_attach_catalog_feed` and `propose_refresh_catalog_feed` retain their confirmation requirements; owner god-mode does not bypass confirmation.
- Do not change product sets, campaign targeting, ads, budgets, creative, audiences, or campaign status.
- Apply every new SQL migration automatically to the configured Neon database after focused tests pass.
- Update the existing Dealer Inventory Feeds marketing copy because the public feature contract changes.
- Use test-driven development and atomic commits.

---

## Execution Setup

- [ ] **Confirm isolation and install the locked dependency graph**

```bash
git status -sb
git branch --show-current
pnpm install --frozen-lockfile
```

Expected branch: `feature/frankston-nissan-feed-management`; expected status: clean before implementation.

- [ ] **Verify the untouched focused baseline**

```bash
pnpm vitest run \
  test/ai/tools/clients.test.ts \
  test/server/utils/metaCatalogPlatform.test.ts \
  test/server/utils/metaCatalogProvider.test.ts \
  test/server/utils/metaCatalogApplication.test.ts \
  test/ai/mcpFeedTools.test.ts \
  test/public/metaCatalogPlatformMarketing.test.ts \
  test/app/metaCatalogPlatformUi.test.ts
```

Expected: PASS before any source edit. If it fails, report the exact baseline failure and stop for direction.

---

### Task 1: Seed the Frankston Nissan client alias

**Files:**
- Create: `server/database/migrations/401_frankston_nissan_client_alias.sql`
- Create: `test/config/frankstonNissanClientAliasMigration.test.ts`

**Interfaces:**
- Consumes: `agency_clients` and `agency_client_aliases` from migration `338_client_identity_aliases.sql`.
- Produces: normalized alias `Frankston Nissan` bound to client `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`.

- [ ] **Step 1: Write the failing migration contract test**

Create `test/config/frankstonNissanClientAliasMigration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/401_frankston_nissan_client_alias.sql', import.meta.url),
  'utf8',
)

describe('Frankston Nissan client alias migration', () => {
  it('maps the alias to the existing Frankston Motor Group identity idempotently', () => {
    expect(migration).toContain("'8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid")
    expect(migration).toContain("'Frankston Motor Group'")
    expect(migration).toContain("'Frankston Nissan'")
    expect(migration).toMatch(/INSERT INTO agency_client_aliases/)
    expect(migration).toMatch(/ON CONFLICT \(LOWER\(alias\)\) DO UPDATE/)
    expect(migration).not.toMatch(/INSERT INTO agency_clients/)
  })

  it('fails instead of silently creating a mapping when the canonical client is absent', () => {
    expect(migration).toMatch(/IF NOT EXISTS[\s\S]*RAISE EXCEPTION/)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm vitest run test/config/frankstonNissanClientAliasMigration.test.ts
```

Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Create the idempotent migration**

Create `server/database/migrations/401_frankston_nissan_client_alias.sql`:

```sql
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM agency_clients
    WHERE id = '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid
      AND LOWER(name) = LOWER('Frankston Motor Group')
  ) THEN
    RAISE EXCEPTION 'Frankston Motor Group canonical client is missing or mismatched';
  END IF;
END
$$;

INSERT INTO agency_client_aliases (client_id, alias, source)
VALUES (
  '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd'::uuid,
  'Frankston Nissan',
  'catalogue_feed_registration'
)
ON CONFLICT (LOWER(alias)) DO UPDATE SET
  client_id = EXCLUDED.client_id,
  source = EXCLUDED.source,
  updated_at = NOW();

COMMIT;
```

Before creating the file, re-check the migration directory; if `401` has landed on `main`, choose the next unused
numeric prefix and update both filenames in this task without changing the SQL contract.

- [ ] **Step 4: Run focused migration tests**

```bash
pnpm vitest run test/config/frankstonNissanClientAliasMigration.test.ts test/ai/tools/clients.test.ts
```

Expected: PASS.

- [ ] **Step 5: Apply and verify the migration automatically**

Load the configured environment without printing it, apply the migration, and read back only non-secret identity
fields:

```bash
set -a
source .env
set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/401_frankston_nissan_client_alias.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT c.id, c.name, a.alias, a.source FROM agency_client_aliases a JOIN agency_clients c ON c.id = a.client_id WHERE LOWER(a.alias) = LOWER('Frankston Nissan')"
```

Expected: one row mapping the alias to Frankston Motor Group ID `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`.

- [ ] **Step 6: Review and commit the alias slice**

```bash
git diff --check
git diff -- server/database/migrations/401_frankston_nissan_client_alias.sql test/config/frankstonNissanClientAliasMigration.test.ts
git add server/database/migrations/401_frankston_nissan_client_alias.sql test/config/frankstonNissanClientAliasMigration.test.ts
git commit -m "feat(clients): register Frankston Nissan alias"
```

---

### Task 2: Select an existing Meta product feed by exact ID

**Files:**
- Modify: `test/server/utils/metaCatalogPlatform.test.ts`
- Modify: `server/utils/metaCatalogPlatform.ts`

**Interfaces:**
- Produces: `selectMetaCatalogFeed(feeds, sourceFeedUrl, requestedProductFeedId?)`.
- Extends: `EnsureMetaCatalogFeedInput.productFeedId?: string`.
- Preserves: `feedDisposition: 'created' | 'reused'` and existing URL-match behavior when no ID is supplied.

- [ ] **Step 1: Add failing exact-selection tests**

Add these tests under `Meta catalogue feed orchestration`:

```ts
it('reuses an explicitly selected product feed even when its current URL is legacy', async () => {
  const expectedUrl = 'https://socials.driveagent.io/api/feeds/source-used/serve'
  const deps = provider({
    listProductFeeds: vi.fn().mockResolvedValue([{
      id: '638660590098129',
      name: 'Frankston Nissan',
      schedule: { interval: 'HOURLY', url: 'https://legacy.example/frankston.xml', timezone: 'Australia/Sydney' }
    }]),
    getProductFeed: vi.fn().mockResolvedValue({
      id: '638660590098129',
      name: 'Frankston Motor Group — Frankston Nissan',
      schedule: { interval: 'HOURLY', url: expectedUrl, timezone: 'Australia/Sydney' },
      latest_upload: { id: 'upload-existing', status: 'IN_PROGRESS' }
    }),
    createProductFeedUpload: vi.fn().mockResolvedValue({ id: 'upload-existing' })
  })

  const result = await ensureMetaCatalogFeed({
    connection,
    clientId: 'client-1',
    clientName: 'Frankston Motor Group',
    catalogId: 'catalog-1',
    productFeedId: '638660590098129',
    sourceFeedId: 'source-used',
    sourceFeedName: 'Frankston Nissan',
    allowedSourceFeedIds: ['source-used'],
    feedBaseUrl: 'https://socials.driveagent.io',
    actorId: 'actor-1',
    schedule: { interval: 'HOURLY', timezone: 'Australia/Sydney' }
  }, deps)

  expect(deps.createProductFeed).not.toHaveBeenCalled()
  expect(deps.updateProductFeed).toHaveBeenCalledWith('638660590098129', expect.anything())
  expect(deps.createProductFeedUpload).toHaveBeenCalledWith('638660590098129', expectedUrl)
  expect(result).toMatchObject({ productFeedId: '638660590098129', feedDisposition: 'reused' })
})

it('fails closed when an explicit product feed is not in the selected catalogue', async () => {
  const deps = provider({
    listProductFeeds: vi.fn().mockResolvedValue([{ id: 'other-feed', name: 'Other', schedule: null }])
  })

  await expect(ensureMetaCatalogFeed({
    connection,
    clientId: 'client-1',
    clientName: 'Frankston Motor Group',
    catalogId: 'catalog-1',
    productFeedId: '638660590098129',
    sourceFeedId: 'source-used',
    sourceFeedName: 'Frankston Nissan',
    allowedSourceFeedIds: ['source-used'],
    feedBaseUrl: 'https://socials.driveagent.io',
    actorId: 'actor-1'
  }, deps)).rejects.toThrow('requested Meta product feed is not accessible in this catalogue')

  expect(deps.createProductFeed).not.toHaveBeenCalled()
  expect(deps.updateProductFeed).not.toHaveBeenCalled()
  expect(deps.createProductFeedUpload).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the platform test and verify RED**

```bash
pnpm vitest run test/server/utils/metaCatalogPlatform.test.ts
```

Expected: FAIL because `productFeedId` is not accepted and selection still uses schedule URL only.

- [ ] **Step 3: Add the shared fail-closed selector**

Add to `server/utils/metaCatalogPlatform.ts`:

```ts
export function selectMetaCatalogFeed(
  feeds: MetaProductFeedSummary[],
  sourceFeedUrl: string,
  requestedProductFeedId?: string,
): MetaProductFeedSummary | null {
  const requested = clean(requestedProductFeedId)
  if (requested) {
    const selected = feeds.find(feed => clean(feed.id) === requested) ?? null
    if (!selected) throw new Error('requested Meta product feed is not accessible in this catalogue')
    return selected
  }
  return feeds.find(feed => scheduleUrl(feed) === sourceFeedUrl) ?? null
}
```

Add `productFeedId?: string` to `EnsureMetaCatalogFeedInput`, then replace the current URL-only selection with:

```ts
const existing = selectMetaCatalogFeed(feeds, url, input.productFeedId)
```

After `getProductFeed(productFeedId)`, add:

```ts
if (clean(readback.id) !== productFeedId) {
  throw new Error('Meta feed readback identity did not match the selected product feed')
}
```

- [ ] **Step 4: Run platform and provider tests**

```bash
pnpm vitest run test/server/utils/metaCatalogPlatform.test.ts test/server/utils/metaCatalogProvider.test.ts
```

Expected: PASS, including existing create and URL-reuse cases.

- [ ] **Step 5: Review and commit the platform slice**

```bash
git diff --check
git diff -- server/utils/metaCatalogPlatform.ts test/server/utils/metaCatalogPlatform.test.ts
git add server/utils/metaCatalogPlatform.ts test/server/utils/metaCatalogPlatform.test.ts
git commit -m "feat(meta): target an existing catalogue feed"
```

---

### Task 3: Thread exact feed selection through application and MCP confirmation

**Files:**
- Modify: `test/server/utils/metaCatalogApplication.test.ts`
- Modify: `test/ai/mcpFeedTools.test.ts`
- Modify: `server/utils/metaCatalogApplication.ts`
- Modify: `server/utils/ai/mcp/feedTools.ts`
- Modify: `server/utils/ai/mcp/feedRunner.ts`

**Interfaces:**
- Extends: `attachMetaCatalogFeedForClient(... productFeedId?: string)`.
- Extends: `propose_attach_catalog_feed` input with optional `productFeedId`.
- Extends: `AttachPreview` with `existingProductFeedName` and `willCreateProductFeed`.
- Consumes: `selectMetaCatalogFeed()` from Task 2.

- [ ] **Step 1: Add failing application threading test**

In `test/server/utils/metaCatalogApplication.test.ts`, add this test:

```ts
it('threads an explicit existing product-feed identity into the platform service', async () => {
  const d = deps()
  const graphProvider = d.createProvider({ accessToken: 'test-only' })
  vi.mocked(graphProvider.listProductFeeds).mockResolvedValue([{
    id: '638660590098129',
    name: 'Frankston Nissan',
    schedule: { interval: 'HOURLY', url: 'https://legacy.example/frankston.xml' }
  }])
  vi.mocked(graphProvider.getProductFeed).mockResolvedValue({
    id: '638660590098129',
    name: 'Geelong GWM Haval — Used Vehicles',
    schedule: {
      interval: 'DAILY',
      url: 'https://socials.driveagent.io/api/feeds/source-used/serve',
      hour: 0,
      timezone: 'Australia/Melbourne'
    },
    latest_upload: { id: 'upload-1', status: 'IN_PROGRESS' }
  })

  const result = await attachMetaCatalogFeedForClient({
    clientId: 'client-1',
    connectionId: 'connection-1',
    catalogId: 'catalog-1',
    productFeedId: '638660590098129',
    sourceFeedId: 'source-used',
    actorId: 'actor-1',
    actorEmail: 'paul@adme.net.au'
  }, d)

  expect(graphProvider.createProductFeed).not.toHaveBeenCalled()
  expect(graphProvider.updateProductFeed).toHaveBeenCalledWith('638660590098129', expect.anything())
  expect(result).toMatchObject({ productFeedId: '638660590098129', feedDisposition: 'reused' })
})
```

The existing `createProvider` mock returns the same `graphProvider` object on each call, so this test configures the
object used by the application without changing production injection.

- [ ] **Step 2: Add failing MCP schema and proposal tests**

Update `attachPreview` in `test/ai/mcpFeedTools.test.ts`:

```ts
existingProductFeedId: null,
existingProductFeedName: null,
willCreateProductFeed: true,
```

Add this dry-run test:

```ts
it('attach threads an explicit existing product feed through preview and proposal args', async () => {
  const d = deps({
    resolveAttachPreview: vi.fn(async () => ({
      ...attachPreview,
      feedDisposition: 'reused' as const,
      existingProductFeedId: '638660590098129',
      existingProductFeedName: 'Frankston Nissan',
      currentScheduleUrl: 'https://legacy.example/frankston.xml',
      willCreateProductFeed: false,
    }))
  })
  const args = { ...attachArgs, productFeedId: '638660590098129', dryRun: true }
  const result = await executeFeedPropose('propose_attach_catalog_feed', args, ctx('admin'), d)

  expect(result).toMatchObject({
    ok: true,
    data: {
      dryRun: true,
      existingProductFeedId: '638660590098129',
      existingProductFeedName: 'Frankston Nissan',
      willCreateProductFeed: false,
    },
  })
  expect(d.resolveAttachPreview).toHaveBeenCalledWith(
    expect.objectContaining({ productFeedId: '638660590098129' }),
    expect.anything(),
  )
})
```

Also extend the non-dry-run proposal test to assert the persisted payload contains the explicit `productFeedId`.

- [ ] **Step 3: Run focused tests and verify RED**

```bash
pnpm vitest run test/server/utils/metaCatalogApplication.test.ts test/ai/mcpFeedTools.test.ts
```

Expected: FAIL because the application and MCP schemas do not accept or forward the ID and the preview lacks the
new evidence fields.

- [ ] **Step 4: Thread the ID through the application service**

In `server/utils/metaCatalogApplication.ts`, extend the attach input:

```ts
productFeedId?: string
```

Pass it to `ensureMetaCatalogFeed`:

```ts
productFeedId: input.productFeedId,
```

- [ ] **Step 5: Extend MCP schema, preview, and confirmed execution**

In `server/utils/ai/mcp/feedTools.ts`:

```ts
const AttachParams = z.object({
  clientId: UUID,
  connectionId: UUID,
  catalogId: CATALOG_ID,
  productFeedId: META_ID.optional(),
  sourceFeedId: UUID,
  schedule: ScheduleParams.optional(),
  dryRun: z.boolean().optional(),
})
```

Extend `AttachPreview`:

```ts
existingProductFeedName: string | null
willCreateProductFeed: boolean
```

Update the tool description to say that an explicit product-feed ID must belong to the selected catalogue and will
never fall back to creation.

In `server/utils/ai/mcp/feedRunner.ts`, import `selectMetaCatalogFeed`, then replace preview's URL-only selection:

```ts
const existing = selectMetaCatalogFeed(feeds, proposedScheduleUrl, args.productFeedId)
```

Return:

```ts
existingProductFeedName: existing?.name ?? null,
willCreateProductFeed: existing === null,
```

Finally, pass `payload.args.productFeedId` into `attachMetaCatalogFeedForClient` inside `buildFeedConfirmDeps()`.

- [ ] **Step 6: Run focused MCP/application/platform tests**

```bash
pnpm vitest run \
  test/server/utils/metaCatalogPlatform.test.ts \
  test/server/utils/metaCatalogApplication.test.ts \
  test/ai/mcpFeedTools.test.ts
```

Expected: PASS.

- [ ] **Step 7: Review and commit the end-to-end contract**

```bash
git diff --check
git diff -- server/utils/metaCatalogApplication.ts server/utils/ai/mcp/feedTools.ts server/utils/ai/mcp/feedRunner.ts test/server/utils/metaCatalogApplication.test.ts test/ai/mcpFeedTools.test.ts
git add server/utils/metaCatalogApplication.ts server/utils/ai/mcp/feedTools.ts server/utils/ai/mcp/feedRunner.ts test/server/utils/metaCatalogApplication.test.ts test/ai/mcpFeedTools.test.ts
git commit -m "feat(mcp): reuse an explicitly selected Meta feed"
```

---

### Task 4: Update the public Dealer Inventory Feeds contract

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`

**Interfaces:**
- Produces: public copy accurately describes exact-feed reuse and confirmation/readback safeguards.

- [ ] **Step 1: Update the existing feature entry**

In `app/pages/features/index.vue`, update the `dealer-inventory-feeds` description to include the exact phrase
`reuse an existing Meta product feed by ID` while retaining client-scoped inventory and readback evidence.

In `app/pages/features/[slug].vue`, update `Scheduled Delivery & Readback` so it states:

```text
When a catalogue already has the intended product feed, operators can select that exact feed by ID. XeroFlow verifies it belongs to the chosen catalogue and fails closed instead of creating a duplicate. The schedule change still requires explicit confirmation, followed by an immediate import and provider readback.
```

Do not alter `MarketingNav.vue`; the Dealer Feeds entry already exists in the correct top-level navigation category.

- [ ] **Step 2: Run marketing and relevant platform tests**

```bash
pnpm vitest run test/public/metaCatalogPlatformMarketing.test.ts test/app/metaCatalogPlatformUi.test.ts
```

Expected: PASS.

- [ ] **Step 3: Review and commit the marketing sync**

```bash
git diff --check
git diff -- app/pages/features/index.vue 'app/pages/features/[slug].vue'
git add app/pages/features/index.vue 'app/pages/features/[slug].vue'
git commit -m "docs(marketing): explain exact Meta feed reuse"
```

---

### Task 5: Run the pre-commit battle test

**Files:**
- No intended file changes.

**Interfaces:**
- Produces: review evidence that the feature branch is internally consistent before operational rollout.

- [ ] **Step 1: Re-read every modified file end-to-end**

Check imports, server `~~/` aliases, schema/type consistency, preview/confirmation payload identity, and the explicit
failure path. Verify no raw Meta token or `.env` value entered a diff.

- [ ] **Step 2: Run all focused tests**

```bash
pnpm vitest run \
  test/config/frankstonNissanClientAliasMigration.test.ts \
  test/ai/tools/clients.test.ts \
  test/server/utils/metaCatalogPlatform.test.ts \
  test/server/utils/metaCatalogProvider.test.ts \
  test/server/utils/metaCatalogApplication.test.ts \
  test/ai/mcpFeedTools.test.ts \
  test/public/metaCatalogPlatformMarketing.test.ts \
  test/app/metaCatalogPlatformUi.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run repository checks**

```bash
pnpm typecheck
pnpm lint
pnpm test:run
```

Expected: PASS, subject only to documented pre-existing failures present on the untouched baseline. Do not fix
unrelated failures.

- [ ] **Step 4: Inspect branch state and commit hygiene**

```bash
git status -sb
git log --oneline main..HEAD
git diff --check main...HEAD
git diff main...HEAD | rg -n -i "password|secret|api[_-]?key|access[_-]?token|bearer" || true
```

Expected: only planned files differ, each logical slice has its own commit, and no secret value appears.

---

### Task 6: Register, propose, confirm, and verify through governed boundaries

**Files:**
- No repository file changes.
- Operational evidence: `/private/tmp/frankston-nissan-feed-evidence/`.

**Interfaces:**
- Consumes: verified Social Dashboard organization/feed evidence from the companion plan.
- Consumes: `POST /api/admin/dealer-feed-links`, `get_inventory_feed_health`, `propose_attach_catalog_feed`, `confirm_action`, `get_ad_product_set_bindings`, and `propose_refresh_catalog_feed`.
- Produces: active dealer/feed link and verified Meta catalogue binding for Frankston Nissan.

- [ ] **Step 1: Stop for XeroFlow deployment authorization**

Present the passing tests, commits, deployment target `agency-dashboard`, `pnpm deploy:check` result, and rollback.
Do not deploy until the user authorizes the production deployment.

- [ ] **Step 2: Re-read alias and feed identities**

Over MCP, resolve `Frankston Nissan` and require client ID `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`. Re-read the
Social Dashboard evidence and require non-empty exact organization ID, feed ID, and serve URL. Stop on any mismatch.

- [ ] **Step 3: Upsert the dealer/feed link through the audited admin boundary**

Build the authenticated request from the verified Social Dashboard evidence:

```ts
const dealerLinkPayload = {
  clientId: '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd',
  providerId: 'social-dashboard',
  externalOrgId: verifiedSocialDashboard.organizationId,
  sellerRefs: ['429f65c8-69ab-44c9-6243-c7fd59e86eb6'],
  defaultFeedIds: [verifiedSocialDashboard.feedId],
  status: 'active',
}
```

POST it to `/api/admin/dealer-feed-links`, then GET the link list and require the same client, organization, seller
reference, default feed ID, and active status.

- [ ] **Step 4: Verify feed health over MCP**

Call `get_inventory_feed_health` for client `8b45925c-bc32-4b7c-afc1-cfc46d81c9dd`. Require:

- the verified serve URL and positive `itemCount`;
- `byCondition.new + byCondition.demo + byCondition.used` equals `itemCount` unless an explicit additional
  condition key is returned and documented;
- non-null exclusion counts; and
- `itemCount + excluded.totalExcluded` equals the Social Dashboard candidate count.

- [ ] **Step 5: Create the exact Frankston Nissan attachment proposal and stop**

Immediately before proposing, read product feed `638660590098129` and store its current schedule URL as
`liveProductFeed.schedule.url`. Accept the known legacy Netlify URL or the already-verified Social Dashboard URL. If
another URL is present, stop and reconcile the concurrent change rather than overwriting it.

Call `propose_attach_catalog_feed` with:

```ts
{
  clientId: '8b45925c-bc32-4b7c-afc1-cfc46d81c9dd',
  connectionId: 'a864afee-99c4-4815-81ef-e0bb7577173e',
  catalogId: '952157521953514',
  productFeedId: '638660590098129',
  sourceFeedId: verifiedSocialDashboard.feedId,
  schedule: { interval: 'HOURLY', timezone: 'Australia/Sydney' },
}
```

Require preview evidence:

```text
existingProductFeedId = 638660590098129
willCreateProductFeed = false
currentScheduleUrl = liveProductFeed.schedule.url from the immediately preceding read
proposedScheduleUrl = the verified Social Dashboard serve URL
requiresAck = true
```

Present the proposal ID and full before/after to Paul. Do not call `confirm_action` in the same step.

- [ ] **Step 6: Confirm only after Paul's explicit acknowledgement**

After Paul confirms the displayed proposal, call `confirm_action` with the exact proposal identity and `ack:true`.
Never recreate the proposal with different IDs or schedule between display and confirmation.

- [ ] **Step 7: Re-read every postcondition over MCP**

Require all of the following:

- `get_inventory_feed_health` binding has catalogue `952157521953514`, product feed `638660590098129`, and the
  XeroFlow serve URL;
- Meta product-feed readback reports the same feed ID, hourly interval, `Australia/Sydney`, and a new upload identity;
- `get_ad_product_set_bindings` for campaign `120231259100460027` returns each ad with explicit `bindingIntact`;
- no active ad is detached; and
- `propose_refresh_catalog_feed` with `dryRun:true` resolves product feed `638660590098129` and the same serve URL
  without uploading.

- [ ] **Step 8: Resolve Peter Davey Suzuki without guessing**

Use read-only client, dealer-link, feed, Meta connection, catalogue, and product-feed reads. Continue only when each
identity is uniquely proven. If proof is complete, use the same link and exact-feed proposal workflow, stopping at
its confirmation gate. If proof is incomplete, record the missing identity and leave Peter Davey unchanged.
