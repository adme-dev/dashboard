# Client-Scoped Invoice Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Account managers can view/create draft invoices for their assigned clients only, while finance roles retain full unscoped access.

**Architecture:** New `client_team_assignments` table links clients to team members. A server-side `requireInvoiceAccess()` helper resolves whether the user gets full access (finance) or scoped access (AM). Existing invoice endpoints are modified to filter by assigned client IDs. UI adapts based on role.

**Tech Stack:** Nuxt 4, Nitro, Neon Postgres, Cloudflare KV (caching), Nuxt UI v4

**Spec:** `docs/superpowers/specs/2026-04-01-client-scoped-invoices-design.md`

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `server/database/migrations/064-client-team-assignments.sql` | Migration for assignment table |
| `server/utils/clientScoping.ts` | `getAssignedClientIds()` + `requireInvoiceAccess()` |
| `server/api/agency/clients/[id]/team.get.ts` | List team members assigned to a client |
| `server/api/agency/clients/[id]/team.post.ts` | Add team member assignment |
| `server/api/agency/clients/[id]/team/[memberId].delete.ts` | Remove assignment |
| `server/api/agency/team-members/[id]/clients.get.ts` | List assigned clients for a member |
| `app/middleware/role-invoice.ts` | Route guard for `INVOICE_OWN_CLIENTS` |
| `app/components/clients/ClientTeamCard.vue` | Account team card on client detail page |
| `app/components/team/MemberClientsSlideover.vue` | Client book slideover on team list |
| `test/server/utils/clientScoping.test.ts` | Unit tests for scoping logic |

### Modified files
| File | Change |
|------|--------|
| `server/utils/permissions.ts` | Add `INVOICE_OWN_CLIENTS` group, update `account_manager` mapping |
| `app/utils/permissions.ts` | Mirror `INVOICE_OWN_CLIENTS` group |
| `server/api/agency/invoices/index.get.ts` | Add client scoping + `created_by` in SELECT |
| `server/api/agency/invoices/index.post.ts` | Validate client assignment, force draft for AMs |
| `server/api/agency/invoices/generate.post.ts` | Validate client assignment, force draft for AMs |
| `server/api/agency/invoices/[id].get.ts` | Check client assignment for scoped users |
| `server/api/agency/invoices/[id].delete.ts` | Check `created_by` + draft-only for AMs |
| `app/components/billing/InvoicesTab.vue` | Conditional tabs, scoped filters, action visibility |
| `app/pages/agency/clients/[id].vue` | Add Account Team section |
| `app/pages/agency/team.vue` | Add Client Book slideover trigger |
| `app/layouts/agency.vue` | Add Invoices nav link for `INVOICE_OWN_CLIENTS` |
| `app/composables/useAuth.ts` | Add `canAccessInvoices` computed |

---

## Task 1: Migration + Permission Constants

**Files:**
- Create: `server/database/migrations/064-client-team-assignments.sql`
- Modify: `server/utils/permissions.ts`
- Modify: `app/utils/permissions.ts`

- [ ] **Step 1: Create the migration file**

```sql
-- server/database/migrations/064-client-team-assignments.sql
-- Client-to-team-member assignments for scoped invoice access

CREATE TABLE IF NOT EXISTS client_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary_am',
  assigned_by UUID REFERENCES team_members(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, team_member_id)
);

CREATE INDEX IF NOT EXISTS idx_client_team_client ON client_team_assignments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_team_member ON client_team_assignments(team_member_id);

-- Check constraint for valid roles
ALTER TABLE client_team_assignments
  ADD CONSTRAINT chk_assignment_role CHECK (role IN ('primary_am', 'secondary_am', 'support'));
```

