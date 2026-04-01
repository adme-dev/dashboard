# Client-Scoped Invoice Access for Account Managers

## Problem

Account managers need billing visibility for their clients — to create draft invoices, chase overdue payments, and answer client billing questions — without seeing company-wide financials (P&L, expenses, cashflow, margins, rate cards).

Currently, invoice access is all-or-nothing via the `FINANCE` permission group. There's no mechanism to scope data access to specific clients, and no client-to-account-manager assignment model exists in the database.

## Solution

Add a client team assignment model, a new `INVOICE_OWN_CLIENTS` permission group, and client-scoped filtering on invoice endpoints. Account managers see only invoices for their assigned clients. Finance roles continue to see everything.

---

## Data Model

### New table: `client_team_assignments`

```sql
CREATE TABLE client_team_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'primary_am',  -- 'primary_am', 'secondary_am', 'support'
  assigned_by UUID REFERENCES team_members(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(client_id, team_member_id)
);

CREATE INDEX idx_client_team_client ON client_team_assignments(client_id);
CREATE INDEX idx_client_team_member ON client_team_assignments(team_member_id);
```

**Roles:** `primary_am` (main point of contact), `secondary_am` (backup/junior), `support` (involved but not primary).

**No changes to `invoices` table.** Scoping is via JOIN at query time.

---

## Permission System

### New permission group

```typescript
// server/utils/permissions.ts + app/utils/permissions.ts
PERMISSIONS = {
  // ... existing unchanged
  INVOICE_OWN_CLIENTS: ['owner', 'admin', 'lead', 'project_manager', 'finance', 'accounts', 'account_manager'],
}
```

### Updated role mapping

```typescript
SYSTEM_ROLE_PERMISSIONS = {
  // ... existing unchanged except:
  account_manager: ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'],
}
```

### Access decision logic

All invoice endpoints use this pattern:

```
if hasRole(FINANCE)              -> full access, no client filtering
if hasRole(INVOICE_OWN_CLIENTS)  -> scoped to assigned clients via getAssignedClientIds()
else                             -> 403
```

Everyone with `FINANCE` inherently passes the `INVOICE_OWN_CLIENTS` check too — but without scoping.

---

## Server-Side Helper

### `getAssignedClientIds(event, userId): Promise<string[]>`

Location: `server/utils/clientScoping.ts`

- Queries `client_team_assignments` for the given user
- Cached in KV for 5 minutes (`client-assignments:{userId}`)
- Returns array of client UUIDs
- Called at the top of scoped endpoints

### `requireInvoiceAccess(event): { user, clientIds: string[] | 'all' }`

Combines auth check + scoping resolution:
- If `FINANCE` role: returns `clientIds: 'all'`
- If `INVOICE_OWN_CLIENTS`: returns `clientIds: [...]` from assignments
- Otherwise: throws 403

---

## API Endpoints

### Modified endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/agency/invoices` | Add `requireInvoiceAccess`. If scoped, add `WHERE client_id = ANY($N)`. Add `created_by` to SELECT for UI draft-edit checks. |
| `POST /api/agency/invoices` | If scoped, validate `client_id` is in assigned list. Force `status = 'draft'`. |
| `POST /api/agency/invoices/generate` | If scoped, validate `client_id` is in assigned list. Force `status = 'draft'`. (Generate from time entries flow.) |
| `GET /api/agency/invoices/[id]` | If scoped, verify invoice's `client_id` is in assigned list. 403 if not. |
| `DELETE /api/agency/invoices/[id]` | If scoped, only allow deleting own draft invoices (check `created_by`). |
| `GET /api/agency/clients` | If user has `INVOICE_OWN_CLIENTS` but not `CLIENTS`, filter to assigned clients. |
| `GET /api/agency/projects` | If scoped, filter project dropdown to projects belonging to assigned clients. |

### New endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/agency/clients/[id]/team` | GET | `requireRole(CLIENTS)` | List assigned team members |
| `/api/agency/clients/[id]/team` | POST | `requireRole(MANAGEMENT)` | Add assignment. Body: `{ teamMemberId, role }` |
| `/api/agency/clients/[id]/team/[memberId]` | DELETE | `requireRole(MANAGEMENT)` | Remove assignment |
| `/api/agency/team-members/[id]/clients` | GET | `requireRole(MANAGEMENT)` or self | List assigned clients for a member |

---

## Middleware

### New: `app/middleware/role-invoice.ts`

```typescript
export default defineNuxtRouteMiddleware(async (to) => {
  const { user, hasRole } = useAuth()
  if (!user.value) {
    return navigateTo({ path: '/auth/login', query: { redirect: to.fullPath } })
  }
  if (!hasRole(PERMISSIONS.INVOICE_OWN_CLIENTS)) {
    return navigateTo({ path: '/agency', query: { error: 'no-invoice-access' } })
  }
})
```

