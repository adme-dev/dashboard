# Google Ads MCP v25 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every XeroFlow Google Ads REST call to API v25 and deliver the typed, tenant-safe policy, planning, persistence, execution, audit, and MCP gating foundation required by every Google Ads control tool.

**Architecture:** Centralize Google Ads versioning and authenticated HTTP behavior, then layer bounded query/mutate primitives beneath an immutable action-plan and deterministic policy engine. Reuse XeroFlow's existing MCP OAuth/RBAC and `ai_pending_actions` confirmation flow; do not expose any new campaign-family mutation until this foundation validates, claims, executes, reads back, and audits it safely.

**Tech Stack:** Nuxt 4/Nitro, TypeScript, Zod 4, `ofetch`, Neon Postgres, Cloudflare MCP Worker, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-31-google-ads-mcp-control-plane-design.md`

## Global Constraints

- Use Google Ads REST API `v25`; no production Google Ads URL may remain on v23.
- Do not install or proxy Google's official MCP server.
- Do not expose arbitrary GAQL, raw Google mutate, arbitrary HTTP, or provider credentials.
- Every write is tenant-bound, permissioned, feature-flagged, idempotent, validated, audited, and read back. In this repository, `agency_clients.id` is the advertising tenant key and `social_connections.client_id` is the enforced connection ownership key; do not invent a second agency-tenant identifier.
- Automatic policy cannot lower hard-coded risk floors.
- New campaigns remain paused; enabling is a separate rich-confirm action in a later campaign-family plan.
- Delete defaults to archive/pause; provider `REMOVED` is never automatic.
- Server imports use `~~/server/utils/`.
- Tests mock the provider boundary; no test may call a live Google Ads mutation.
- Work only in `.worktrees/google-ads-mcp-control`; do not edit or clean the other session's main-worktree changes.
- The full-suite baseline is 6,428 passing tests and 41 unrelated failures across 18 files. This plan must keep its focused suite green and introduce no additional full-suite failures.
- This is plan 1 of 5. Follow-up plans cover Search controls, PMax controls, remaining campaign-family adapters, and optimization automation/rollout.

---

## File Structure

### New production modules

- `server/utils/googleAds/version.ts` — v25 constants and safe endpoint construction.
- `server/utils/googleAds/errors.ts` — sanitized provider error normalization and retry classification.
- `server/utils/googleAds/api.ts` — authenticated v25 request primitive, headers, request IDs, and bounded retries.
- `server/utils/googleAds/query.ts` — internal GAQL `searchStream` execution with row caps.
- `server/utils/googleAds/mutate.ts` — allowlisted resource-service mutations, validate-only, and atomicity guards.
- `server/utils/googleAds/contracts.ts` — Zod schemas and TypeScript types shared by planning/policy/execution.
- `server/utils/googleAds/policy.ts` — deterministic risk floors and execution-mode resolution.
- `server/utils/googleAds/actionStore.ts` — immutable plan/event persistence and atomic execution claims.
- `server/utils/googleAds/actionPlanner.ts` — current-state fingerprint, diff, policy, and immutable plan creation.
- `server/utils/googleAds/actionExecutor.ts` — validate, claim, mutate, read-back, and terminal-state orchestration.
- `server/utils/ai/mcp/googleAdsTools.ts` — Google Ads MCP feature-group projection and tool-name classification.
- `server/database/migrations/338_google_ads_mcp_action_control.sql` — action plans, events, and automation-policy foundation.
- `docs/runbooks/google-ads-mcp-control-plane.md` — flags, safe rollout, audit, and emergency-disable procedure.

### Existing production files to modify

- `server/utils/googleAdsClient.ts` — delegate existing GAQL and budget calls to the v25 primitives without breaking consumers.
- `scripts/audit-inventory-feeds.ts` — use the central v25 URL.
- `server/api/agency/banner-studio/ad-publish/google.post.ts` — use the central v25 URL.
- `server/api/agency/social/google/debug-campaigns.get.ts` — use the central v25 URL.
- `server/utils/googleAdsCallReporting.ts` — update version-specific source references.
- `server/utils/ai/mcp/scope.ts` — classify Google Ads automatic/propose/confirm tools as write scope.
- `server/api/internal/mcp/tools.post.ts` — project Google Ads tools behind dedicated flags.
- `server/api/internal/mcp/call.post.ts` — route Google Ads reads/plans without widening existing generic write handling.
- `nuxt.config.ts`, `.env.example`, `.dev.vars.example`, `ENV_SETUP_GUIDE.md` — document dormant Google Ads MCP flags.

### New focused tests

- `test/config/googleAdsApiVersion.test.ts`
- `test/server/utils/googleAdsErrors.test.ts`
- `test/server/utils/googleAdsApi.test.ts`
- `test/server/utils/googleAdsQuery.test.ts`
- `test/server/utils/googleAdsMutate.test.ts`
- `test/server/utils/googleAdsPolicy.test.ts`
- `test/server/utils/googleAdsActionStore.test.ts`
- `test/server/utils/googleAdsActionPlanner.test.ts`
- `test/server/utils/googleAdsActionExecutor.test.ts`
- `test/ai/mcpGoogleAdsTools.test.ts`
- `test/config/googleAdsMcpMigration.test.ts`
- `test/config/googleAdsMcpFlags.test.ts`

---

### Task 1: Centralize and enforce Google Ads API v25

**Files:**
- Create: `server/utils/googleAds/version.ts`
- Create: `test/config/googleAdsApiVersion.test.ts`
- Modify: `server/utils/googleAdsClient.ts:1-12`
- Modify: `scripts/audit-inventory-feeds.ts:1-35`
- Modify: `server/api/agency/banner-studio/ad-publish/google.post.ts:80-95`
- Modify: `server/api/agency/social/google/debug-campaigns.get.ts:135-165`
- Modify: `server/utils/googleAdsCallReporting.ts:1-20`

**Interfaces:**
- Produces: `GOOGLE_ADS_API_VERSION`, `GOOGLE_ADS_API_ORIGIN`, `GOOGLE_ADS_BASE_URL`, `googleAdsApiUrl(path)`.
- Consumes: no earlier task.

- [ ] **Step 1: Write the failing version contract test**

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GOOGLE_ADS_API_VERSION, googleAdsApiUrl } from '~~/server/utils/googleAds/version'

describe('Google Ads API version', () => {
  it('targets v25', () => {
    expect(GOOGLE_ADS_API_VERSION).toBe('v25')
    expect(googleAdsApiUrl('/customers:listAccessibleCustomers'))
      .toBe('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers')
  })

  it.each([
    'server/utils/googleAdsClient.ts',
    'scripts/audit-inventory-feeds.ts',
    'server/api/agency/banner-studio/ad-publish/google.post.ts',
    'server/api/agency/social/google/debug-campaigns.get.ts',
  ])('%s does not hardcode a deprecated Google Ads endpoint', (path) => {
    expect(readFileSync(path, 'utf8')).not.toMatch(/googleads\.googleapis\.com\/v(?:1[0-9]|2[0-4])\b/)
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm vitest run test/config/googleAdsApiVersion.test.ts`