- [ ] **Step 2: Run migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/064-client-team-assignments.sql
```

Expected: `CREATE TABLE`, `CREATE INDEX`, `CREATE INDEX`, `ALTER TABLE`

- [ ] **Step 3: Add `INVOICE_OWN_CLIENTS` to server permissions**

In `server/utils/permissions.ts`, add the new permission group after the `AUTOMATION` line:

```typescript
// Add to PERMISSIONS object:
INVOICE_OWN_CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts', 'account_manager'],
```

Update the `SYSTEM_ROLE_PERMISSIONS` map — find the `account_manager` entry and add `'INVOICE_OWN_CLIENTS'`:

```typescript
account_manager: ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'],
```

- [ ] **Step 4: Mirror in frontend permissions**

In `app/utils/permissions.ts`, add the same `INVOICE_OWN_CLIENTS` array to the `PERMISSIONS` object:

```typescript
INVOICE_OWN_CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts', 'account_manager'],
```

- [ ] **Step 5: Add `canAccessInvoices` to useAuth**

In `app/composables/useAuth.ts`, add after the `canAccessFinance` computed:

```typescript
const canAccessInvoices = computed(() => hasRole(PERMISSIONS.INVOICE_OWN_CLIENTS))
```

Add `canAccessInvoices` to the return object of the composable.

- [ ] **Step 6: Commit**

```bash
git add server/database/migrations/064-client-team-assignments.sql server/utils/permissions.ts app/utils/permissions.ts app/composables/useAuth.ts
git commit -m "feat: client team assignments table + INVOICE_OWN_CLIENTS permission"
```

---

## Task 2: Client Scoping Utility

**Files:**
- Create: `server/utils/clientScoping.ts`
- Create: `test/server/utils/clientScoping.test.ts`

- [ ] **Step 1: Write tests for scoping logic**

```typescript
// test/server/utils/clientScoping.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the db module
vi.mock('~~/server/utils/db', () => ({
  queryRows: vi.fn(),
}))

// Mock the kv module
vi.mock('~~/server/utils/kv', () => ({
  kvGet: vi.fn().mockResolvedValue(null),
  kvPut: vi.fn(),
}))

import { queryRows } from '~~/server/utils/db'
import { kvGet } from '~~/server/utils/kv'

