# PayPal Finance Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/agency/paypal` as a finance-gated PayPal REST API readiness route backed by server-side client-credentials token testing.

**Architecture:** Keep PayPal REST concerns in `server/utils/paypalClient.ts`, database persistence in the route handlers, and the UI as a small finance page that never receives token values. The v1 route uses PayPal REST client credentials only; it does not implement Log in with PayPal, transaction import, webhooks, or Xero matching.

**Tech Stack:** Nuxt 4, Nitro server routes, Nuxt UI v4, Neon Postgres via `server/utils/db.ts`, Vitest, PayPal REST API client credentials.

---

## File Structure

- Create `server/utils/paypalClient.ts`: resolves runtime config, chooses sandbox/live endpoints, exchanges client credentials for a REST access token, and calculates expiry timestamps.
- Create `server/database/migrations/177-paypal-connections.sql`: stores one cached PayPal REST token metadata row per tenant/environment.
- Create `server/api/agency/paypal/status.get.ts`: finance-gated status endpoint that reports config and cached metadata without secrets.
- Create `server/api/agency/paypal/test.post.ts`: finance/write-gated endpoint that calls PayPal token API and upserts token metadata.
- Create `server/api/agency/paypal/clear.post.ts`: finance/write-gated endpoint that removes cached metadata for the active tenant/environment.
- Create `app/pages/agency/paypal.vue`: finance page with status, environment, last check, and test/clear actions.
- Modify `app/layouts/agency.vue`: add PayPal to the existing Finance sidebar group.
- Modify `nuxt.config.ts`: add private PayPal runtime config keys.
- Modify `.env.example`: document PayPal environment variables.
- Add tests in `test/utils/paypalClient.test.ts` and `test/server/api/agencyPaypal.test.ts`.

## Task 1: PayPal Client Utility

**Files:**
- Create: `server/utils/paypalClient.ts`
- Test: `test/utils/paypalClient.test.ts`

- [ ] **Step 1: Write the failing client utility tests**

Create `test/utils/paypalClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  exchangePayPalClientCredentials,
  getPayPalEndpoints,
  resolvePayPalConfig,
} from '../../server/utils/paypalClient'

describe('paypalClient', () => {
  it('reports missing configuration without exposing secrets', () => {
    const cfg = resolvePayPalConfig({
      paypalClientId: '',
      paypalClientSecret: '',
      paypalEnvironment: 'sandbox',
    })

    expect(cfg.configured).toBe(false)
    expect(cfg.environment).toBe('sandbox')
    expect(cfg.clientId).toBe('')
    expect(cfg.clientSecret).toBe('')
    expect(cfg.endpoints.apiBaseUrl).toBe('https://api-m.sandbox.paypal.com')
  })

  it('uses live PayPal endpoints when PAYPAL_ENVIRONMENT is live', () => {
    const endpoints = getPayPalEndpoints('live')

    expect(endpoints.apiBaseUrl).toBe('https://api-m.paypal.com')
    expect(endpoints.tokenUrl).toBe('https://api-m.paypal.com/v1/oauth2/token')
  })

  it('exchanges client credentials for token metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        scope: 'openid https://uri.paypal.com/services/invoicing',
        access_token: 'secret-token',
        token_type: 'Bearer',
        app_id: 'APP-123',
        expires_in: 28800,
      }),
    })

    const result = await exchangePayPalClientCredentials({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      environment: 'sandbox',
      endpoints: getPayPalEndpoints('sandbox'),
      now: new Date('2026-06-11T00:00:00.000Z'),
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledWith(
      'https://api-m.sandbox.paypal.com/v1/oauth2/token',
      expect.objectContaining({
        method: 'POST',
        body: 'grant_type=client_credentials',
      })
    )
    expect(result).toMatchObject({
      accessToken: 'secret-token',
      tokenType: 'Bearer',
      appId: 'APP-123',
      scopes: ['openid', 'https://uri.paypal.com/services/invoicing'],
      tokenExpiresAt: '2026-06-11T08:00:00.000Z',
    })
  })

  it('throws a clean error when PayPal rejects credentials', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid_client"}',
    })

    await expect(exchangePayPalClientCredentials({
      clientId: 'bad',
      clientSecret: 'bad-secret',
      environment: 'sandbox',
      endpoints: getPayPalEndpoints('sandbox'),
      now: new Date('2026-06-11T00:00:00.000Z'),
      fetcher,
    })).rejects.toThrow('PayPal token request failed with 401')
  })
})
```