Expected: FAIL because `~~/server/utils/googleAds/version` does not exist and v23 URLs remain.

- [ ] **Step 3: Add the version module**

```ts
export const GOOGLE_ADS_API_VERSION = 'v25' as const
export const GOOGLE_ADS_API_ORIGIN = 'https://googleads.googleapis.com' as const
export const GOOGLE_ADS_BASE_URL = `${GOOGLE_ADS_API_ORIGIN}/${GOOGLE_ADS_API_VERSION}` as const

export function googleAdsApiUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Google Ads API path must start with one slash')
  }
  return `${GOOGLE_ADS_BASE_URL}${path}`
}
```

- [ ] **Step 4: Replace production v23 constants**

Import `GOOGLE_ADS_BASE_URL` or `googleAdsApiUrl` from
`~~/server/utils/googleAds/version` in Nitro modules and by the correct relative path
in `scripts/audit-inventory-feeds.ts`. Update `googleAdsClient.ts`'s stale `API v19`
header and `googleAdsCallReporting.ts`'s v23 documentation links to v25.

- [ ] **Step 5: Run focused version and existing Google client tests**

Run:

```bash
corepack pnpm vitest run \
  test/config/googleAdsApiVersion.test.ts \
  test/server/utils/googleAdsClient.test.ts \
  test/server/utils/googleBudgetWrite.test.ts \
  test/server/utils/googleAdsCallReporting.test.ts
```

Expected: PASS with no v23 URL matches.

- [ ] **Step 6: Commit the v25 migration**

```bash
git add server/utils/googleAds/version.ts server/utils/googleAdsClient.ts \
  scripts/audit-inventory-feeds.ts \
  server/api/agency/banner-studio/ad-publish/google.post.ts \
  server/api/agency/social/google/debug-campaigns.get.ts \
  server/utils/googleAdsCallReporting.ts test/config/googleAdsApiVersion.test.ts
git commit -m "feat(google-ads): upgrade REST integration to v25"
```

---

### Task 2: Normalize provider errors without leaking payloads

**Files:**
- Create: `server/utils/googleAds/errors.ts`
- Create: `test/server/utils/googleAdsErrors.test.ts`

**Interfaces:**
- Produces: `GoogleAdsActionError`, `normalizeGoogleAdsError(error)`, `isGoogleAdsRetryable(error)`.
- Consumes: no earlier task.

- [ ] **Step 1: Write failing error-normalization tests**