Applied to billing/invoice pages instead of `role-finance` for pages AMs should access.

---

## UI Changes

### Client detail page: "Account Team" section

- Card showing assigned team members
- Each row: avatar, name, role badge (`Primary AM`, `Secondary AM`, `Support`)
- Add: `USelectMenu` to pick team member + role dropdown
- Remove: dropdown action on each row
- Add/remove restricted to `MANAGEMENT` roles

### Team member "Client Book" (USlideover from team list page)

No team member detail page exists — use a `USlideover` triggered from the team list page (`/agency/team`).

- Opens on clicking a team member row
- Shows assigned clients table with role badges
- Client count stat
- Add/remove assignment actions (management roles only)
- Links to client detail pages

### Billing page: conditional behavior

**Finance roles (`canAccessFinance`):**
- Both "Invoices" and "EOM" tabs visible
- No client filtering applied
- Full invoice actions (create, edit, send, delete, approve)

**Account managers (`INVOICE_OWN_CLIENTS` only):**
- "Invoices" tab only — EOM tab hidden
- Client dropdown pre-filtered to assigned clients
- "New Invoice" → client picker scoped, status locked to `draft`
- Invoice actions: create draft, edit own drafts only
- Cannot: send, approve, delete sent invoices
- Read-only view of non-draft invoices (status, amounts, payment history)

### Navigation

- Account managers see "Invoices" link under existing "Work Management" or a new "My Clients" section
- Finance nav section remains gated to `FINANCE` roles
- No new pages needed — billing page adapts based on role

---

## Page Access Matrix

| Page | Finance | Account Manager | Others |
|------|---------|----------------|--------|
| `/agency/billing` (invoices tab) | Full | Scoped, draft-only create | No |
| `/agency/billing` (EOM tab) | Full | Hidden | No |
| `/agency/expenses` | Full | No | No |
| `/agency/financial-health` | Full | No | No |
| `/agency/profitability` | Full | No | No |
| `/agency/rate-cards` | Full | No | No |
| `/agency/invoices/[id]` | Full | Scoped (own clients only) | No |

---

## Implementation Phases

### Phase 1: Foundation
- Migration: `client_team_assignments` table
- `clientScoping.ts` utility (`getAssignedClientIds`, `requireInvoiceAccess`)
- Permission constants update (`INVOICE_OWN_CLIENTS`, role mapping)
- Client team assignment API (CRUD endpoints)

### Phase 2: Invoice Scoping
- Modify `GET /api/agency/invoices` with client scoping + add `created_by` to SELECT
- Modify `POST /api/agency/invoices` with client validation + draft lock
- Modify `POST /api/agency/invoices/generate` with client validation + draft lock
- Modify `GET /api/agency/invoices/[id]` with ownership check
- Modify `DELETE /api/agency/invoices/[id]` with draft-only restriction (check `created_by`)
- Scope project dropdown: filter `/api/agency/projects` to assigned clients' projects

### Phase 3: UI — Assignment Management
- Client detail page "Account Team" card (CRUD)
- Team list page: USlideover with "Client Book" for each member
- Assignment CRUD with role selection (`primary_am`, `secondary_am`, `support`)

### Phase 4: UI — Scoped Billing
- `role-invoice.ts` middleware
- Billing page conditional tabs (hide EOM for AMs) and auto-filtering
- Scoped client + project dropdowns in create/generate modals
- Draft-only create for AMs, edit restricted to own drafts (`created_by` check)
- Action button visibility based on role (hide send/approve/delete-sent for AMs)
- Nav: add "Invoices" link visible to `INVOICE_OWN_CLIENTS` roles

---

## Known Codebase Nuances

- **No team member detail page exists** — using USlideover from team list instead of a new page
- **`created_by` is tracked on invoices** but not returned in the list query — Phase 2 adds it to SELECT
- **Invoice "generate from time entries"** is a separate endpoint from regular create — both need scoping
- **EOM `client_name` is text, not FK** — data integrity issue, not blocking (EOM stays finance-only)
- **Projects have `project_manager_id`** — project dropdown in invoice create modal needs client scoping too
- **Briefs have `assigned_to`** — separate from client-level assignment, no conflict

## Out of Scope

- EOM engine scoping (stays finance-only)
- Xero invoice scoping (live API queries stay finance-only)
- Rate card / profitability access for AMs
- Client-scoped expense viewing
- Notification system for invoice status changes (future enhancement)
- Approval workflow for draft invoices (future — currently finance just edits the draft)
- Team member detail page (using slideover pattern instead)
- EOM `client_name` → `client_id` FK migration (separate tech debt task)
