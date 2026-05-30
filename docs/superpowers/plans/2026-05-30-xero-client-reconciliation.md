# Xero → Client Reconciliation (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A reusable `/agency/clients/reconcile` page that finds active Xero customers not represented in `agency_clients`, groups them with a deterministic + AI hybrid, and lets staff review then create/link group-level clients (human-confirmed, role-gated).

**Architecture:** A pure deterministic matcher (location-prefix) resolves the easy cases against existing clients; a Groq LLAMA_70B pass groups the residual (handling acronyms + brand→group clustering) returning validated JSON. Three endpoints (candidates → suggest → apply) back a review page. Approved decisions create group clients and record their Xero members in a new `client_xero_contacts` mapping table. AI never writes — only the role-gated `apply` does.

**Tech Stack:** Nitro/h3, Neon Postgres (`server/utils/db.ts`), Zod, Groq (`server/utils/groqClient.ts`), Nuxt 4 / Nuxt UI v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-30-xero-client-reconciliation-design.md`

---

## File structure

- **Create** `server/database/migrations/122-client-xero-contacts.sql` — mapping table.
- **Create** `server/utils/xeroReconcile.ts` + test — deterministic matcher (pure).
- **Create** `server/utils/xeroReconcileAI.ts` + test — Groq call + pure `parseAiGrouping`.
- **Create** `server/api/agency/clients/reconcile/candidates.get.ts` — deterministic pass.
- **Create** `server/api/agency/clients/reconcile/suggest.post.ts` — AI grouping.
- **Create** `server/api/agency/clients/reconcile/apply.post.ts` — role-gated create/link.
- **Create** `app/pages/agency/clients/reconcile.vue` — review UI.
- **Modify** `app/pages/agency/clients/index.vue` — add a "Reconcile with Xero" button.

---

## Task 1: Migration — client_xero_contacts

**Files:**
- Create: `server/database/migrations/122-client-xero-contacts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 122-client-xero-contacts.sql
-- Maps Xero billing contacts (per-brand) to group-level agency_clients.
-- The durable artifact for Xero↔client reconciliation; reused by Phase 2.
CREATE TABLE IF NOT EXISTS client_xero_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL,
  xero_contact_id TEXT NOT NULL,
  xero_name       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, xero_contact_id)
);
CREATE INDEX IF NOT EXISTS idx_cxcontacts_client ON client_xero_contacts(client_id);
```

- [ ] **Step 2: Run it**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/122-client-xero-contacts.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX`, no errors.

- [ ] **Step 3: Verify**

```bash
psql "$DATABASE_URL" -c "\d client_xero_contacts"
```
Expected: the table prints with the UNIQUE(tenant_id, xero_contact_id) constraint.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/122-client-xero-contacts.sql
git commit -m "feat(reconcile): migration 122 — client_xero_contacts mapping table"
```

---

## Task 2: Deterministic matcher (TDD)

**Files:**
- Create: `server/utils/xeroReconcile.ts`
- Test: `test/utils/xeroReconcile.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/xeroReconcile.test.ts
import { describe, it, expect } from 'vitest'
import { locationKey, buildReconcileCandidates } from '~~/server/utils/xeroReconcile'

const CLIENTS = [
  { id: 'c-northern', name: 'Northern Motor Group' },
  { id: 'c-frankston', name: 'Frankston Motor Group' }
]

function cust(contactId: string, name: string) {
  return { contactId, name, tenantId: 't1', receivableCents: 1000 }
}

describe('locationKey', () => {
  it('strips trailing " Motor Group"', () => {
    expect(locationKey('Northern Motor Group')).toBe('northern')
  })
  it('keeps a name without the suffix', () => {
    expect(locationKey('Harmony New Energy')).toBe('harmony new energy')
  })
})