```ts
import { describe, expect, it } from 'vitest'
import { normalizeGoogleAdsError } from '~~/server/utils/googleAds/errors'

describe('normalizeGoogleAdsError', () => {
  it('extracts a safe field error and request id', () => {
    const error = {
      status: 400,
      response: { headers: new Headers({ 'request-id': 'req-1' }) },
      data: { error: { details: [{ errors: [{
        errorCode: { fieldError: 'REQUIRED' },
        message: 'Required field missing',
        location: { fieldPathElements: [{ fieldName: 'campaign' }, { fieldName: 'name' }] },
      }] }] } },
    }
    expect(normalizeGoogleAdsError(error)).toMatchObject({
      code: 'REQUIRED', category: 'validation', retryable: false,
      fieldPath: 'campaign.name', requestId: 'req-1',
    })
  })

  it('does not serialize tokens or the raw provider body', () => {
    const normalized = normalizeGoogleAdsError({
      status: 401,
      data: { access_token: 'secret-token', error: { message: 'denied' } },
    })
    expect(JSON.stringify(normalized)).not.toContain('secret-token')
    expect(normalized.category).toBe('auth')
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm vitest run test/server/utils/googleAdsErrors.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the safe error contract**

Define:

```ts
export interface GoogleAdsActionError {
  code: string
  category: 'auth' | 'permission' | 'validation' | 'policy' | 'quota' | 'conflict' | 'provider' | 'unknown'
  retryable: boolean
  operationIndex?: number
  fieldPath?: string
  requestId?: string
  safeMessage: string
}
```

Map HTTP 401 to `auth`, 403 to `permission`, 409 to `conflict`, 429 to `quota`,
400 and Google field/request errors to `validation`, and 500/502/503/504 to retryable
`provider`. Read only known Google failure fields; never spread the input error.

- [ ] **Step 4: Run the error tests and verify GREEN**

Run: `corepack pnpm vitest run test/server/utils/googleAdsErrors.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/googleAds/errors.ts test/server/utils/googleAdsErrors.test.ts
git commit -m "feat(google-ads): normalize provider errors"
```

---

### Task 3: Add the authenticated v25 request primitive

**Files:**
- Create: `server/utils/googleAds/api.ts`
- Create: `test/server/utils/googleAdsApi.test.ts`

**Interfaces:**
- Consumes: `googleAdsApiUrl`, `normalizeGoogleAdsError`, `isGoogleAdsRetryable`.
- Produces: `GoogleAdsAuth`, `GoogleAdsRequestOptions<T>`, `buildGoogleAdsHeaders(auth)`, `googleAdsRequest<T>(options, deps?)`.

- [ ] **Step 1: Write failing request tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildGoogleAdsHeaders, googleAdsRequest } from '~~/server/utils/googleAds/api'

const auth = { accessToken: 'access', developerToken: 'developer', loginCustomerId: '123-456' }

describe('googleAdsRequest', () => {
  it('builds v25 headers without exposing secrets in its result', async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true })
    const result = await googleAdsRequest({ path: '/customers:listAccessibleCustomers', method: 'GET', auth }, { fetch, sleep: vi.fn() })
    expect(fetch).toHaveBeenCalledWith(
      'https://googleads.googleapis.com/v25/customers:listAccessibleCustomers',
      expect.objectContaining({ headers: expect.objectContaining({
        Authorization: 'Bearer access', 'developer-token': 'developer', 'login-customer-id': '123456',
      }) }),
    )
    expect(result).toEqual({ data: { ok: true }, requestId: undefined })
  })

  it('retries a retryable read but not an ambiguous write', async () => {
    const unavailable = Object.assign(new Error('unavailable'), { status: 503 })
    const fetch = vi.fn().mockRejectedValueOnce(unavailable).mockResolvedValue({ ok: true })
    await googleAdsRequest({ path: '/x', method: 'GET', auth, retries: 1 }, { fetch, sleep: vi.fn() })
    expect(fetch).toHaveBeenCalledTimes(2)

    fetch.mockReset().mockRejectedValue(unavailable)
    await expect(googleAdsRequest({ path: '/x:mutate', method: 'POST', auth, body: {}, retries: 1, write: true }, { fetch, sleep: vi.fn() }))
      .rejects.toMatchObject({ retryable: true })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm vitest run test/server/utils/googleAdsApi.test.ts`

Expected: FAIL because `googleAds/api.ts` does not exist.

- [ ] **Step 3: Implement the request primitive**

Use these exact public types:

```ts
export interface GoogleAdsAuth {
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

export interface GoogleAdsRequestOptions<TBody = unknown> {
  path: string
  method: 'GET' | 'POST'
  auth: GoogleAdsAuth
  body?: TBody
  retries?: number
  write?: boolean
}
```

`googleAdsRequest` returns `{ data, requestId }`, extracts `request-id` from response
headers when available, retries only retryable non-write requests with bounded exponential
backoff, and throws the normalized safe error object.

- [ ] **Step 4: Run request and error tests**

Run:

```bash
corepack pnpm vitest run \
  test/server/utils/googleAdsApi.test.ts \
  test/server/utils/googleAdsErrors.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/googleAds/api.ts test/server/utils/googleAdsApi.test.ts
git commit -m "feat(google-ads): add authenticated API primitive"
```

---

### Task 4: Route existing GAQL reads through a bounded query primitive

**Files:**
- Create: `server/utils/googleAds/query.ts`
- Create: `test/server/utils/googleAdsQuery.test.ts`
- Modify: `server/utils/googleAdsClient.ts:150-220`

**Interfaces:**
- Consumes: `GoogleAdsAuth`, `googleAdsRequest`.
- Produces: `executeGoogleAdsQuery(input, deps?)`, `GoogleAdsQueryResult<T>`.
- Preserves: existing `gaqlQuery(customerId, token, developerToken, query, loginCustomerId?, retries?)` signature.

- [ ] **Step 1: Write failing query tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { executeGoogleAdsQuery } from '~~/server/utils/googleAds/query'