- [ ] **Step 2: Run the utility tests and verify they fail**

Run:

```bash
pnpm test:run test/utils/paypalClient.test.ts
```

Expected: FAIL because `server/utils/paypalClient.ts` does not exist.

- [ ] **Step 3: Implement the PayPal client utility**

Create `server/utils/paypalClient.ts`:

```ts
export type PayPalEnvironment = 'sandbox' | 'live'

export interface PayPalEndpoints {
  apiBaseUrl: string
  tokenUrl: string
}

export interface PayPalResolvedConfig {
  clientId: string
  clientSecret: string
  environment: PayPalEnvironment
  configured: boolean
  endpoints: PayPalEndpoints
}

export interface PayPalTokenResult {
  accessToken: string
  tokenType: string
  appId: string | null
  scopes: string[]
  tokenExpiresAt: string
}

type PayPalRuntimeConfig = {
  paypalClientId?: string
  paypalClientSecret?: string
  paypalEnvironment?: string
}

export function normalizePayPalEnvironment(value?: string): PayPalEnvironment {
  return value === 'live' ? 'live' : 'sandbox'
}

export function getPayPalEndpoints(environment: PayPalEnvironment): PayPalEndpoints {
  const apiBaseUrl = environment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

  return {
    apiBaseUrl,
    tokenUrl: `${apiBaseUrl}/v1/oauth2/token`,
  }
}

export function resolvePayPalConfig(config: PayPalRuntimeConfig = useRuntimeConfig()): PayPalResolvedConfig {
  const environment = normalizePayPalEnvironment(config.paypalEnvironment)
  const clientId = String(config.paypalClientId || '')
  const clientSecret = String(config.paypalClientSecret || '')

  return {
    clientId,
    clientSecret,
    environment,
    configured: Boolean(clientId && clientSecret),
    endpoints: getPayPalEndpoints(environment),
  }
}

export async function exchangePayPalClientCredentials(input: {
  clientId: string
  clientSecret: string
  environment: PayPalEnvironment
  endpoints: PayPalEndpoints
  now?: Date
  fetcher?: typeof fetch
}): Promise<PayPalTokenResult> {
  const now = input.now ?? new Date()
  const fetcher = input.fetcher ?? fetch
  const credentials = btoa(`${input.clientId}:${input.clientSecret}`)

  const response = await fetcher(input.endpoints.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })

  if (!response.ok) {
    throw new Error(`PayPal token request failed with ${response.status}`)
  }

  const body = await response.json() as {
    scope?: string
    access_token?: string
    token_type?: string
    app_id?: string
    expires_in?: number
  }

  if (!body.access_token) {
    throw new Error('PayPal token response did not include an access token')
  }

  const expiresInSeconds = Number(body.expires_in || 0)
  const tokenExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000).toISOString()

  return {
    accessToken: body.access_token,
    tokenType: body.token_type || 'Bearer',
    appId: body.app_id || null,
    scopes: body.scope ? body.scope.split(/\s+/).filter(Boolean) : [],
    tokenExpiresAt,
  }
}
```

- [ ] **Step 4: Run the utility tests and verify they pass**

Run:

```bash
pnpm test:run test/utils/paypalClient.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/paypalClient.ts test/utils/paypalClient.test.ts
git commit -m "feat(paypal): add rest client credentials helper"
```

## Task 2: Database Migration

**Files:**
- Create: `server/database/migrations/177-paypal-connections.sql`

- [ ] **Step 1: Create the migration**

Create `server/database/migrations/177-paypal-connections.sql`:

```sql
-- Migration 177: PayPal REST API connection metadata
-- Stores short-lived REST access token metadata for the internal finance route.

CREATE TABLE IF NOT EXISTS paypal_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'live')),
  app_id TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'not_tested' CHECK (status IN ('not_tested', 'connected', 'expired', 'error')),
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  connected_by UUID REFERENCES team_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, environment)
);

CREATE INDEX IF NOT EXISTS idx_paypal_connections_tenant_environment
  ON paypal_connections (tenant_id, environment);

CREATE INDEX IF NOT EXISTS idx_paypal_connections_status
  ON paypal_connections (status);
```

- [ ] **Step 2: Commit the migration**

```bash
git add server/database/migrations/177-paypal-connections.sql
git commit -m "feat(paypal): add connection metadata table"
```

- [ ] **Step 3: Apply the migration**

Run using the project rule for migrations:

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/177-paypal-connections.sql
```

Expected: `CREATE TABLE` / `CREATE INDEX` notices or success output. If `.env` lacks `DATABASE_URL`, stop and ask for the connection string.

## Task 3: API Routes

**Files:**
- Create: `server/api/agency/paypal/status.get.ts`
- Create: `server/api/agency/paypal/test.post.ts`
- Create: `server/api/agency/paypal/clear.post.ts`
- Test: `test/server/api/agencyPaypal.test.ts`

- [ ] **Step 1: Write failing API handler tests**

Create `test/server/api/agencyPaypal.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
  useRuntimeConfig: () => Record<string, string>
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & {
    statusCode: number
    statusMessage: string
  }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const runtimeConfig: Record<string, string> = {}
testGlobal.useRuntimeConfig = () => runtimeConfig

const mockRequireAuth = vi.fn()
const mockRequireRole = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetSelectedTenant = vi.fn()
const mockQueryOne = vi.fn()
const mockExecute = vi.fn()
const mockExchangePayPalClientCredentials = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

vi.mock('~~/server/utils/session', () => ({
  getSelectedTenant: (...args: unknown[]) => mockGetSelectedTenant(...args),
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  execute: (...args: unknown[]) => mockExecute(...args),
}))

vi.mock('~~/server/utils/paypalClient', async () => {
  const actual = await vi.importActual<typeof import('../../../server/utils/paypalClient')>('../../../server/utils/paypalClient')
  return {
    ...actual,
    exchangePayPalClientCredentials: (...args: unknown[]) => mockExchangePayPalClientCredentials(...args),
  }
})

const { default: statusHandler } = await import('../../../server/api/agency/paypal/status.get')
const { default: testHandler } = await import('../../../server/api/agency/paypal/test.post')
const { default: clearHandler } = await import('../../../server/api/agency/paypal/clear.post')

