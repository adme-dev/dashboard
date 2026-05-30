# AI-Assisted Xero → Client Reconciliation (Phase 1) — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Author:** Paul + Claude

## Problem

`agency_clients` (57 rows) is a static import from 2026-03-02 and has drifted from
Xero. Of the ~393 active Xero *customers*, ~48 currently-invoiced ones are not
represented by any client (e.g. Brighton, Geely, McRae, Knox, Harmony — real
revenue, invisible to the GA4 dropdown, analytics, and anything reading
`agency_clients`). Manually reconciling this is tedious, and naïve name matching
fails on two structural facts: Xero bills **per-brand** (`Northern KIA`,
`Brighton Nissan`) while clients are **per-group** (`Northern Motor Group`); and
some names are acronyms (`GWS Kia` = Garry and Warren Smith).

## Goal

A reusable, role-gated **`/agency/clients/reconcile`** page that surfaces active
Xero customers not represented in `agency_clients`, uses **deterministic + AI**
grouping to propose consolidation into group-level clients (or attachment to an
existing client), and lets staff **review → create/link** with a confirm step.

This is **Phase 1** of a larger "Xero as the client source of truth" direction.
Phase 2 (live auto-match on ad ingest) is out of scope and reuses Phase 1's
primitives.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Xero's role | **Auto-populates `agency_clients`** (Option 1); `agency_clients` stays canonical, Xero is the feeder |
| Matching | **Hybrid** — deterministic location-prefix first, **AI (Groq) on the residual** it can't resolve |
| Writes | **AI never writes.** Only a human-triggered, role-gated `apply` creates/links |
| Granularity | **Group-level** client creation (consistent with the existing 57), AI proposes a name |
| Delivery | **Reusable in-app page**, not a one-off script |

## Existing patterns this builds on

- **Xero customer cache**: `xero_contacts_cache` (migration via `xeroCustomerSync.ts`)
  — columns `tenant_id, contact_id, name, status, is_customer, is_supplier,
  receivable_outstanding_cents, …`. Synced by the existing customer sync.
  Indexes: `idx_xcc_customer (tenant_id, name) WHERE is_customer`.
- **Clients**: `agency_clients (id, name, is_active, xero_contact_id, billing_type,
  payment_terms, …)`. Created via `POST /api/agency/clients` (manual) and a thin
  Xero exact-name matcher `xero-match.post.ts`.
- **AI**: `server/utils/groqClient.ts` — `getGroqClient()` (default export),
  `GROQ_MODELS.LLAMA_70B` (`llama-3.3-70b-versatile`) / `LLAMA_8B`,
  `generateGroqInsight()`. JSON-capable chat completions.
- **Deterministic matching precedent**: `app/utils/ga4PropertyMatch.ts`
  (location-key whole-word prefix). The reconciliation matcher mirrors its
  approach but lives server-side and matches Xero names → existing clients.
- **Auth/RBAC**: `requireAuth`, `requireRole(event, ['admin','owner'])`.
- **Migrations**: `NNN-kebab.sql`; highest is `121-ga4-funnel.sql`. Next = `122`.

## Architecture

### 1. Data model — migration `122-client-xero-contacts.sql`

The existing `client_xero_connections` table holds per-client Xero OAuth tokens
(and is empty) — not a contact mapping. A new table records which Xero billing
entities belong to each group client. This is the durable artifact for
reconciliation and Phase 2.

```sql
CREATE TABLE IF NOT EXISTS client_xero_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  tenant_id       TEXT NOT NULL,
  xero_contact_id TEXT NOT NULL,
  xero_name       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, xero_contact_id)   -- one Xero contact maps to one client
);
CREATE INDEX IF NOT EXISTS idx_cxcontacts_client ON client_xero_contacts(client_id);
```

### 2. Deterministic matcher — `server/utils/xeroReconcile.ts` (pure + tested)

```ts
export interface XeroCustomer { contactId: string; name: string; tenantId: string; receivableCents: number }
export interface ClientRef { id: string; name: string }
export interface ReconcileCandidate { contactId: string; name: string; tenantId: string; receivableCents: number; matchedClientId: string | null }

/** locationKey(name): lowercase, strip trailing " motor group", else full name. */
export function locationKey(name: string): string

/** For each active Xero customer not already linked, attach the existing client it
 *  prefix-matches (whole-word), or null. Returns candidates needing review. */
export function buildReconcileCandidates(
  customers: XeroCustomer[],
  clients: ClientRef[],
  linkedContactIds: Set<string>
): ReconcileCandidate[]
```

`matchedClientId !== null` → confidently belongs to an existing client (offer to
link). `null` → genuinely unrepresented → goes to the AI pass.

### 3. AI grouping — `server/utils/xeroReconcileAI.ts`