describe('executeGoogleAdsQuery', () => {
  it('sanitizes customer id, flattens stream batches, and enforces the row cap', async () => {
    const request = vi.fn().mockResolvedValue({
      data: [{ results: [{ id: 1 }, { id: 2 }] }, { results: [{ id: 3 }] }], requestId: 'r1',
    })
    const result = await executeGoogleAdsQuery({
      customerId: '123-456', query: 'SELECT customer.id FROM customer',
      auth: { accessToken: 'a', developerToken: 'd' }, maxRows: 2,
    }, { request })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/customers/123456/googleAds:searchStream', method: 'POST', write: false,
    }))
    expect(result).toEqual({ rows: [{ id: 1 }, { id: 2 }], more: 1, requestId: 'r1' })
  })

  it('rejects an invalid customer id before making a request', async () => {
    const request = vi.fn()
    await expect(executeGoogleAdsQuery({
      customerId: 'abc', query: 'SELECT customer.id FROM customer',
      auth: { accessToken: 'a', developerToken: 'd' },
    }, { request })).rejects.toThrow('Invalid Google Ads customer ID')
    expect(request).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm vitest run test/server/utils/googleAdsQuery.test.ts`

Expected: FAIL because the query module does not exist.

- [ ] **Step 3: Implement bounded query execution**

Use:

```ts
export interface GoogleAdsQueryResult<T> {
  rows: T[]
  more: number
  requestId?: string
}
```

Default `maxRows` to 1,000 and cap it at 10,000. Return `more` rather than silently
claiming completeness. Keep query construction internal; this primitive is not itself
an MCP tool.

- [ ] **Step 4: Delegate legacy `gaqlQuery` to the new primitive**

Build `GoogleAdsAuth` from the existing positional arguments and return `result.rows`.
Keep the public signature so spend sync, recommendations, and reporting consumers do
not change in this task.

- [ ] **Step 5: Run query and legacy regression tests**

Run:

```bash
corepack pnpm vitest run \
  test/server/utils/googleAdsQuery.test.ts \
  test/server/utils/googleAdsClient.test.ts \
  test/server/utils/googleBudgetWrite.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/googleAds/query.ts server/utils/googleAdsClient.ts \
  test/server/utils/googleAdsQuery.test.ts
git commit -m "refactor(google-ads): centralize bounded GAQL reads"
```

---

### Task 5: Add the allowlisted validate-only mutation primitive

**Files:**
- Create: `server/utils/googleAds/mutate.ts`
- Create: `test/server/utils/googleAdsMutate.test.ts`

**Interfaces:**
- Consumes: `GoogleAdsAuth`, `googleAdsRequest`.
- Produces: `GoogleAdsServiceName`, `GoogleAdsOperation`, `mutateGoogleAds(input, deps?)`.

- [ ] **Step 1: Write failing mutation tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { mutateGoogleAds } from '~~/server/utils/googleAds/mutate'

const auth = { accessToken: 'a', developerToken: 'd', loginCustomerId: '999' }

describe('mutateGoogleAds', () => {
  it('sends a validate-only v25 mutation with an allowlisted service', async () => {
    const request = vi.fn().mockResolvedValue({ data: { results: [] }, requestId: 'r1' })
    await mutateGoogleAds({
      customerId: '123', service: 'campaigns', auth, validateOnly: true,
      atomicity: 'interdependent', operations: [{ create: { name: 'Draft', status: 'PAUSED' } }],
    }, { request })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/customers/123/campaigns:mutate', write: true,
      body: expect.objectContaining({ validateOnly: true, partialFailure: false }),
    }))
  })

  it('rejects partial failure for interdependent operations', async () => {
    await expect(mutateGoogleAds({
      customerId: '123', service: 'campaigns', auth, validateOnly: false,
      atomicity: 'interdependent', partialFailure: true,
      operations: [{ update: { resourceName: 'customers/123/campaigns/1', status: 'PAUSED' }, updateMask: 'status' }],
    })).rejects.toThrow('Partial failure is only allowed for independent operations')
  })

  it('rejects an unrecognized provider service', async () => {
    await expect(mutateGoogleAds({
      customerId: '123', service: 'arbitraryHttp' as never, auth,
      validateOnly: true, atomicity: 'independent', operations: [],
    })).rejects.toThrow('Unsupported Google Ads mutation service')
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm vitest run test/server/utils/googleAdsMutate.test.ts`

Expected: FAIL because the mutation module does not exist.

- [ ] **Step 3: Implement the allowlisted service and operation contracts**

Define `GoogleAdsServiceName` as a literal union covering the spec's resource domains:
`campaignBudgets`, `campaigns`, `adGroups`, `adGroupAds`, `adGroupCriteria`,
`campaignCriteria`, `customerNegativeCriteria`, `sharedSets`, `sharedCriteria`,
`campaignSharedSets`, `assets`, `campaignAssets`, `adGroupAssets`, `customerAssets`,
`assetGroups`, `assetGroupAssets`, `assetGroupSignals`, `assetGroupListingGroupFilters`,
`conversionActions`, `campaignConversionGoals`, `customerConversionGoals`,
`biddingStrategies`, `audiences`, and `customAudiences`.

Define operations as exactly one of `create`, `update` plus `updateMask`, or `remove`.
Reject empty operation batches and batches over 1,000 operations.

- [ ] **Step 4: Implement validate-only and atomicity behavior**

Always send `responseContentType: 'MUTABLE_RESOURCE'`. Default `partialFailure` to
false. Allow `partialFailure: true` only when `atomicity === 'independent'`. Return
`{ results, partialFailureError, requestId }` without treating partial errors as full
success.

- [ ] **Step 5: Run mutation tests**

Run: `corepack pnpm vitest run test/server/utils/googleAdsMutate.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/googleAds/mutate.ts test/server/utils/googleAdsMutate.test.ts
git commit -m "feat(google-ads): add guarded mutation primitive"
```

---

### Task 6: Define action contracts and immutable risk floors

**Files:**
- Create: `server/utils/googleAds/contracts.ts`
- Create: `server/utils/googleAds/policy.ts`
- Create: `test/server/utils/googleAdsPolicy.test.ts`

**Interfaces:**
- Produces: `GoogleAdsRiskTierSchema`, `GoogleAdsResourceTypeSchema`, `GoogleAdsOperationTypeSchema`, `GoogleAdsActionPlanSchema`, inferred `GoogleAdsActionPlan`, `GoogleAdsPolicyDecisionSchema`, inferred `GoogleAdsPolicyDecision`, `GoogleAdsVerificationDiffSchema`, inferred `GoogleAdsVerificationDiff`, and `resolveGoogleAdsPolicy(input)`.
- Consumes: no provider calls.

- [ ] **Step 1: Write failing policy tests**

```ts
import { describe, expect, it } from 'vitest'
import { resolveGoogleAdsPolicy } from '~~/server/utils/googleAds/policy'

describe('resolveGoogleAdsPolicy', () => {
  it.each([
    ['update_budget', 'rich_confirm'],
    ['enable_campaign', 'rich_confirm'],
    ['set_conversion_goal', 'rich_confirm'],
    ['remove_campaign', 'destructive_confirm'],
  ] as const)('%s cannot be lowered below %s', (operation, riskTier) => {
    expect(resolveGoogleAdsPolicy({
      operation, actorRole: 'owner', hasMediaPermission: true,
      hasWriteScope: true, globalWriteEnabled: true,
      requestedMode: 'automatic', accountPolicy: { enabled: true },
    })).toMatchObject({ allowed: true, riskTier, executionMode: 'proposal' })
  })

  it('allows negative-keyword automation only under an active matching policy', () => {
    expect(resolveGoogleAdsPolicy({
      operation: 'add_negative_keywords', actorRole: 'media_buyer',
      hasMediaPermission: true, hasWriteScope: true, globalWriteEnabled: true,
      requestedMode: 'automatic', accountPolicy: { enabled: true, actionClass: 'negative_keywords' },
    })).toMatchObject({ allowed: true, riskTier: 'automatic', executionMode: 'automatic' })
  })

  it('blocks every write when the global kill switch is off', () => {
    expect(resolveGoogleAdsPolicy({
      operation: 'pause_campaign', actorRole: 'owner', hasMediaPermission: true,
      hasWriteScope: true, globalWriteEnabled: false,
      requestedMode: 'automatic', accountPolicy: { enabled: true, actionClass: 'pause' },
    })).toMatchObject({ allowed: false, code: 'writes_disabled' })
  })
})
```

- [ ] **Step 2: Run and verify RED**

Run: `corepack pnpm vitest run test/server/utils/googleAdsPolicy.test.ts`

Expected: FAIL because policy/contracts do not exist.

- [ ] **Step 3: Add Zod contracts**

Define risk tiers `read`, `automatic`, `confirm`, `rich_confirm`,
`destructive_confirm`, and `blocked`. Define operation literals for all catalog actions,
including create/update/status/archive/remove, keyword, targeting, asset, conversion,
and recommendation operations. Export every inferred TypeScript type beside its Zod
schema. `GoogleAdsActionPlanSchema` must include `clientId` (the repository's advertising
tenant key), connection/customer binding, actor, source, resource, operation,
current/desired state, diff, provider operations, risk, execution mode, policy version,
request hash, idempotency key, and expiry. `GoogleAdsPolicyDecision` must carry
`allowed`, `riskTier`, `executionMode`, and an optional stable denial `code`.
`GoogleAdsVerificationDiff` is `{ field: string, expected: unknown, actual: unknown }`.
Export `GoogleAdsMutateResult` from `mutate.ts` with `results`, optional
`partialFailureError`, and optional `requestId` so the executor dependency boundary is
fully typed.

- [ ] **Step 4: Implement deterministic policy floors**

Hard-code these minimums:

```ts
const RISK_FLOORS = {
  update_budget: 'rich_confirm',
  update_bidding: 'rich_confirm',
  enable_campaign: 'rich_confirm',
  set_conversion_goal: 'rich_confirm',
  remove_campaign: 'destructive_confirm',
  remove_ad_group: 'destructive_confirm',
  remove_ad: 'destructive_confirm',
  remove_asset: 'destructive_confirm',
} as const
```

Only `add_negative_keywords`, `pause_campaign`, `pause_ad_group`, `pause_ad`,
`pause_keyword`, allowlisted recommendation dismissal, and safe asset detachment may
resolve to `automatic`, and only with a matching enabled account policy.

- [ ] **Step 5: Run policy tests**

Run: `corepack pnpm vitest run test/server/utils/googleAdsPolicy.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/googleAds/contracts.ts server/utils/googleAds/policy.ts \
  test/server/utils/googleAdsPolicy.test.ts
git commit -m "feat(google-ads): define action policy contracts"
```

---

### Task 7: Add action-plan, event, and policy persistence

**Files:**
- Create: `server/database/migrations/338_google_ads_mcp_action_control.sql`
- Create: `server/utils/googleAds/actionStore.ts`
- Create: `test/config/googleAdsMcpMigration.test.ts`
- Create: `test/server/utils/googleAdsActionStore.test.ts`

**Interfaces:**
- Consumes: `GoogleAdsActionPlan` from contracts.
- Produces: `createGoogleAdsActionPlan`, `getGoogleAdsActionPlan`, `claimGoogleAdsActionPlan`, `appendGoogleAdsActionEvent`, `completeGoogleAdsActionPlan`.

- [ ] **Step 1: Write failing migration contract tests**

Read the SQL and assert it creates `google_ads_action_plans`,
`google_ads_action_events`, and `google_ads_automation_policies`; adds
`UNIQUE (client_id, idempotency_key)`; makes `client_id` a UUID foreign key to
`agency_clients(id)`; makes `actor_id` a UUID foreign key to `team_members(id)`; uses
the existing `UNIQUE (client_id, id)` social-connection key for a composite
`FOREIGN KEY (client_id, connection_id) REFERENCES social_connections(client_id, id)`;
and prevents UPDATE/DELETE of event rows.

Run: `corepack pnpm vitest run test/config/googleAdsMcpMigration.test.ts`

Expected: FAIL because migration 338 does not exist.

- [ ] **Step 2: Create additive migration 338**

Use UUID primary keys, `JSONB` for safe normalized plan/diff/provider-operation fields,
explicit status/risk/execution-mode checks, `TIMESTAMPTZ`, and indexes for client tenancy,
connection, status, expiry, and action history. Add:

```sql
UNIQUE (client_id, idempotency_key)
```

Implement an event-table trigger that raises on UPDATE or DELETE, matching the
repository's append-only audit pattern.

- [ ] **Step 3: Write failing action-store tests with injected DB**

Test these exact store outcomes:

- a duplicate `(client_id, idempotency_key)` returns the existing plan;
- `claimGoogleAdsActionPlan` uses one `UPDATE ... WHERE status IN (...) RETURNING`;
- a second claim returns null;
- event payloads are validated and never include auth/developer-token fields;
- completion records request ID and verification summary.

Run: `corepack pnpm vitest run test/server/utils/googleAdsActionStore.test.ts`

Expected: FAIL because `actionStore.ts` does not exist.

- [ ] **Step 4: Implement the store over an injected `Queryable` boundary**

Expose:

```ts
export interface GoogleAdsActionStoreDeps {
  queryOne<T>(text: string, params?: unknown[]): Promise<T | null>
  execute(text: string, params?: unknown[]): Promise<void>
}
```

Default to `queryOne`/`execute` from `~~/server/utils/db`, but allow tests to inject
fakes. Validate all rows through `GoogleAdsActionPlanSchema` before returning them.

- [ ] **Step 5: Run migration and store tests**

Run:

```bash
corepack pnpm vitest run \
  test/config/googleAdsMcpMigration.test.ts \
  test/server/utils/googleAdsActionStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Apply the migration automatically**

From the repository root, load `DATABASE_URL` from `.env` without printing it and run:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/338_google_ads_mcp_action_control.sql
```

Expected: exit 0. Then query `to_regclass` for all three tables and report only their
names, not connection details.

- [ ] **Step 7: Commit**

```bash
git add server/database/migrations/338_google_ads_mcp_action_control.sql \
  server/utils/googleAds/actionStore.ts test/config/googleAdsMcpMigration.test.ts \
  test/server/utils/googleAdsActionStore.test.ts
git commit -m "feat(google-ads): persist governed action plans"
```

---

### Task 8: Build immutable planning and execution orchestration

**Files:**
- Create: `server/utils/googleAds/actionPlanner.ts`
- Create: `server/utils/googleAds/actionExecutor.ts`
- Create: `test/server/utils/googleAdsActionPlanner.test.ts`
- Create: `test/server/utils/googleAdsActionExecutor.test.ts`

**Interfaces:**
- Consumes: contracts, policy, store, `mutateGoogleAds`.
- Produces: `planGoogleAdsAction(input, deps)`, `executeGoogleAdsAction(planId, ctx, deps)`.

- [ ] **Step 1: Write failing planner tests**

Test exact behavior:

- loads current provider state before planning;
- canonicalizes key order before hashing;
- computes a field-level `{ field, before, after }[]` diff;
- binds client tenancy/connection/customer and actor;
- stores the policy decision and immutable provider operations;
- returns the existing plan for the same client/idempotency key;
- rejects a supplied provider resource that is outside the selected connection.

Run: `corepack pnpm vitest run test/server/utils/googleAdsActionPlanner.test.ts`

Expected: FAIL because the planner does not exist.

- [ ] **Step 2: Implement planner interfaces**

```ts
export interface PlanGoogleAdsActionInput {
  clientId: string
  connectionId: string
  actorId: string
  source: 'mcp' | 'chat' | 'ui' | 'automation'
  operation: GoogleAdsOperationType
  resourceType: GoogleAdsResourceType
  requestedMode: 'automatic' | 'proposal'
  arguments: unknown
  idempotencyKey: string
}
```

Dependencies resolve connection ownership, load current state, build typed provider
operations, resolve policy, and persist the immutable plan. The planner performs no
provider mutation. Treat `clientId` as the tenant identifier throughout this repository
and require the selected Google `social_connections` row to have that same `client_id`;
an unassigned or differently assigned connection cannot be planned against.

- [ ] **Step 3: Write failing executor tests**

Test exact behavior:

- disabled writes make zero provider calls;
- unapproved proposal makes zero provider calls;
- executor revalidates policy and state fingerprint before claim;
- atomic claim allows one concurrent writer;
- `validateOnly: true` precedes live mutate;
- validate-only failure records `provider_rejected` and makes no live mutate;
- live success followed by matching read-back records `verified`;
- live success followed by blocking drift records `verification_failed`;
- ambiguous timeout records `recovery_required` and does not retry the write.

Run: `corepack pnpm vitest run test/server/utils/googleAdsActionExecutor.test.ts`

Expected: FAIL because the executor does not exist.

- [ ] **Step 4: Implement executor orchestration**

Use this dependency boundary:

```ts
export interface GoogleAdsActionExecutorDeps {
  loadPlan(id: string): Promise<GoogleAdsActionPlan | null>
  loadCurrent(plan: GoogleAdsActionPlan): Promise<unknown>
  resolvePolicy(plan: GoogleAdsActionPlan): GoogleAdsPolicyDecision
  claim(id: string, expectedStatus: string): Promise<boolean>
  validate(plan: GoogleAdsActionPlan): Promise<GoogleAdsMutateResult>
  mutate(plan: GoogleAdsActionPlan): Promise<GoogleAdsMutateResult>
  verify(plan: GoogleAdsActionPlan): Promise<{ ok: boolean, diffs: GoogleAdsVerificationDiff[] }>
  event(planId: string, type: string, payload: unknown): Promise<void>
  complete(planId: string, status: string, result: unknown): Promise<void>
}
```

Return typed outcomes; never throw raw provider errors. Treat a changed current-state
fingerprint as stale before claim.

- [ ] **Step 5: Run planner/executor tests**

Run:

```bash
corepack pnpm vitest run \
  test/server/utils/googleAdsActionPlanner.test.ts \
  test/server/utils/googleAdsActionExecutor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/utils/googleAds/actionPlanner.ts server/utils/googleAds/actionExecutor.ts \
  test/server/utils/googleAdsActionPlanner.test.ts \
  test/server/utils/googleAdsActionExecutor.test.ts
git commit -m "feat(google-ads): orchestrate governed actions"
```

---

### Task 9: Add dormant Google Ads MCP projection and scope gates

**Files:**
- Create: `server/utils/ai/mcp/googleAdsTools.ts`
- Create: `test/ai/mcpGoogleAdsTools.test.ts`
- Create: `test/config/googleAdsMcpFlags.test.ts`
- Modify: `server/utils/ai/mcp/scope.ts`
- Modify: `server/api/internal/mcp/tools.post.ts`
- Modify: `server/api/internal/mcp/call.post.ts`
- Modify: `nuxt.config.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Modify: `ENV_SETUP_GUIDE.md`

**Interfaces:**
- Consumes: existing `McpToolManifest`, role permissions, `mcp:read`/`mcp:write` scopes.
- Produces: `googleAdsReadTools`, `googleAdsWriteTools`, `projectGoogleAdsTools(role, flags)`, `isGoogleAdsToolName(name)`, `executeGoogleAdsTool(...)`.

- [ ] **Step 1: Write failing projection and flag tests**

Test that:

- all tools are absent when all Google flags are false;
- read tools require `GOOGLE_ADS_MCP_READ_ENABLED` and `MEDIA_BUYING`;
- proposal/automatic tools require `GOOGLE_ADS_MCP_WRITE_ENABLED`;
- automatic tools additionally require `GOOGLE_ADS_MCP_AUTOMATION_ENABLED`;
- destructive tools additionally require `GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED`;
- every Google write name is classified by `isWriteScopeToolName`;
- a read-only MCP scope sees no Google write tools;
- no descriptor is named `google_ads_gaql`, `google_ads_mutate`, or accepts `url`/`query` passthrough arguments.

Run:

```bash
corepack pnpm vitest run \
  test/ai/mcpGoogleAdsTools.test.ts \
  test/config/googleAdsMcpFlags.test.ts
```

Expected: FAIL because the projection and flags do not exist.

- [ ] **Step 2: Add dormant feature flags**

Add runtime/config documentation for:

```text
GOOGLE_ADS_MCP_READ_ENABLED=false
GOOGLE_ADS_MCP_WRITE_ENABLED=false
GOOGLE_ADS_MCP_AUTOMATION_ENABLED=false
GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED=false
```

All defaults are false. Do not enable them in local, preview, or production config.

- [ ] **Step 3: Implement tool descriptors without exposing incomplete resource actions**

For this foundation plan, expose only:

- `google_ads_validate_action_plan` when read is enabled;
- `google_ads_get_action_status` when read is enabled;
- `propose_google_ads_action` when write is enabled;
- existing shared `confirm_action` for approved plans.

`propose_google_ads_action` accepts only a server-issued `actionPlanId`; campaign-family
tools in later plans create those typed plans. It must not accept raw provider operations.

- [ ] **Step 4: Wire manifest and call routing**

Project the group in `tools.post.ts`, then route recognized Google tool names in
`call.post.ts` before the generic read-only fallback. Reuse the existing MCP secret,
user lookup, context, audit, and shared confirmation flow. Do not add a second MCP
endpoint.

- [ ] **Step 5: Run MCP regression tests**

Run:

```bash
corepack pnpm vitest run \
  test/ai/mcpGoogleAdsTools.test.ts \
  test/config/googleAdsMcpFlags.test.ts \
  test/ai/mcpProject.test.ts \
  test/ai/mcpWriteTools.test.ts \
  test/ai/mcpScope.test.ts \
  test/ai/mcpFinancialWiring.test.ts
```

Expected: PASS and existing MCP tool groups remain unchanged when Google flags are off.

- [ ] **Step 6: Commit**

```bash
git add server/utils/ai/mcp/googleAdsTools.ts server/utils/ai/mcp/scope.ts \
  server/api/internal/mcp/tools.post.ts server/api/internal/mcp/call.post.ts \
  nuxt.config.ts .env.example .dev.vars.example ENV_SETUP_GUIDE.md \
  test/ai/mcpGoogleAdsTools.test.ts test/config/googleAdsMcpFlags.test.ts
git commit -m "feat(mcp): add dormant Google Ads control group"
```

---

### Task 10: Document operations and verify the foundation

**Files:**
- Create: `docs/runbooks/google-ads-mcp-control-plane.md`
- Modify: `docs/superpowers/specs/2026-08-31-google-ads-mcp-control-plane-design.md`

**Interfaces:**
- Consumes: flags, plan statuses, audit tables, and kill-switch behavior from Tasks 7-9.
- Produces: operator-ready rollout and emergency-disable instructions.

- [ ] **Step 1: Write the runbook**

Document:

- architecture and credential separation;
- all four flags and their false defaults;
- enabling read-only tools first;
- inspecting projected tools for a media-buyer and owner;
- proposal versus automatic versus confirmed outcomes;
- action-plan and event audit queries that omit JSON payload bodies;
- global write kill-switch procedure;
- recovery-required triage by action ID and provider request ID;
- test-account-only validation procedure;
- explicit warning that provider `REMOVED` is irreversible;
- rollback by disabling writes/automation/destructive flags, never by deleting audit rows.

- [ ] **Step 2: Update spec implementation status**

Add an implementation-status section listing the foundation commit IDs and stating that
no campaign-family tools are enabled until their later plans pass.

- [ ] **Step 3: Run the complete focused suite**

Run:

```bash
corepack pnpm vitest run \
  test/config/googleAdsApiVersion.test.ts \
  test/config/googleAdsMcpMigration.test.ts \
  test/config/googleAdsMcpFlags.test.ts \
  test/server/utils/googleAdsClient.test.ts \
  test/server/utils/googleBudgetWrite.test.ts \
  test/server/utils/googleAdsErrors.test.ts \
  test/server/utils/googleAdsApi.test.ts \
  test/server/utils/googleAdsQuery.test.ts \
  test/server/utils/googleAdsMutate.test.ts \
  test/server/utils/googleAdsPolicy.test.ts \
  test/server/utils/googleAdsActionStore.test.ts \
  test/server/utils/googleAdsActionPlanner.test.ts \
  test/server/utils/googleAdsActionExecutor.test.ts \
  test/ai/mcpGoogleAdsTools.test.ts \
  test/ai/mcpProject.test.ts \
  test/ai/mcpWriteTools.test.ts \
  test/ai/mcpScope.test.ts
```

Expected: all focused files pass with zero unhandled errors.

- [ ] **Step 4: Run typecheck and record baseline differences**

Run: `corepack pnpm run typecheck`

Expected: no new errors in changed files. The repository may retain its documented
pre-existing type errors; save the output and compare changed-file diagnostics.

- [ ] **Step 5: Run the full test suite**

Run: `corepack pnpm test:run`

Expected: no failures beyond the recorded baseline of 41 tests in 18 files. If the
other session has merged fixes, use the new lower baseline and do not accept regressions.

- [ ] **Step 6: Perform the project deep-dive review**

Re-read every changed file end-to-end. Check server import aliases, duplicate MCP
projection/confirmation paths, stale refs, secrets in errors/logs, tenant/resource-name
validation, raw GAQL/mutate escape hatches, camelCase v25 JSON fields, feature-flag
defaults, automatic risk floors, partial-failure misuse, ambiguous write retries, and
provider read-back requirements.

- [ ] **Step 7: Commit docs and any review fixes**

```bash
git add docs/runbooks/google-ads-mcp-control-plane.md \
  docs/superpowers/specs/2026-08-31-google-ads-mcp-control-plane-design.md
git commit -m "docs(google-ads): add MCP control runbook"
```

- [ ] **Step 8: Prepare the next implementation plan**

Create `docs/superpowers/plans/2026-08-31-google-ads-mcp-search-controls.md` from the
approved spec and the exact foundation interfaces shipped here. The Search plan begins
with account/campaign QA reads, then paused campaign/budget/ad-group/RSA creation,
keywords/negatives, targeting/assets/conversions, verification, activation, archive,
and destructive-confirm removal.

---

## Completion Gate

This foundation plan is complete only when:

- every production Google Ads REST URL uses v25;
- focused tests are green;
- the three additive tables exist in the configured database;
- Google Ads MCP flags remain false by default;
- no raw GAQL/mutate/provider-credential tool is exposed;
- automatic, money, activation, conversion, and destructive risk floors are enforced;
- execution validates, atomically claims, mutates once, reads back, and records a typed outcome;
- existing MCP groups pass their regressions;
- the full-suite result is compared against the recorded baseline;
- the operator runbook can disable all writes without losing audit/recovery evidence.