describe('clientScoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getAssignedClientIds', () => {
    it('returns client IDs from DB when KV cache misses', async () => {
      const { getAssignedClientIds } = await import('~~/server/utils/clientScoping')
      const mockEvent = {} as any
      vi.mocked(kvGet).mockResolvedValue(null)
      vi.mocked(queryRows).mockResolvedValue([
        { client_id: 'client-1' },
        { client_id: 'client-2' },
      ])

      const result = await getAssignedClientIds(mockEvent, 'user-1')
      expect(result).toEqual(['client-1', 'client-2'])
    })

    it('returns cached IDs from KV when available', async () => {
      const { getAssignedClientIds } = await import('~~/server/utils/clientScoping')
      const mockEvent = {} as any
      vi.mocked(kvGet).mockResolvedValue(['client-1', 'client-2'])

      const result = await getAssignedClientIds(mockEvent, 'user-1')
      expect(result).toEqual(['client-1', 'client-2'])
    })

    it('returns empty array when user has no assignments', async () => {
      const { getAssignedClientIds } = await import('~~/server/utils/clientScoping')
      const mockEvent = {} as any
      vi.mocked(kvGet).mockResolvedValue(null)
      vi.mocked(queryRows).mockResolvedValue([])

      const result = await getAssignedClientIds(mockEvent, 'user-1')
      expect(result).toEqual([])
    })
  })

  describe('resolveInvoiceAccess', () => {
    it('returns "all" for users with FINANCE permission', async () => {
      const { resolveInvoiceAccess } = await import('~~/server/utils/clientScoping')
      const user = { id: 'u1', role: 'finance', permissionGroups: ['FINANCE'] } as any

      const result = await resolveInvoiceAccess({} as any, user)
      expect(result).toBe('all')
    })

    it('returns "all" for owner role', async () => {
      const { resolveInvoiceAccess } = await import('~~/server/utils/clientScoping')
      const user = { id: 'u1', role: 'owner', permissionGroups: ['ADMIN', 'FINANCE'] } as any

      const result = await resolveInvoiceAccess({} as any, user)
      expect(result).toBe('all')
    })

    it('returns client IDs for account_manager role', async () => {
      const { resolveInvoiceAccess } = await import('~~/server/utils/clientScoping')
      vi.mocked(kvGet).mockResolvedValue(null)
      vi.mocked(queryRows).mockResolvedValue([{ client_id: 'c1' }, { client_id: 'c2' }])
      const user = { id: 'u1', role: 'account_manager', permissionGroups: ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'] } as any

      const result = await resolveInvoiceAccess({} as any, user)
      expect(result).toEqual(['c1', 'c2'])
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run test/server/utils/clientScoping.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Implement clientScoping.ts**

```typescript
// server/utils/clientScoping.ts
import { createError, type H3Event } from 'h3'
import { queryRows } from './db'
import { kvGet, kvPut } from './kv'
import { PERMISSIONS } from './permissions'
import type { User } from './auth'

const CACHE_TTL = 300 // 5 minutes

/**
 * Get the client IDs assigned to a team member.
 * Cached in KV for 5 minutes.
 */
export async function getAssignedClientIds(event: H3Event, userId: string): Promise<string[]> {
  const cacheKey = `client-assignments:${userId}`

  const cached = await kvGet<string[]>(event, cacheKey)
  if (cached) return cached

  const rows = await queryRows<{ client_id: string }>(
    'SELECT client_id FROM client_team_assignments WHERE team_member_id = $1',
    [userId]
  )

  const ids = rows.map(r => r.client_id)
  kvPut(event, cacheKey, ids, CACHE_TTL)
  return ids
}

/**
 * Resolve invoice access for a user.
 * Returns 'all' for finance roles, or an array of client IDs for scoped users.
 */
export async function resolveInvoiceAccess(event: H3Event, user: User): Promise<'all' | string[]> {
  // Finance roles get full access
  const isFinance = PERMISSIONS.FINANCE.includes(user.role)
    || user.permissionGroups?.includes('FINANCE')
  if (isFinance) return 'all'

  // Check for INVOICE_OWN_CLIENTS permission
  const hasInvoiceAccess = PERMISSIONS.INVOICE_OWN_CLIENTS.includes(user.role)
    || user.permissionGroups?.includes('INVOICE_OWN_CLIENTS')
  if (!hasInvoiceAccess) {
    throw createError({ statusCode: 403, statusMessage: 'No invoice access' })
  }

  return getAssignedClientIds(event, user.id)
}

/**
 * Convenience: requireAuth + resolveInvoiceAccess in one call.
 */
export async function requireInvoiceAccess(event: H3Event): Promise<{ user: User; clientIds: 'all' | string[] }> {
  const { requireAuth } = await import('./auth')
  const user = await requireAuth(event)
  const clientIds = await resolveInvoiceAccess(event, user)
  return { user, clientIds }
}

/**
 * Invalidate a user's client assignment cache (call after add/remove assignment).
 */
export function invalidateAssignmentCache(event: H3Event, userId: string) {
  const { kvDelete } = require('./kv')
  kvDelete(event, `client-assignments:${userId}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run test/server/utils/clientScoping.test.ts
```

Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/utils/clientScoping.ts test/server/utils/clientScoping.test.ts
git commit -m "feat: client scoping utility with KV cache + tests"
```

---

## Task 3: Client Team Assignment API

**Files:**
- Create: `server/api/agency/clients/[id]/team.get.ts`
- Create: `server/api/agency/clients/[id]/team.post.ts`
- Create: `server/api/agency/clients/[id]/team/[memberId].delete.ts`
- Create: `server/api/agency/team-members/[id]/clients.get.ts`

- [ ] **Step 1: List team members for a client**

```typescript
// server/api/agency/clients/[id]/team.get.ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CLIENTS)
  const clientId = getRouterParam(event, 'id')

  const rows = await queryRows<{
    id: string
    team_member_id: string
    member_name: string
    member_email: string
    member_avatar: string | null
    role: string
    assigned_at: string
    assigned_by_name: string | null
  }>(`
    SELECT
      cta.id,
      cta.team_member_id,
      tm.name AS member_name,
      tm.email AS member_email,
      tm.avatar_url AS member_avatar,
      cta.role,
      cta.assigned_at,
      ab.name AS assigned_by_name
    FROM client_team_assignments cta
    JOIN team_members tm ON cta.team_member_id = tm.id
    LEFT JOIN team_members ab ON cta.assigned_by = ab.id
    WHERE cta.client_id = $1
    ORDER BY
      CASE cta.role WHEN 'primary_am' THEN 1 WHEN 'secondary_am' THEN 2 ELSE 3 END,
      cta.assigned_at
  `, [clientId])

  return rows
})
```

- [ ] **Step 2: Add team member assignment**

```typescript
// server/api/agency/clients/[id]/team.post.ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { invalidateAssignmentCache } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MANAGEMENT)
  const clientId = getRouterParam(event, 'id')
  const body = await readBody<{ teamMemberId: string; role?: string }>(event)

  if (!body.teamMemberId) {
    throw createError({ statusCode: 400, statusMessage: 'teamMemberId required' })
  }

  const role = body.role || 'primary_am'
  if (!['primary_am', 'secondary_am', 'support'].includes(role)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid role. Must be primary_am, secondary_am, or support' })
  }

  const row = await queryOne<{ id: string }>(`
    INSERT INTO client_team_assignments (client_id, team_member_id, role, assigned_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (client_id, team_member_id)
    DO UPDATE SET role = EXCLUDED.role, assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
    RETURNING id
  `, [clientId, body.teamMemberId, role, user.id])

  invalidateAssignmentCache(event, body.teamMemberId)

  return { ok: true, id: row?.id }
})
```

- [ ] **Step 3: Remove assignment**

```typescript
// server/api/agency/clients/[id]/team/[memberId].delete.ts
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
import { invalidateAssignmentCache } from '~~/server/utils/clientScoping'

export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const clientId = getRouterParam(event, 'id')
  const memberId = getRouterParam(event, 'memberId')

  await execute(
    'DELETE FROM client_team_assignments WHERE client_id = $1 AND team_member_id = $2',
    [clientId, memberId]
  )

  invalidateAssignmentCache(event, memberId!)

  return { ok: true }
})
```

- [ ] **Step 4: List assigned clients for a team member**

```typescript
// server/api/agency/team-members/[id]/clients.get.ts
import { requireAuth } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { hasRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const memberId = getRouterParam(event, 'id')

  // Can view own assignments, or management can view anyone's
  const isManagement = hasRole(user, PERMISSIONS.MANAGEMENT)
  if (memberId !== user.id && !isManagement) {
    throw createError({ statusCode: 403, statusMessage: 'Cannot view other members\' assignments' })
  }

  const rows = await queryRows<{
    id: string
    client_id: string
    client_name: string
    role: string
    assigned_at: string
  }>(`
    SELECT
      cta.id,
      cta.client_id,
      ac.name AS client_name,
      cta.role,
      cta.assigned_at
    FROM client_team_assignments cta
    JOIN agency_clients ac ON cta.client_id = ac.id
    WHERE cta.team_member_id = $1
    ORDER BY ac.name
  `, [memberId])

  return rows
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/clients/\[id\]/team.get.ts server/api/agency/clients/\[id\]/team.post.ts server/api/agency/clients/\[id\]/team/\[memberId\].delete.ts server/api/agency/team-members/\[id\]/clients.get.ts
git commit -m "feat: client team assignment CRUD endpoints"
```

---

## Task 4: Invoice Endpoint Scoping

**Files:**
- Modify: `server/api/agency/invoices/index.get.ts`
- Modify: `server/api/agency/invoices/index.post.ts`
- Modify: `server/api/agency/invoices/generate.post.ts`
- Modify: `server/api/agency/invoices/[id].get.ts`
- Modify: `server/api/agency/invoices/[id].delete.ts`

- [ ] **Step 1: Scope the invoice list endpoint**

In `server/api/agency/invoices/index.get.ts`, replace the `requireAuth()` call at the top with:

```typescript
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

// Replace: const user = await requireAuth(event)
// With:
const { user, clientIds } = await requireInvoiceAccess(event)
```

Add `i.created_by` to the SELECT clause (after `i.created_at`):

```sql
i.created_by,
```

Add client scoping to the WHERE conditions (after existing filters):

```typescript
if (clientIds !== 'all') {
  conditions.push(`i.client_id = ANY($${params.length + 1}::uuid[])`)
  params.push(clientIds)
}
```

- [ ] **Step 2: Scope the invoice create endpoint**

In `server/api/agency/invoices/index.post.ts`, replace `requireAuth()` with:

```typescript
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

const { user, clientIds } = await requireInvoiceAccess(event)
```

After reading the body and before creating the invoice, add validation:

```typescript
// Validate client assignment for scoped users
if (clientIds !== 'all') {
  if (!clientIds.includes(body.clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'Not assigned to this client' })
  }
  // Force draft status for account managers
  body.status = 'draft'
}
```

- [ ] **Step 3: Scope the generate endpoint**

In `server/api/agency/invoices/generate.post.ts`, replace `requireAuth()` with:

```typescript
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

const { user, clientIds } = await requireInvoiceAccess(event)
```

After reading the body, add the same validation:

```typescript
if (clientIds !== 'all') {
  if (!clientIds.includes(body.clientId)) {
    throw createError({ statusCode: 403, statusMessage: 'Not assigned to this client' })
  }
}
```

- [ ] **Step 4: Scope the invoice detail endpoint**

In `server/api/agency/invoices/[id].get.ts`, replace `requireAuth()` with:

```typescript
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

const { user, clientIds } = await requireInvoiceAccess(event)
```

After fetching the invoice, add the check:

```typescript
if (clientIds !== 'all' && !clientIds.includes(invoice.client_id)) {
  throw createError({ statusCode: 403, statusMessage: 'Not authorized to view this invoice' })
}
```

- [ ] **Step 5: Scope the delete endpoint**

In `server/api/agency/invoices/[id].delete.ts`, replace the `requireRole(event, ['owner', 'admin'])` with:

```typescript
import { requireInvoiceAccess } from '~~/server/utils/clientScoping'

const { user, clientIds } = await requireInvoiceAccess(event)
```

After fetching the invoice, add scoped restrictions:

```typescript
if (clientIds !== 'all') {
  // Scoped users can only delete their own draft invoices
  if (!clientIds.includes(invoice.client_id)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to delete this invoice' })
  }
  if (invoice.status !== 'draft') {
    throw createError({ statusCode: 403, statusMessage: 'Account managers can only delete draft invoices' })
  }
  if (invoice.created_by !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Can only delete invoices you created' })
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add server/api/agency/invoices/
git commit -m "feat: client-scoped invoice access on all endpoints"
```

---

## Task 5: Role Invoice Middleware + Nav

**Files:**
- Create: `app/middleware/role-invoice.ts`
- Modify: `app/layouts/agency.vue`
- Modify: `app/pages/agency/billing.vue` (or wherever the billing page defines its middleware)

- [ ] **Step 1: Create route middleware**

```typescript
// app/middleware/role-invoice.ts
import { PERMISSIONS } from '~/utils/permissions'

export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser, hasRole } = useAuth()

  if (!user.value) {
    await fetchUser()
  }

  if (!user.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }

  if (!hasRole(PERMISSIONS.INVOICE_OWN_CLIENTS)) {
    return navigateTo({ path: '/agency', query: { error: 'no-invoice-access' } })
  }
})
```

- [ ] **Step 2: Update billing page middleware**

In the billing page (`app/pages/agency/billing.vue`), change the middleware from `role-finance` to `role-invoice`:

```typescript
definePageMeta({
  middleware: ['role-invoice'],  // was 'role-finance'
  layout: 'agency'
})
```

- [ ] **Step 3: Add Invoices nav link for AMs**

In `app/layouts/agency.vue`, find the navigation section where `canAccessFinance` is checked. Add a new section BEFORE the Finance section:

```typescript
// Add after canAccessFinance check but visible to canAccessInvoices
if (canAccessInvoices.value && !canAccessFinance.value) {
  items.push(
    { type: 'label', label: 'Billing' },
    { label: 'Invoices', icon: 'i-lucide-receipt', to: '/agency/billing', onSelect: close },
  )
}
```

This ensures AMs see "Invoices" in the nav, while finance users see the full Finance section as before (no duplication).

- [ ] **Step 4: Commit**

```bash
git add app/middleware/role-invoice.ts app/layouts/agency.vue app/pages/agency/billing.vue
git commit -m "feat: role-invoice middleware + nav link for account managers"
```

---

## Task 6: Billing Page Conditional UI

**Files:**
- Modify: `app/components/billing/InvoicesTab.vue`

- [ ] **Step 1: Add role-based state**

At the top of the `<script setup>`, add:

```typescript
const { canAccessFinance, canAccessInvoices, user } = useAuth()
const isFullFinance = canAccessFinance
const isScopedAccess = computed(() => canAccessInvoices.value && !canAccessFinance.value)
```

- [ ] **Step 2: Scope the client dropdown**

If the component fetches all clients for the filter dropdown, scope it for AMs:

```typescript
// Replace the existing client fetch with:
const clientsUrl = computed(() => {
  if (isScopedAccess.value && user.value) {
    return `/api/agency/team-members/${user.value.id}/clients`
  }
  return '/api/agency/clients'
})

const { data: clients } = useFetch(clientsUrl)
```

For scoped users, the clients come from the team-members endpoint (already scoped). For finance users, all clients are fetched.

- [ ] **Step 3: Hide EOM tab for scoped users**

In the template where tabs are rendered, conditionally show EOM:

```vue
<UTabs :items="availableTabs" ...>
```

```typescript
const availableTabs = computed(() => {
  const tabs = [{ label: 'Invoices', slot: 'invoices' }]
  if (isFullFinance.value) {
    tabs.push({ label: 'EOM Generation', slot: 'eom' })
  }
  return tabs
})
```

- [ ] **Step 4: Restrict actions for scoped users**

In the template, conditionally show/hide action buttons:

```vue
<!-- New Invoice button: always visible but force draft for scoped -->
<UButton
  :label="isScopedAccess ? 'New Draft Invoice' : 'New Invoice'"
  @click="openCreateModal"
/>

<!-- Send button: finance only -->
<UButton
  v-if="isFullFinance"
  label="Send"
  @click="sendInvoice(invoice)"
/>

<!-- Delete: scoped users only see it for their own drafts -->
<UButton
  v-if="isFullFinance || (isScopedAccess && invoice.status === 'draft' && invoice.created_by === user?.id)"
  label="Delete"
  color="error"
  @click="deleteInvoice(invoice)"
/>
```

- [ ] **Step 5: Commit**

```bash
git add app/components/billing/InvoicesTab.vue
git commit -m "feat: conditional billing UI for scoped invoice access"
```

---

## Task 7: Client Team Card (Client Detail Page)

**Files:**
- Create: `app/components/clients/ClientTeamCard.vue`
- Modify: `app/pages/agency/clients/[id].vue`

- [ ] **Step 1: Create the ClientTeamCard component**

```vue
<!-- app/components/clients/ClientTeamCard.vue -->
<script setup lang="ts">
const props = defineProps<{ clientId: string }>()

const { canAccessFinance } = useAuth()
const { hasRole } = useAuth()
const canManage = computed(() => hasRole(PERMISSIONS.MANAGEMENT))
const toast = useToast()

const { data: team, refresh } = useFetch(() => `/api/agency/clients/${props.clientId}/team`)

const { data: allMembers } = useLazyFetch('/api/agency/team-members', { server: false })

const showAddForm = ref(false)
const newMemberId = ref('')
const newRole = ref('primary_am')

const roleOptions = [
  { label: 'Primary AM', value: 'primary_am' },
  { label: 'Secondary AM', value: 'secondary_am' },
  { label: 'Support', value: 'support' },
]

const roleBadgeColor = (role: string) => {
  if (role === 'primary_am') return 'success'
  if (role === 'secondary_am') return 'info'
  return 'neutral'
}

const roleLabel = (role: string) => {
  if (role === 'primary_am') return 'Primary AM'
  if (role === 'secondary_am') return 'Secondary AM'
  return 'Support'
}

const availableMembers = computed(() => {
  const assignedIds = new Set((team.value || []).map((t: any) => t.team_member_id))
  return (allMembers.value || [])
    .filter((m: any) => !assignedIds.has(m.id))
    .map((m: any) => ({ label: m.name, value: m.id }))
})

async function addMember() {
  if (!newMemberId.value) return
  try {
    await $fetch(`/api/agency/clients/${props.clientId}/team`, {
      method: 'POST',
      body: { teamMemberId: newMemberId.value, role: newRole.value }
    })
    toast.add({ title: 'Team member assigned', color: 'success' })
    showAddForm.value = false
    newMemberId.value = ''
    newRole.value = 'primary_am'
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to assign', color: 'error' })
  }
}

async function removeMember(memberId: string, memberName: string) {
  try {
    await $fetch(`/api/agency/clients/${props.clientId}/team/${memberId}`, { method: 'DELETE' })
    toast.add({ title: `${memberName} removed`, color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to remove', color: 'error' })
  }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold">Account Team</h3>
        <UButton
          v-if="canManage && !showAddForm"
          label="Add"
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-plus"
          @click="showAddForm = true"
        />
      </div>
    </template>

    <div v-if="showAddForm" class="mb-4 flex items-end gap-2">
      <UFormField label="Team Member" class="flex-1">
        <USelectMenu
          v-model="newMemberId"
          :options="availableMembers"
          placeholder="Select member..."
          value-key="value"
        />
      </UFormField>
      <UFormField label="Role">
        <USelectMenu
          v-model="newRole"
          :options="roleOptions"
          value-key="value"
        />
      </UFormField>
      <UButton label="Assign" size="sm" @click="addMember" />
      <UButton label="Cancel" size="sm" variant="ghost" @click="showAddForm = false" />
    </div>

    <div v-if="!team?.length && !showAddForm" class="text-sm text-muted py-2">
      No team members assigned yet.
    </div>

    <div v-for="member in team" :key="member.id" class="flex items-center justify-between py-2 border-b border-default last:border-0">
      <div class="flex items-center gap-3">
        <UAvatar :src="member.member_avatar" :alt="member.member_name" size="sm" />
        <div>
          <div class="text-sm font-medium">{{ member.member_name }}</div>
          <div class="text-xs text-muted">{{ member.member_email }}</div>
        </div>
        <UBadge :color="roleBadgeColor(member.role)" :label="roleLabel(member.role)" size="xs" variant="subtle" />
      </div>
      <UDropdownMenu v-if="canManage" :items="[[{ label: 'Remove', icon: 'i-lucide-user-minus', click: () => removeMember(member.team_member_id, member.member_name) }]]">
        <UButton icon="i-lucide-more-horizontal" size="xs" variant="ghost" color="neutral" />
      </UDropdownMenu>
    </div>
  </UCard>
</template>
```

- [ ] **Step 2: Add to client detail page**

In `app/pages/agency/clients/[id].vue`, import and add the component in the overview tab or as a new section:

```vue
<ClientTeamCard :client-id="clientId" />
```

Place it after the existing client info card in the overview section.

- [ ] **Step 3: Commit**

```bash
git add app/components/clients/ClientTeamCard.vue app/pages/agency/clients/\[id\].vue
git commit -m "feat: Account Team card on client detail page"
```

---

## Task 8: Member Clients Slideover (Team Page)

**Files:**
- Create: `app/components/team/MemberClientsSlideover.vue`
- Modify: `app/pages/agency/team.vue`

- [ ] **Step 1: Create the slideover component**

```vue
<!-- app/components/team/MemberClientsSlideover.vue -->
<script setup lang="ts">
const props = defineProps<{ memberId: string; memberName: string }>()
const open = defineModel<boolean>('open', { default: false })

const { hasRole } = useAuth()
const canManage = computed(() => hasRole(PERMISSIONS.MANAGEMENT))
const toast = useToast()

const { data: clients, refresh } = useFetch(() => `/api/agency/team-members/${props.memberId}/clients`, {
  watch: [() => props.memberId]
})

const roleLabel = (role: string) => {
  if (role === 'primary_am') return 'Primary AM'
  if (role === 'secondary_am') return 'Secondary AM'
  return 'Support'
}

const roleBadgeColor = (role: string) => {
  if (role === 'primary_am') return 'success'
  if (role === 'secondary_am') return 'info'
  return 'neutral'
}

async function removeAssignment(clientId: string, clientName: string) {
  try {
    await $fetch(`/api/agency/clients/${clientId}/team/${props.memberId}`, { method: 'DELETE' })
    toast.add({ title: `Removed from ${clientName}`, color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed', color: 'error' })
  }
}
</script>

<template>
  <USlideover v-model:open="open">
    <template #content>
      <div class="p-6">
        <h2 class="text-lg font-semibold mb-1">{{ memberName }}</h2>
        <p class="text-sm text-muted mb-6">{{ clients?.length || 0 }} assigned client(s)</p>

        <div v-if="!clients?.length" class="text-sm text-muted">
          No clients assigned.
        </div>

        <div v-for="client in clients" :key="client.id" class="flex items-center justify-between py-3 border-b border-default last:border-0">
          <div>
            <NuxtLink :to="`/agency/clients/${client.client_id}`" class="text-sm font-medium hover:underline">
              {{ client.client_name }}
            </NuxtLink>
            <UBadge :color="roleBadgeColor(client.role)" :label="roleLabel(client.role)" size="xs" variant="subtle" class="ml-2" />
          </div>
          <UButton
            v-if="canManage"
            icon="i-lucide-x"
            size="xs"
            variant="ghost"
            color="error"
            @click="removeAssignment(client.client_id, client.client_name)"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Add slideover trigger to team list page**

In `app/pages/agency/team.vue`, add state for the slideover and wire it to row clicks:

```typescript
const selectedMember = ref<{ id: string; name: string } | null>(null)
const showClientBook = ref(false)

function openClientBook(member: { id: string; name: string }) {
  selectedMember.value = member
  showClientBook.value = true
}
```

In the template, add the slideover and a "Clients" action on each team member row:

```vue
<MemberClientsSlideover
  v-if="selectedMember"
  v-model:open="showClientBook"
  :member-id="selectedMember.id"
  :member-name="selectedMember.name"
/>
```

Add a "View Clients" button or clickable icon in each team member row that calls `openClientBook(member)`.

- [ ] **Step 3: Commit**

```bash
git add app/components/team/MemberClientsSlideover.vue app/pages/agency/team.vue
git commit -m "feat: Client Book slideover on team list page"
```

---

## Task 9: Final Integration Test

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: All existing tests pass, new clientScoping tests pass.

- [ ] **Step 2: Manual smoke test checklist**

Test as **finance role** (owner/admin):
- [ ] `/agency/billing` shows both Invoices and EOM tabs
- [ ] All invoices visible (no filtering)
- [ ] Can create, send, delete invoices for any client
- [ ] Client detail page shows Account Team card
- [ ] Can add/remove team member assignments

Test as **account_manager role**:
- [ ] Nav shows "Invoices" link (not full Finance section)
- [ ] `/agency/billing` shows Invoices tab only (no EOM)
- [ ] Only invoices for assigned clients are visible
- [ ] Can create draft invoices for assigned clients only
- [ ] Cannot send or approve invoices
- [ ] Can delete only own draft invoices
- [ ] Cannot access `/agency/expenses`, `/agency/financial-health`, etc.
- [ ] Client dropdown only shows assigned clients

- [ ] **Step 3: Build check**

```bash
NODE_OPTIONS='--max-old-space-size=8192' npx nuxi build
```

Expected: Build succeeds with no new errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: client-scoped invoice access for account managers

- client_team_assignments table for client-to-member mapping
- INVOICE_OWN_CLIENTS permission group
- Invoice endpoints scoped by client assignment
- Account Team card on client detail page
- Client Book slideover on team list page
- Conditional billing UI (draft-only for AMs, EOM hidden)
- role-invoice middleware for billing page access"
```