```ts
export interface AiGroupingItem {
  contactId: string
  xeroName: string
  decision: 'existing' | 'new_group'
  clientId?: string            // when decision === 'existing'
  proposedGroupName?: string   // when decision === 'new_group'
  confidence: number           // 0..1
  reason: string
}
/** Calls Groq LLAMA_70B with the existing client names + unresolved candidates;
 *  returns a validated grouping proposal. Throws on invalid/unparseable output. */
export async function aiGroupCandidates(
  candidates: { contactId: string; name: string }[],
  clients: ClientRef[]
): Promise<AiGroupingItem[]>
```

- Prompt grounds the model: *Australian car dealer groups; brands (KIA, MG, GWM,
  Nissan, Isuzu, …) are sub-brands of a dealer group identified by location or
  owner; group by location/owner; watch acronyms (GWS = Garry and Warren Smith).*
  Supplies the 57 existing client names and the candidate names. Requests strict
  JSON.
- **Output validated with Zod**; any `clientId` not in the supplied set is
  rejected (re-mapped to `new_group` or flagged). A pure exported
  `parseAiGrouping(raw, validClientIds)` does validation and is unit-tested with
  fixtures (no live AI call in tests).

### 4. Endpoints

- `GET /api/agency/clients/reconcile/candidates` — `requireAuth`. Loads active
  Xero customers (`is_customer AND status='ACTIVE'`) from `xero_contacts_cache`,
  the client list, and existing `client_xero_contacts` links; runs
  `buildReconcileCandidates`. Returns `{ candidates, lastSyncedAt }` (candidates
  split into `prefixMatched` and `unresolved`).
- `POST /api/agency/clients/reconcile/suggest` — `requireAuth`. Body: the
  unresolved candidates. Runs `aiGroupCandidates`. Returns the proposal. On AI
  failure returns `{ ok: false, error }` so the page degrades to manual grouping.
- `POST /api/agency/clients/reconcile/apply` — **`requireRole(['admin','owner'])`**.
  Body: approved decisions `[{ contactId, tenantId, xeroName, target: {type:'existing', clientId} | {type:'new', clientName} }]`.
  For each: resolve/create the `agency_clients` row (create only if no active
  client with that name exists — else link), then upsert `client_xero_contacts`.
  Wrapped in a transaction. Returns `{ created, linked, skipped }`.

### 5. Page — `app/pages/agency/clients/reconcile.vue`

`definePageMeta({ layout: 'agency', middleware: ['role-media'] })` (page is
viewable by media+; the **apply endpoint** enforces admin/owner — the "Create"
button is hidden/disabled for non-admins client-side and hard-gated server-side).

- Loads `/candidates` on mount. Shows the unresolved count + `lastSyncedAt`.
- **"Generate AI grouping"** button → `/suggest` → renders proposed groups:
  "Attach to existing" rows and "New group" cards, each **editable** (USelectMenu
  to retarget an existing client, UInput to rename a new group, checkbox to
  exclude an item). Shows AI confidence + reason per item.
- **"Create approved"** → `/apply` with the edited decisions → toast
  `"N clients created, M contacts linked"`. Refreshes.
- Entry point: a **"Reconcile with Xero"** `UButton` on `/agency/clients`.

### Error handling

- AI timeout / invalid JSON → `/suggest` returns `ok:false`; page keeps the
  deterministic grouping and lets the user assign manually. No crash.
- Apply is transactional and idempotent (UNIQUE on contact; name-existence check
  before create) — re-running can't duplicate clients or links.
- A candidate already linked between load and apply → the upsert's `ON CONFLICT`
  no-ops; counted as `skipped`.

### Testing (Vitest)

- `xeroReconcile.ts`: `locationKey`; `buildReconcileCandidates` (prefix match to
  existing client, exclusion of already-linked, null for unrepresented).
- `xeroReconcileAI.ts`: `parseAiGrouping` against fixture JSON — valid proposal
  parses; unknown `clientId` rejected; malformed JSON throws; `new_group` without
  a name flagged.

## Scope (YAGNI)

**In (Phase 1):** candidates listing (deterministic), AI grouping suggestion,
review/edit UI, role-gated apply (create group clients + link Xero contacts),
entry button, `client_xero_contacts` table.

**Out (Phase 2+):** live auto-match when ad accounts/campaigns sync; scheduled
Xero re-sync; rewriting `ad_account_client_map` / spend attribution to use
`client_xero_contacts`; per-brand client granularity; bulk un-link/merge tools.

## Open follow-ups (post-Phase-1)

- Phase 2: on ad-spend ingest, resolve the campaign/account to a client via
  `client_xero_contacts` (+ the hybrid matcher), queuing a new-client suggestion
  when unmatched.
- Wire `buildClientCondition` to also recognise `client_xero_contacts` so spend
  reconciles for group clients whose Xero brands differ from the client name.