describe('/api/agency/paypal', () => {
  beforeEach(() => {
    runtimeConfig.paypalClientId = ''
    runtimeConfig.paypalClientSecret = ''
    runtimeConfig.paypalEnvironment = 'sandbox'
    mockRequireAuth.mockReset().mockResolvedValue({ id: 'user-1', role: 'finance' })
    mockRequireRole.mockReset().mockResolvedValue({ id: 'user-1', role: 'finance' })
    mockRequireWriteAccess.mockReset().mockResolvedValue({ id: 'user-1', role: 'finance' })
    mockGetSelectedTenant.mockReset().mockResolvedValue('tenant-1')
    mockQueryOne.mockReset().mockResolvedValue(null)
    mockExecute.mockReset().mockResolvedValue(1)
    mockExchangePayPalClientCredentials.mockReset()
  })

  it('returns not_configured status without secrets', async () => {
    const result = await statusHandler({} as any)

    expect(result).toMatchObject({
      configured: false,
      environment: 'sandbox',
      health: 'not_configured',
      connection: null,
    })
    expect(JSON.stringify(result)).not.toContain('paypalClientSecret')
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('returns cached connection metadata without access token', async () => {
    runtimeConfig.paypalClientId = 'client-id'
    runtimeConfig.paypalClientSecret = 'client-secret'
    mockQueryOne.mockResolvedValueOnce({
      app_id: 'APP-123',
      token_expires_at: '2026-06-11T08:00:00.000Z',
      scopes: ['openid'],
      status: 'connected',
      last_checked_at: '2026-06-11T00:00:00.000Z',
      last_error: null,
      updated_at: '2026-06-11T00:00:00.000Z',
      access_token: 'server-secret-token',
    })

    const result = await statusHandler({} as any)

    expect(result).toMatchObject({
      configured: true,
      environment: 'sandbox',
      health: 'connected',
      connection: {
        appId: 'APP-123',
        tokenExpiresAt: '2026-06-11T08:00:00.000Z',
        scopes: ['openid'],
      },
    })
    expect(JSON.stringify(result)).not.toContain('server-secret-token')
  })

  it('rejects test when PayPal credentials are missing', async () => {
    await expect(testHandler({} as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'PayPal credentials are not configured',
    })
  })

  it('tests PayPal credentials and stores token metadata without returning token', async () => {
    runtimeConfig.paypalClientId = 'client-id'
    runtimeConfig.paypalClientSecret = 'client-secret'
    mockExchangePayPalClientCredentials.mockResolvedValueOnce({
      accessToken: 'server-secret-token',
      tokenType: 'Bearer',
      appId: 'APP-123',
      scopes: ['openid'],
      tokenExpiresAt: '2026-06-11T08:00:00.000Z',
    })

    const result = await testHandler({} as any)

    expect(result).toMatchObject({
      ok: true,
      environment: 'sandbox',
      connection: {
        appId: 'APP-123',
        tokenExpiresAt: '2026-06-11T08:00:00.000Z',
        scopes: ['openid'],
      },
    })
    expect(JSON.stringify(result)).not.toContain('server-secret-token')
    expect(mockExecute).toHaveBeenCalled()
  })

  it('clears cached PayPal metadata for the active tenant and environment', async () => {
    runtimeConfig.paypalClientId = 'client-id'
    runtimeConfig.paypalClientSecret = 'client-secret'

    const result = await clearHandler({} as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM paypal_connections'),
      ['tenant-1', 'sandbox']
    )
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run the API tests and verify they fail**

Run:

```bash
pnpm test:run test/server/api/agencyPaypal.test.ts
```

Expected: FAIL because the PayPal API route files do not exist.

- [ ] **Step 3: Implement `status.get.ts`**

Create `server/api/agency/paypal/status.get.ts`:

```ts
import { defineEventHandler } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { resolvePayPalConfig } from '~~/server/utils/paypalClient'
import { getSelectedTenant } from '~~/server/utils/session'

function parseScopes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return value.split(/\s+/).filter(Boolean)
    }
  }
  return []
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'finance'])

  const paypal = resolvePayPalConfig()
  if (!paypal.configured) {
    return {
      configured: false,
      environment: paypal.environment,
      apiBaseUrl: paypal.endpoints.apiBaseUrl,
      health: 'not_configured',
      connection: null,
    }
  }

  const tenantId = await getSelectedTenant(event) || 'global'
  const row = await queryOne<any>(
    `SELECT app_id, token_expires_at, scopes, status, last_checked_at, last_error, updated_at
       FROM paypal_connections
      WHERE tenant_id = $1 AND environment = $2`,
    [tenantId, paypal.environment]
  )

  if (!row) {
    return {
      configured: true,
      environment: paypal.environment,
      apiBaseUrl: paypal.endpoints.apiBaseUrl,
      health: 'not_tested',
      connection: null,
    }
  }

  const expired = row.token_expires_at ? new Date(row.token_expires_at).getTime() <= Date.now() : false
  const health = row.status === 'error'
    ? 'error'
    : expired
      ? 'expired'
      : row.status || 'not_tested'

  return {
    configured: true,
    environment: paypal.environment,
    apiBaseUrl: paypal.endpoints.apiBaseUrl,
    health,
    connection: {
      appId: row.app_id || null,
      tokenExpiresAt: row.token_expires_at || null,
      scopes: parseScopes(row.scopes),
      status: row.status || 'not_tested',
      lastCheckedAt: row.last_checked_at || null,
      lastError: row.last_error || null,
      updatedAt: row.updated_at || null,
    },
  }
})
```

- [ ] **Step 4: Implement `test.post.ts`**

Create `server/api/agency/paypal/test.post.ts`:

```ts
import { defineEventHandler, createError } from 'h3'
import { requireAuth, requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { exchangePayPalClientCredentials, resolvePayPalConfig } from '~~/server/utils/paypalClient'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'finance'])
  await requireWriteAccess(event)

  const paypal = resolvePayPalConfig()
  if (!paypal.configured) {
    throw createError({ statusCode: 400, statusMessage: 'PayPal credentials are not configured' })
  }

  const tenantId = await getSelectedTenant(event) || 'global'

  try {
    const token = await exchangePayPalClientCredentials({
      clientId: paypal.clientId,
      clientSecret: paypal.clientSecret,
      environment: paypal.environment,
      endpoints: paypal.endpoints,
    })

    await execute(
      `INSERT INTO paypal_connections
          (tenant_id, environment, app_id, access_token, token_expires_at, scopes, status, last_checked_at, last_error, connected_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'connected', NOW(), NULL, $7, NOW())
       ON CONFLICT (tenant_id, environment)
       DO UPDATE SET
          app_id = EXCLUDED.app_id,
          access_token = EXCLUDED.access_token,
          token_expires_at = EXCLUDED.token_expires_at,
          scopes = EXCLUDED.scopes,
          status = 'connected',
          last_checked_at = NOW(),
          last_error = NULL,
          connected_by = EXCLUDED.connected_by,
          updated_at = NOW()`,
      [
        tenantId,
        paypal.environment,
        token.appId,
        token.accessToken,
        token.tokenExpiresAt,
        JSON.stringify(token.scopes),
        user.id,
      ]
    )

    return {
      ok: true,
      environment: paypal.environment,
      connection: {
        appId: token.appId,
        tokenExpiresAt: token.tokenExpiresAt,
        scopes: token.scopes,
      },
    }
  } catch (error: any) {
    await execute(
      `INSERT INTO paypal_connections
          (tenant_id, environment, status, last_checked_at, last_error, connected_by, updated_at)
       VALUES ($1, $2, 'error', NOW(), $3, $4, NOW())
       ON CONFLICT (tenant_id, environment)
       DO UPDATE SET
          status = 'error',
          last_checked_at = NOW(),
          last_error = EXCLUDED.last_error,
          connected_by = EXCLUDED.connected_by,
          updated_at = NOW()`,
      [tenantId, paypal.environment, error?.message || 'PayPal test failed', user.id]
    )
    throw createError({ statusCode: 502, statusMessage: 'PayPal API test failed' })
  }
})
```

- [ ] **Step 5: Implement `clear.post.ts`**

Create `server/api/agency/paypal/clear.post.ts`:

```ts
import { defineEventHandler } from 'h3'
import { requireAuth, requireRole, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
import { resolvePayPalConfig } from '~~/server/utils/paypalClient'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'finance'])
  await requireWriteAccess(event)

  const paypal = resolvePayPalConfig()
  const tenantId = await getSelectedTenant(event) || 'global'

  await execute(
    `DELETE FROM paypal_connections WHERE tenant_id = $1 AND environment = $2`,
    [tenantId, paypal.environment]
  )

  return { ok: true }
})
```

- [ ] **Step 6: Run API tests and verify they pass**

Run:

```bash
pnpm test:run test/server/api/agencyPaypal.test.ts test/utils/paypalClient.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/api/agency/paypal/status.get.ts server/api/agency/paypal/test.post.ts server/api/agency/paypal/clear.post.ts test/server/api/agencyPaypal.test.ts
git commit -m "feat(paypal): add finance api status and test routes"
```

## Task 4: Runtime Config And Environment Docs

**Files:**
- Modify: `nuxt.config.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add runtime config keys**

Modify `nuxt.config.ts` inside `runtimeConfig`, after the Xero OAuth block:

```ts
    // PayPal REST API
    paypalClientId: process.env.PAYPAL_CLIENT_ID || '',
    paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
    paypalEnvironment: process.env.PAYPAL_ENVIRONMENT || 'sandbox',
```

- [ ] **Step 2: Add `.env.example` entries**

Add after the Xero block in `.env.example`:

```dotenv
# PayPal REST API Configuration
# Get these from https://developer.paypal.com/dashboard/applications/live or sandbox apps.
# PAYPAL_ENVIRONMENT must be sandbox or live.
PAYPAL_CLIENT_ID=your_paypal_client_id_here
PAYPAL_CLIENT_SECRET=your_paypal_client_secret_here
PAYPAL_ENVIRONMENT=sandbox
```

- [ ] **Step 3: Run related tests**

Run:

```bash
pnpm test:run test/utils/paypalClient.test.ts test/server/api/agencyPaypal.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts .env.example
git commit -m "chore(paypal): document rest api configuration"
```

## Task 5: Agency Page And Sidebar

**Files:**
- Create: `app/pages/agency/paypal.vue`
- Modify: `app/layouts/agency.vue`

- [ ] **Step 1: Create the PayPal finance page**

Create `app/pages/agency/paypal.vue`:

```vue
<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

type PayPalStatus = {
  configured: boolean
  environment: 'sandbox' | 'live'
  apiBaseUrl: string
  health: 'not_configured' | 'not_tested' | 'connected' | 'expired' | 'error'
  connection: null | {
    appId: string | null
    tokenExpiresAt: string | null
    scopes: string[]
    status: string
    lastCheckedAt: string | null
    lastError: string | null
    updatedAt: string | null
  }
}

const toast = useToast()
const testing = ref(false)
const clearing = ref(false)

const { data, pending, refresh } = await useFetch<PayPalStatus>('/api/agency/paypal/status', {
  default: () => ({
    configured: false,
    environment: 'sandbox',
    apiBaseUrl: 'https://api-m.sandbox.paypal.com',
    health: 'not_configured',
    connection: null,
  }),
})

const statusColor = computed(() => {
  switch (data.value?.health) {
    case 'connected':
      return 'success'
    case 'expired':
      return 'warning'
    case 'error':
      return 'error'
    case 'not_configured':
      return 'neutral'
    default:
      return 'info'
  }
})

const statusLabel = computed(() => {
  switch (data.value?.health) {
    case 'connected':
      return 'Connected'
    case 'expired':
      return 'Expired'
    case 'error':
      return 'Error'
    case 'not_configured':
      return 'Not configured'
    default:
      return 'Not tested'
  }
})

function formatDate(value: string | null | undefined) {
  if (!value) return 'Never'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function testConnection() {
  testing.value = true
  try {
    await $fetch('/api/agency/paypal/test', { method: 'POST' })
    toast.add({ title: 'PayPal test passed', description: 'REST credentials returned an access token.', color: 'success' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'PayPal test failed', description: error?.statusMessage || 'Check PayPal credentials and environment.', color: 'error' })
  } finally {
    testing.value = false
  }
}

async function clearConnection() {
  clearing.value = true
  try {
    await $fetch('/api/agency/paypal/clear', { method: 'POST' })
    toast.add({ title: 'PayPal metadata cleared', color: 'success' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not clear PayPal metadata', description: error?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    clearing.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="p-6 lg:p-8 space-y-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold tracking-tight">PayPal</h1>
          <p class="mt-1 text-sm text-muted">REST API readiness for finance operations.</p>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            variant="soft"
            color="neutral"
            :loading="pending"
            @click="refresh()"
          >
            Refresh
          </UButton>
          <UButton
            icon="i-lucide-plug-zap"
            :loading="testing"
            :disabled="!data?.configured"
            @click="testConnection"
          >
            Test API
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="!data?.configured"
        icon="i-lucide-circle-alert"
        color="warning"
        title="PayPal credentials are not configured"
        description="Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and PAYPAL_ENVIRONMENT in the server environment."
      />

      <div class="grid gap-4 lg:grid-cols-3">
        <UCard>
          <div class="space-y-2">
            <p class="text-xs uppercase font-semibold text-muted">Status</p>
            <div class="flex items-center gap-2">
              <UBadge :color="statusColor" variant="soft">{{ statusLabel }}</UBadge>
              <UBadge color="neutral" variant="subtle">{{ data?.environment }}</UBadge>
            </div>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-2">
            <p class="text-xs uppercase font-semibold text-muted">API Base</p>
            <p class="text-sm font-medium break-all">{{ data?.apiBaseUrl }}</p>
          </div>
        </UCard>

        <UCard>
          <div class="space-y-2">
            <p class="text-xs uppercase font-semibold text-muted">Last Checked</p>
            <p class="text-sm font-medium">{{ formatDate(data?.connection?.lastCheckedAt) }}</p>
          </div>
        </UCard>
      </div>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="font-semibold">REST token metadata</h2>
              <p class="text-sm text-muted">Token values stay server-side and are never shown here.</p>
            </div>
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              :loading="clearing"
              :disabled="!data?.connection"
              @click="clearConnection"
            >
              Clear
            </UButton>
          </div>
        </template>

        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <p class="text-xs uppercase font-semibold text-muted">App ID</p>
            <p class="mt-1 text-sm font-medium">{{ data?.connection?.appId || 'Not available' }}</p>
          </div>
          <div>
            <p class="text-xs uppercase font-semibold text-muted">Token expires</p>
            <p class="mt-1 text-sm font-medium">{{ formatDate(data?.connection?.tokenExpiresAt) }}</p>
          </div>
          <div class="md:col-span-2">
            <p class="text-xs uppercase font-semibold text-muted">Scopes</p>
            <div v-if="data?.connection?.scopes?.length" class="mt-2 flex flex-wrap gap-2">
              <UBadge v-for="scope in data.connection.scopes" :key="scope" color="neutral" variant="subtle">
                {{ scope }}
              </UBadge>
            </div>
            <p v-else class="mt-1 text-sm text-muted">No scopes recorded yet.</p>
          </div>
          <div v-if="data?.connection?.lastError" class="md:col-span-2">
            <p class="text-xs uppercase font-semibold text-muted">Last error</p>
            <p class="mt-1 text-sm text-error">{{ data.connection.lastError }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add the sidebar item**

Modify the Finance block in `app/layouts/agency.vue` to include PayPal after Billing:

```ts
      { label: 'Billing', icon: 'i-lucide-receipt', to: '/agency/billing', onSelect: close },
      { label: 'PayPal', icon: 'i-lucide-wallet-cards', to: '/agency/paypal', onSelect: close },
      { label: 'Expenses', icon: 'i-lucide-credit-card', to: '/agency/expenses', onSelect: close },
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
pnpm test:run test/utils/paypalClient.test.ts test/server/api/agencyPaypal.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/paypal.vue app/layouts/agency.vue
git commit -m "feat(paypal): add agency finance route"
```

## Task 6: Final Verification

**Files:**
- All files changed in Tasks 1-5

- [ ] **Step 1: Re-read changed files**

Run:

```bash
git diff --stat HEAD~4..HEAD
```

Expected: only PayPal route, PayPal tests, migration, config, env docs, and sidebar changes are present in the PayPal commits.

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm test:run test/utils/paypalClient.test.ts test/server/api/agencyPaypal.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm run typecheck
```

Expected: PASS or only the repository's known pre-existing type errors from `CLAUDE.md`. Record the result in the final response.

- [ ] **Step 4: Run dev server**

Run:

```bash
pnpm dev
```

Expected: Nuxt starts and prints a local URL. Visit `/agency/paypal` while logged in with a finance-capable account and verify the page loads.

- [ ] **Step 5: Commit any verification fixes**

If verification revealed fixes, stage the PayPal implementation files and commit them:

```bash
git add server/utils/paypalClient.ts test/utils/paypalClient.test.ts server/database/migrations/177-paypal-connections.sql server/api/agency/paypal/status.get.ts server/api/agency/paypal/test.post.ts server/api/agency/paypal/clear.post.ts test/server/api/agencyPaypal.test.ts nuxt.config.ts .env.example app/pages/agency/paypal.vue app/layouts/agency.vue
git commit -m "fix(paypal): resolve finance route verification issues"
```

If verification produces no changes, do not run a final commit.