describe('buildReconcileCandidates', () => {
  it('attaches the existing client a Xero brand prefix-matches', () => {
    const out = buildReconcileCandidates([cust('x1', 'Northern KIA')], CLIENTS, new Set())
    expect(out[0].matchedClientId).toBe('c-northern')
  })
  it('returns null match for an unrepresented customer', () => {
    const out = buildReconcileCandidates([cust('x2', 'Brighton GWM')], CLIENTS, new Set())
    expect(out[0].matchedClientId).toBeNull()
  })
  it('excludes already-linked contacts', () => {
    const out = buildReconcileCandidates([cust('x3', 'Frankston Nissan')], CLIENTS, new Set(['x3']))
    expect(out).toHaveLength(0)
  })
  it('preserves receivable + tenant on the candidate', () => {
    const out = buildReconcileCandidates([cust('x4', 'Brighton Nissan')], CLIENTS, new Set())
    expect(out[0]).toMatchObject({ contactId: 'x4', tenantId: 't1', receivableCents: 1000, matchedClientId: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/xeroReconcile.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/xeroReconcile`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/xeroReconcile.ts
/**
 * Deterministic Xero-customer → existing-client matcher (location prefix).
 * Pure + framework-free for unit testing. The AI pass handles whatever this
 * leaves with matchedClientId === null.
 */

export interface XeroCustomer { contactId: string; name: string; tenantId: string; receivableCents: number }
export interface ClientRef { id: string; name: string }
export interface ReconcileCandidate {
  contactId: string; name: string; tenantId: string; receivableCents: number
  matchedClientId: string | null
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Client location key: name minus trailing " motor group", else full name. */
export function locationKey(name: string): string {
  const n = normalize(name)
  const stripped = n.replace(/\s+motor group$/, '').trim()
  return stripped || n
}

function isWholeWordPrefix(key: string, name: string): boolean {
  if (!key) return false
  if (name === key) return true
  return name.startsWith(key + ' ')
}

export function buildReconcileCandidates(
  customers: XeroCustomer[],
  clients: ClientRef[],
  linkedContactIds: Set<string>
): ReconcileCandidate[] {
  const keyed = clients.map((c) => ({ client: c, key: locationKey(c.name) }))
  const out: ReconcileCandidate[] = []
  for (const cust of customers) {
    if (linkedContactIds.has(cust.contactId)) continue
    const lname = normalize(cust.name)
    const matches = keyed.filter((k) => isWholeWordPrefix(k.key, lname))
    let matchedClientId: string | null = null
    if (matches.length > 0) {
      const maxLen = Math.max(...matches.map((m) => m.key.length))
      const longest = matches.filter((m) => m.key.length === maxLen)
      if (longest.length === 1) matchedClientId = longest[0].client.id
    }
    out.push({
      contactId: cust.contactId, name: cust.name, tenantId: cust.tenantId,
      receivableCents: cust.receivableCents, matchedClientId
    })
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/xeroReconcile.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add server/utils/xeroReconcile.ts test/utils/xeroReconcile.test.ts
git commit -m "feat(reconcile): deterministic Xero→client location matcher"
```

---

## Task 3: AI grouping util (TDD on the parser)

**Files:**
- Create: `server/utils/xeroReconcileAI.ts`
- Test: `test/utils/xeroReconcileAI.test.ts`

The Groq call itself isn't unit-tested (live AI); the **pure `parseAiGrouping`** is.

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/xeroReconcileAI.test.ts
import { describe, it, expect } from 'vitest'
import { parseAiGrouping } from '~~/server/utils/xeroReconcileAI'

const valid = new Set(['c-gws'])

describe('parseAiGrouping', () => {
  it('keeps an existing decision with a valid clientId', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x1', xeroName: 'GWS Kia', decision: 'existing', clientId: 'c-gws', confidence: 0.9, reason: 'GWS = Garry and Warren Smith' }
    ]})
    const out = parseAiGrouping(raw, valid)
    expect(out[0]).toMatchObject({ contactId: 'x1', decision: 'existing', clientId: 'c-gws' })
  })

  it('demotes an existing decision with an unknown clientId to new_group, confidence 0', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x2', xeroName: 'Geely Ringwood', decision: 'existing', clientId: 'c-nope', confidence: 0.8 }
    ]})
    const out = parseAiGrouping(raw, valid)
    expect(out[0].decision).toBe('new_group')
    expect(out[0].confidence).toBe(0)
    expect(out[0].proposedGroupName).toBe('Geely Ringwood')
  })

  it('defaults a new_group without a name to the xero name', () => {
    const raw = JSON.stringify({ items: [
      { contactId: 'x3', xeroName: 'Harmony New Energy', decision: 'new_group', confidence: 0.7 }
    ]})
    expect(parseAiGrouping(raw, valid)[0].proposedGroupName).toBe('Harmony New Energy')
  })

  it('strips ```json fences before parsing', () => {
    const raw = '```json\n{"items":[{"contactId":"x4","xeroName":"Knox GWM","decision":"new_group","confidence":0.6}]}\n```'
    expect(parseAiGrouping(raw, valid)).toHaveLength(1)
  })

  it('throws on unparseable output', () => {
    expect(() => parseAiGrouping('not json at all', valid)).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/xeroReconcileAI.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/xeroReconcileAI`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/xeroReconcileAI.ts
/**
 * AI grouping of unrepresented Xero customers into existing or new group
 * clients, via Groq. parseAiGrouping is pure + validated (unit-tested);
 * aiGroupCandidates wraps the live Groq call.
 */
import { getGroqClient, GROQ_MODELS } from './groqClient'
import type { ClientRef } from './xeroReconcile'

export interface AiGroupingItem {
  contactId: string
  xeroName: string
  decision: 'existing' | 'new_group'
  clientId?: string
  proposedGroupName?: string
  confidence: number
  reason: string
}

/** Parse + validate the model's JSON. Invalid existing-client refs are demoted
 *  to new_group (flagged, confidence 0). Throws if the payload is unparseable. */
export function parseAiGrouping(raw: string, validClientIds: Set<string>): AiGroupingItem[] {
  const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim()
  let obj: any
  try { obj = JSON.parse(cleaned) } catch { throw new Error('AI returned unparseable JSON') }
  const items = Array.isArray(obj) ? obj : obj.items
  if (!Array.isArray(items)) throw new Error('AI response missing items array')

  return items
    .map((it: any): AiGroupingItem | null => {
      const contactId = String(it?.contactId ?? '')
      if (!contactId) return null
      const xeroName = String(it?.xeroName ?? '')
      const confidence = typeof it?.confidence === 'number' ? Math.max(0, Math.min(1, it.confidence)) : 0.5
      const reason = String(it?.reason ?? '')

      if (it?.decision === 'existing') {
        const clientId = String(it?.clientId ?? '')
        if (clientId && validClientIds.has(clientId)) {
          return { contactId, xeroName, decision: 'existing', clientId, confidence, reason }
        }
        // Unknown client reference → demote to new_group, flagged.
        return {
          contactId, xeroName, decision: 'new_group',
          proposedGroupName: it?.proposedGroupName ? String(it.proposedGroupName) : xeroName,
          confidence: 0, reason: reason || 'AI referenced an unknown client; needs review'
        }
      }
      return {
        contactId, xeroName, decision: 'new_group',
        proposedGroupName: it?.proposedGroupName ? String(it.proposedGroupName) : xeroName,
        confidence, reason
      }
    })
    .filter((x): x is AiGroupingItem => x !== null)
}

const SYSTEM_PROMPT = `You are an entity-resolution assistant for an Australian car-dealership marketing agency. ` +
  `Brands such as KIA, MG, GWM, Haval, Nissan, Isuzu, Subaru, Renault, LDV, Ssangyong/KGM are sub-brands of a dealer ` +
  `GROUP identified by a location (e.g. "Northern", "Brighton") or an owner name. Acronyms occur (e.g. GWS = Garry and ` +
  `Warren Smith). Respond ONLY with valid JSON.`

export async function aiGroupCandidates(
  candidates: { contactId: string; name: string }[],
  clients: ClientRef[]
): Promise<AiGroupingItem[]> {
  const validIds = new Set(clients.map((c) => c.id))
  const user = [
    'Existing group-level clients:',
    ...clients.map((c) => `- ${c.name} [${c.id}]`),
    '',
    'Unmatched Xero customers to assign:',
    ...candidates.map((c) => `- ${c.name} [${c.contactId}]`),
    '',
    'For EACH Xero customer return an item. Use an existing client when the customer clearly belongs to one ' +
    '(decision:"existing", clientId set to its [id]); otherwise propose a new group (decision:"new_group", ' +
    'proposedGroupName as a clean group name). Respond as JSON: ' +
    '{"items":[{"contactId","xeroName","decision","clientId","proposedGroupName","confidence","reason"}]}.'
  ].join('\n')

  const groq = getGroqClient()
  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user }
    ],
    model: GROQ_MODELS.LLAMA_70B,
    temperature: 0.1,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
    stream: false
  })
  const content = completion.choices[0]?.message?.content || ''
  return parseAiGrouping(content, validIds)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/xeroReconcileAI.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/xeroReconcileAI.ts test/utils/xeroReconcileAI.test.ts
git commit -m "feat(reconcile): AI grouping (Groq) + validated parser"
```

---

## Task 4: Candidates endpoint

**Files:**
- Create: `server/api/agency/clients/reconcile/candidates.get.ts`

- [ ] **Step 1: Write the handler**

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne } from '~~/server/utils/db'
import { buildReconcileCandidates } from '~~/server/utils/xeroReconcile'

/**
 * GET /api/agency/clients/reconcile/candidates
 * Active Xero customers not yet represented in agency_clients, with a
 * deterministic prefix-match to an existing client where possible.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const customers = await queryRows<{ contact_id: string; name: string; tenant_id: string; receivable_outstanding_cents: string }>(
    `SELECT contact_id, name, tenant_id, receivable_outstanding_cents
     FROM xero_contacts_cache
     WHERE is_customer AND status = 'ACTIVE'`
  )
  const clients = await queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE is_active = true ORDER BY name`
  )
  const linked = await queryRows<{ xero_contact_id: string }>(`SELECT xero_contact_id FROM client_xero_contacts`)
  const linkedSet = new Set(linked.map((l) => l.xero_contact_id))

  const candidates = buildReconcileCandidates(
    customers.map((c) => ({
      contactId: c.contact_id, name: c.name, tenantId: c.tenant_id,
      receivableCents: Number(c.receivable_outstanding_cents) || 0
    })),
    clients,
    linkedSet
  )

  const lastSynced = await queryOne<{ last: string | null }>(`SELECT MAX(synced_at) AS last FROM xero_contacts_cache`)

  return {
    prefixMatched: candidates.filter((c) => c.matchedClientId),
    unresolved: candidates.filter((c) => !c.matchedClientId),
    clients,
    lastSyncedAt: lastSynced?.last ?? null
  }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec vitest run test/utils/xeroReconcile.test.ts` (imports intact) and confirm the file imports only real exports:
`grep -n "buildReconcileCandidates" server/utils/xeroReconcile.ts`
Expected: tests green; the export exists.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/clients/reconcile/candidates.get.ts
git commit -m "feat(reconcile): candidates endpoint (deterministic pass)"
```

---

## Task 5: Suggest endpoint (AI)

**Files:**
- Create: `server/api/agency/clients/reconcile/suggest.post.ts`

- [ ] **Step 1: Write the handler**

```ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { aiGroupCandidates } from '~~/server/utils/xeroReconcileAI'

const schema = z.object({
  candidates: z.array(z.object({ contactId: z.string().min(1), name: z.string().min(1) })).min(1)
})

/**
 * POST /api/agency/clients/reconcile/suggest
 * Runs the Groq grouping over the supplied unresolved candidates. Returns
 * { ok:false, error } on AI failure so the page can fall back to manual grouping.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = schema.parse(await readBody(event))
  const clients = await queryRows<{ id: string; name: string }>(
    `SELECT id, name FROM agency_clients WHERE is_active = true ORDER BY name`
  )
  try {
    const grouping = await aiGroupCandidates(body.candidates, clients)
    return { ok: true, grouping }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'AI grouping failed' }
  }
})
```

- [ ] **Step 2: Verify it builds**

Run: `grep -n "aiGroupCandidates" server/utils/xeroReconcileAI.ts && pnpm exec vitest run test/utils/xeroReconcileAI.test.ts`
Expected: export present; tests green.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/clients/reconcile/suggest.post.ts
git commit -m "feat(reconcile): AI suggest endpoint with graceful fallback"
```

---

## Task 6: Apply endpoint (role-gated create/link)

**Files:**
- Create: `server/api/agency/clients/reconcile/apply.post.ts`

**Note:** inside `transaction()` use the passed `client.query()` directly (NOT `queryOne`/`execute`, which use separate connections).

- [ ] **Step 1: Write the handler**

```ts
import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'

const schema = z.object({
  decisions: z.array(z.object({
    contactId: z.string().min(1),
    tenantId: z.string().min(1),
    xeroName: z.string().min(1),
    target: z.discriminatedUnion('type', [
      z.object({ type: z.literal('existing'), clientId: z.string().uuid() }),
      z.object({ type: z.literal('new'), clientName: z.string().min(1) })
    ])
  })).min(1)
})

/**
 * POST /api/agency/clients/reconcile/apply
 * Creates/links group clients from approved decisions. Idempotent:
 * client_xero_contacts has UNIQUE(tenant_id, xero_contact_id); new clients are
 * only created when no active client of that name exists. admin/owner only.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])
  const body = schema.parse(await readBody(event))

  let created = 0, linked = 0, skipped = 0

  await transaction(async (client) => {
    const nameToId = new Map<string, string>() // group name (lower) → client_id, this run

    for (const d of body.decisions) {
      let clientId: string

      if (d.target.type === 'existing') {
        clientId = d.target.clientId
      } else {
        const key = d.target.clientName.toLowerCase().trim()
        if (nameToId.has(key)) {
          clientId = nameToId.get(key)!
        } else {
          const existing = await client.query(
            `SELECT id FROM agency_clients WHERE lower(name) = lower($1) AND is_active = true LIMIT 1`,
            [d.target.clientName]
          )
          if (existing.rows[0]) {
            clientId = existing.rows[0].id
          } else {
            const ins = await client.query(
              `INSERT INTO agency_clients (name, is_active) VALUES ($1, true) RETURNING id`,
              [d.target.clientName]
            )
            clientId = ins.rows[0].id
            created++
          }
          nameToId.set(key, clientId)
        }
      }

      const link = await client.query(
        `INSERT INTO client_xero_contacts (client_id, tenant_id, xero_contact_id, xero_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, xero_contact_id) DO NOTHING
         RETURNING id`,
        [clientId, d.tenantId, d.contactId, d.xeroName]
      )
      if (link.rows[0]) linked++
      else skipped++
    }
  })

  return { ok: true, created, linked, skipped }
})
```

- [ ] **Step 2: Verify it builds**

Run: `grep -n "export async function transaction\|export function transaction" server/utils/db.ts && grep -n "export async function requireRole" server/utils/auth.ts`
Expected: both exports present.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/clients/reconcile/apply.post.ts
git commit -m "feat(reconcile): role-gated apply — create group clients + link Xero contacts"
```

---

## Task 7: Reconcile page + entry button

**Files:**
- Create: `app/pages/agency/clients/reconcile.vue`
- Modify: `app/pages/agency/clients/index.vue` (add a header button)

- [ ] **Step 1: Create the page**

```vue
<!-- app/pages/agency/clients/reconcile.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

interface Candidate { contactId: string; name: string; tenantId: string; receivableCents: number; matchedClientId: string | null }
interface ClientRef { id: string; name: string }
interface GroupingItem {
  contactId: string; xeroName: string
  decision: 'existing' | 'new_group'
  clientId?: string; proposedGroupName?: string
  confidence: number; reason: string
}

const toast = useToast()
const loading = ref(true)
const suggesting = ref(false)
const applying = ref(false)
const unresolved = ref<Candidate[]>([])
const clients = ref<ClientRef[]>([])
const lastSyncedAt = ref<string | null>(null)
const grouping = ref<GroupingItem[]>([])

// Per-contact editable decision state. target null = excluded.
const tenantByContact = reactive<Record<string, string>>({})
const nameByContact = reactive<Record<string, string>>({})
const targetClient = reactive<Record<string, string>>({})   // contactId → existing clientId
const newGroupName = reactive<Record<string, string>>({})   // contactId → proposed name
const mode = reactive<Record<string, 'existing' | 'new' | 'skip'>>({}) // per contact

const clientOptions = computed(() => clients.value.map((c) => ({ label: c.name, value: c.id })))

async function load() {
  loading.value = true
  try {
    const res = await $fetch<{ unresolved: Candidate[]; clients: ClientRef[]; lastSyncedAt: string | null }>(
      '/api/agency/clients/reconcile/candidates'
    )
    unresolved.value = res.unresolved
    clients.value = res.clients
    lastSyncedAt.value = res.lastSyncedAt
    for (const c of res.unresolved) {
      tenantByContact[c.contactId] = c.tenantId
      nameByContact[c.contactId] = c.name
      mode[c.contactId] = 'skip'
    }
  } catch (err: any) {
    toast.add({ title: 'Failed to load candidates', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function suggest() {
  suggesting.value = true
  try {
    const res = await $fetch<{ ok: boolean; grouping?: GroupingItem[]; error?: string }>(
      '/api/agency/clients/reconcile/suggest',
      { method: 'POST', body: { candidates: unresolved.value.map((c) => ({ contactId: c.contactId, name: c.name })) } }
    )
    if (!res.ok || !res.grouping) {
      toast.add({ title: 'AI grouping unavailable', description: res.error || 'Assign manually below.', color: 'warning' })
      return
    }
    grouping.value = res.grouping
    for (const g of res.grouping) {
      if (g.decision === 'existing' && g.clientId) {
        mode[g.contactId] = 'existing'
        targetClient[g.contactId] = g.clientId
      } else {
        mode[g.contactId] = 'new'
        newGroupName[g.contactId] = g.proposedGroupName || g.xeroName
      }
    }
    toast.add({ title: 'AI grouping ready', description: 'Review and adjust, then create.', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'AI grouping failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    suggesting.value = false
  }
}

async function apply() {
  const decisions = unresolved.value
    .filter((c) => mode[c.contactId] !== 'skip')
    .map((c) => {
      const target = mode[c.contactId] === 'existing'
        ? { type: 'existing' as const, clientId: targetClient[c.contactId] }
        : { type: 'new' as const, clientName: (newGroupName[c.contactId] || c.name).trim() }
      return { contactId: c.contactId, tenantId: tenantByContact[c.contactId], xeroName: nameByContact[c.contactId], target }
    })
    .filter((d) => (d.target.type === 'existing' ? d.target.clientId : d.target.clientName))

  if (decisions.length === 0) {
    toast.add({ title: 'Nothing selected', description: 'Pick a target for at least one customer.', color: 'warning' })
    return
  }
  applying.value = true
  try {
    const res = await $fetch<{ created: number; linked: number; skipped: number }>(
      '/api/agency/clients/reconcile/apply', { method: 'POST', body: { decisions } }
    )
    toast.add({ title: 'Reconciled', description: `${res.created} clients created, ${res.linked} contacts linked.`, color: 'success' })
    await load()
    grouping.value = []
  } catch (err: any) {
    toast.add({ title: 'Apply failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    applying.value = false
  }
}

function fmtAud(cents: number) { return `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}` }

onMounted(load)
</script>

<template>
  <div class="flex-1 overflow-auto">
    <div class="p-6 max-w-5xl mx-auto space-y-6">
      <UButton to="/agency/clients" variant="ghost" icon="i-lucide-arrow-left" size="sm" class="-ml-2">Back to clients</UButton>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-semibold">Reconcile with Xero</h1>
          <p class="text-sm text-muted">
            Active Xero customers not yet in your client list.
            <span v-if="lastSyncedAt">Xero synced {{ new Date(lastSyncedAt).toLocaleString() }}.</span>
          </p>
        </div>
        <div class="flex gap-2">
          <UButton icon="i-lucide-sparkles" :loading="suggesting" :disabled="!unresolved.length" @click="suggest">Generate AI grouping</UButton>
          <UButton color="primary" icon="i-lucide-check" :loading="applying" :disabled="!unresolved.length" @click="apply">Create approved</UButton>
        </div>
      </div>

      <div v-if="loading" class="py-10 text-center text-muted">Loading…</div>
      <div v-else-if="!unresolved.length" class="py-10 text-center text-muted">Everything reconciles — no unrepresented Xero customers. 🎉</div>

      <div v-else class="space-y-2">
        <div
          v-for="c in unresolved" :key="c.contactId"
          class="flex items-center gap-3 py-2 border-b border-default last:border-0"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ c.name }}</p>
            <p class="text-xs text-muted">{{ fmtAud(c.receivableCents) }} outstanding</p>
          </div>
          <USelect
            v-model="mode[c.contactId]"
            :items="[{ label: 'Skip', value: 'skip' }, { label: 'New group', value: 'new' }, { label: 'Existing client', value: 'existing' }]"
            class="w-36"
          />
          <USelectMenu
            v-if="mode[c.contactId] === 'existing'"
            v-model="targetClient[c.contactId]" :items="clientOptions" value-key="value"
            placeholder="Client…" class="w-56"
          />
          <UInput
            v-else-if="mode[c.contactId] === 'new'"
            v-model="newGroupName[c.contactId]" placeholder="New group name" class="w-56"
          />
          <span v-else class="w-56 text-xs text-muted">—</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add the entry button on the clients page**

In `app/pages/agency/clients/index.vue`, find the header button area (around line 176) and add, matching the existing `UButton` style there:

```vue
        <UButton to="/agency/clients/reconcile" variant="soft" icon="i-lucide-refresh-cw">
          Reconcile with Xero
        </UButton>
```

- [ ] **Step 3: Verify**

Run: `grep -n "reconcile/candidates\|reconcile/suggest\|reconcile/apply" app/pages/agency/clients/reconcile.vue` → expect all three endpoints called.
Run: `grep -n "to=\"/agency/clients/reconcile\"" app/pages/agency/clients/index.vue` → expect the button.
(Skip full nuxi typecheck — slow, ~60 pre-existing errors.)

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/clients/reconcile.vue app/pages/agency/clients/index.vue
git commit -m "feat(reconcile): review page + Reconcile with Xero entry button"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the new unit tests**

Run: `pnpm exec vitest run test/utils/xeroReconcile.test.ts test/utils/xeroReconcileAI.test.ts`
Expected: all PASS (11 assertions across 2 files).

- [ ] **Step 2: Confirm route + integration points**

```bash
ls server/api/agency/clients/reconcile/   # candidates.get.ts, suggest.post.ts, apply.post.ts
psql "$DATABASE_URL" -c "\d client_xero_contacts" >/dev/null && echo "table OK"
grep -q "to=\"/agency/clients/reconcile\"" app/pages/agency/clients/index.vue && echo "entry button OK"
```

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "chore(reconcile): verification fixups" || echo "nothing to commit"
```

---

## Self-review notes (addressed during authoring)

- **Spec coverage:** migration/table (T1) ✓; deterministic matcher (T2) ✓; AI grouping + validated parser (T3) ✓; candidates/suggest/apply endpoints (T4/T5/T6) ✓ with apply `requireRole(['admin','owner'])` and graceful AI fallback in suggest ✓; review page + entry button (T7) ✓; group-level creation with name-existence check + idempotent `client_xero_contacts` upsert (T6) ✓; tests for matcher + parser (T2/T3/T8) ✓; AI-never-writes (only T6 apply writes) ✓.
- **Type consistency:** `XeroCustomer`/`ClientRef`/`ReconcileCandidate` (T2) reused by candidates endpoint (T4); `AiGroupingItem` (T3) reused by suggest (T5) and the page (T7); the apply `decisions[].target` discriminated union (T6) matches the page's constructed payload (T7). The page's `GroupingItem` shape mirrors `AiGroupingItem`.
- **Route safety:** `reconcile/` is a static segment under `clients/`, so it doesn't collide with `clients/[id].*`. The page `reconcile.vue` takes precedence over `[id].vue` (static > dynamic).
- **Transaction rule:** T6 uses `client.query()` inside `transaction()`, never `queryOne`/`execute` (separate connections) — per project convention.
- **Out of scope (Phase 2):** live ad-ingest auto-match; wiring `client_xero_contacts` into `buildClientCondition`; scheduled Xero re-sync.
