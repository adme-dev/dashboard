# PRD: XeroFlow Multi-Tenancy

## Product Vision

Transform XeroFlow from a single-agency internal tool into a multi-tenant SaaS platform where any digital marketing agency can sign up, provision their own workspace, and operate with complete data isolation.

**Strategy**: Database-per-tenant on Neon Serverless Postgres. One deployment, one codebase, many databases.

**Why this approach**:
- Minimal code changes (~15 files vs ~200+ for shared-schema)
- Physical data isolation (impossible to leak between tenants)
- Ships in ~2-3 months vs 6-9 for shared-schema
- Neon's serverless model means idle tenants cost near-zero
- Current code works as-is — queries don't need org_id filters
- Per-tenant backup/restore without surgical data extraction
- When you outgrow it (200+ tenants), you migrate with revenue to fund it

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Cloudflare Pages (single deploy)     │
│              app.xeroflow.com                     │
└───────────────────────┬─────────────────────────┘
                        │
           ┌────────────▼────────────┐
           │     Auth Middleware      │
           │  token → org → db route  │
           └────────────┬────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
│ Control Plane │ │  Tenant DB  │ │  Tenant DB  │
│  (Neon DB)    │ │  agency-A   │ │  agency-B   │
│               │ │             │ │             │
│ organizations │ │ boards      │ │ boards      │
│ org_members   │ │ tasks       │ │ tasks       │
│ billing       │ │ clients     │ │ clients     │
│ plans         │ │ chat        │ │ chat        │
│ oauth_tokens  │ │ invoices    │ │ invoices    │
│ db_endpoints  │ │ banner_*    │ │ banner_*    │
│ audit_log     │ │ ai_*        │ │ ai_*        │
└──────────────┘ └─────────────┘ └─────────────┘
```

**Control Plane DB** — shared, manages tenants, billing, routing
**Tenant DBs** — isolated, contain ALL business data per agency

---

## Phase 1: Control Plane & Tenant Routing

**Goal**: Build the foundation — org registry, DB routing, and provisioning.

**Duration**: 2-3 weeks

### 1.1 Control Plane Schema

New Neon database: `xeroflow-control-plane`

```sql
-- The tenant registry
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,        -- subdomain / URL identifier
  owner_email VARCHAR(255) NOT NULL,        -- who signed up
  plan VARCHAR(50) DEFAULT 'trial',         -- trial | starter | pro | enterprise
  status VARCHAR(50) DEFAULT 'provisioning', -- provisioning | active | suspended | cancelled
  neon_project_id VARCHAR(255),             -- Neon API project reference
  database_url_encrypted TEXT,              -- encrypted connection string
  r2_prefix VARCHAR(255),                   -- R2 key prefix for file isolation
  settings JSONB DEFAULT '{}',              -- per-org feature flags, branding, etc.
  max_users INTEGER DEFAULT 10,
  max_clients INTEGER DEFAULT 50,
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maps users to orgs (a user could belong to multiple orgs)
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'member',        -- owner | admin | member
  status VARCHAR(50) DEFAULT 'active',      -- active | invited | removed
  invited_by UUID REFERENCES org_members(id),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, email)
);

-- Audit log for admin actions
CREATE TABLE org_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  actor_email VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,             -- org.created | user.invited | plan.changed | etc.
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Billing (Stripe integration placeholder)
CREATE TABLE org_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE REFERENCES organizations(id),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  plan VARCHAR(50) NOT NULL DEFAULT 'trial',
  mrr_cents INTEGER DEFAULT 0,
  billing_email VARCHAR(255),
  next_billing_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_org_members_email ON org_members(email);
CREATE INDEX idx_org_slug ON organizations(slug);
CREATE INDEX idx_org_status ON organizations(status);
```

### 1.2 Tenant DB Routing Layer

Modify `server/utils/db.ts` — the single chokepoint.

**Current** (single global pool):
```ts
let pool: Pool | null = null
export function getDb() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return pool
}
```

**New** (tenant-aware with control plane):
```ts
// Control plane — always available
let controlPlane: Pool | null = null
export function getControlPlane(): Pool { ... }

// Tenant pools — cached by org ID, evicted after idle timeout
const tenantPools = new Map<string, { pool: Pool; lastUsed: number }>()
const POOL_IDLE_TIMEOUT = 5 * 60 * 1000 // 5 minutes

export async function getTenantDb(orgId: string): Promise<Pool> {
  // Check cache
  const cached = tenantPools.get(orgId)
  if (cached) {
    cached.lastUsed = Date.now()
    return cached.pool
  }
  // Look up connection string from control plane
  const org = await controlPlaneQueryOne(
    'SELECT database_url_encrypted FROM organizations WHERE id = $1 AND status = $2',
    [orgId, 'active']
  )
  if (!org) throw createError({ statusCode: 404, statusMessage: 'Organization not found' })
  // Decrypt and create pool
  const connectionString = decrypt(org.database_url_encrypted)
  const pool = new Pool({ connectionString })
  tenantPools.set(orgId, { pool, lastUsed: Date.now() })
  return pool
}

// Backward-compatible: getDb() reads from event context
export function getDb(event?: H3Event): Pool {
  if (event?.context?.orgPool) return event.context.orgPool
  // Fallback for dev / migration scripts
  if (!controlPlane) return getControlPlane()
  throw new Error('No tenant context — use getTenantDb() or pass event')
}
```

All existing `queryRows()`, `queryOne()`, `execute()`, `transaction()` already call `getDb()` — they inherit tenant routing automatically.

### 1.3 Auth Middleware Update

Modify `server/middleware/auth.ts` to resolve org context.

```ts
// After validating JWT and getting user:
const orgId = await resolveOrgForUser(user.email)
if (!orgId) throw createError({ statusCode: 403, statusMessage: 'No organization found' })

const tenantPool = await getTenantDb(orgId)
event.context.orgId = orgId
event.context.orgPool = tenantPool
event.context.user = user
event.context.auth = { userId: user.id, orgId, role: user.role }
```

**How `resolveOrgForUser` works**:
1. Check KV cache: `org-member:{email}` → orgId (fast path)
2. Query control plane: `SELECT org_id FROM org_members WHERE email = $1 AND status = 'active'`
3. If multiple orgs → use cookie `xf_org` or default to first
4. Cache result in KV for 5 minutes

### 1.4 Neon Provisioning Service

New: `server/utils/tenantProvisioner.ts`

```ts
export async function provisionTenant(orgName: string, ownerEmail: string): Promise<string> {
  // 1. Create org record in control plane (status: 'provisioning')
  // 2. Call Neon API to create new database
  //    POST https://console.neon.tech/api/v2/projects
  // 3. Run schema migrations on new database
  // 4. Create initial admin user in tenant DB (team_members)
  // 5. Store encrypted connection string in control plane
  // 6. Update org status to 'active'
  // 7. Return org ID
}
```

**Neon API integration**:
- Create project → get connection string
- Branch from a "template" project (pre-migrated schema) for instant provisioning
- Store `neon_project_id` for management operations (pause, delete, branch)

### 1.5 Files to Create / Modify

| File | Action | Description |
|------|--------|-------------|
| `server/utils/db.ts` | **Modify** | Add control plane pool, tenant routing, pool cache |
| `server/utils/controlPlane.ts` | **New** | Control plane query helpers |
| `server/utils/tenantProvisioner.ts` | **New** | Neon API integration, DB creation, migration runner |
| `server/utils/encryption.ts` | **New** | AES-256-GCM encrypt/decrypt for connection strings |
| `server/middleware/auth.ts` | **Modify** | Add org resolution after user validation |
| `server/utils/auth.ts` | **Modify** | Add org context to JWT payload |
| `migrations/control-plane/001-init.sql` | **New** | Control plane schema |

### 1.6 Acceptance Criteria

- [ ] Control plane DB provisioned on Neon
- [ ] `getDb(event)` returns correct tenant pool based on auth context
- [ ] Existing queries work unchanged (backward compatible)
- [ ] Pool cache evicts idle connections after 5 min
- [ ] Connection strings encrypted at rest
- [ ] Dev mode falls back to `DATABASE_URL` (single-tenant behavior preserved)

---

## Phase 2: Signup & Onboarding Flow

**Goal**: A new agency can sign up, get provisioned, and start using XeroFlow.

**Duration**: 2-3 weeks

### 2.1 Signup Flow

```
Landing Page → Email + Agency Name + Password
    │
    ▼
Create org in control plane (status: provisioning)
    │
    ▼
Call Neon API → branch from template DB
    │
    ▼
Run seed data (default board, sample project, etc.)
    │
    ▼
Create team_member in tenant DB (role: owner)
    │
    ▼
Update org status → active
    │
    ▼
Set auth cookies → redirect to /agency dashboard
```

**Target**: Signup to dashboard in <30 seconds.

Neon branching makes this fast — branch from a pre-migrated "template" database instead of running all migrations from scratch.

### 2.2 Onboarding Wizard

First-time experience after signup:

1. **Agency Profile** — name, logo upload, timezone, currency
2. **Invite Team** — email addresses for first team members
3. **Connect Integrations** (optional, skippable) — Xero, Meta Ads, Google Ads
4. **Create First Board** — template picker or blank board

Store onboarding progress in `organizations.settings.onboarding_step`.

### 2.3 Org Switcher (Multi-Org Support)

A user's email can belong to multiple orgs. Add org switcher:

- Cookie `xf_org` stores current org ID
- Dropdown in top nav (only shown if user has 2+ orgs)
- Switching sets cookie + reloads page (new DB context)
- Control plane tracks `org_members` with email as the join key

### 2.4 Invite Flow

Owner/admin invites team members:

1. Create `org_members` record (status: 'invited') in control plane
2. Send invite email via Resend
3. Invite link → signup page with pre-filled org context
4. On accept: create `team_members` row in tenant DB + update `org_members` status

### 2.5 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/signup` | POST | Create org + provision tenant + create user |
| `/api/auth/accept-invite` | POST | Join existing org from invite link |
| `/api/org/profile` | GET/PATCH | Org settings (name, logo, timezone) |
| `/api/org/members` | GET | List org members |
| `/api/org/members/invite` | POST | Send invite |
| `/api/org/members/[id]` | PATCH/DELETE | Update role or remove member |
| `/api/org/switch` | POST | Switch active org (set cookie) |

### 2.6 Pages

| Page | Description |
|------|-------------|
| `/auth/signup` | New agency registration |
| `/auth/accept-invite` | Accept org invite |
| `/agency/settings/organization` | Org profile, members, plan |

### 2.7 Acceptance Criteria

- [ ] New agency can sign up and reach dashboard in <30 seconds
- [ ] Tenant DB provisioned automatically via Neon API
- [ ] Onboarding wizard collects essential setup info
- [ ] Owner can invite team members via email
- [ ] Invited users can accept and join the org
- [ ] Org switcher works for multi-org users
- [ ] Signup validates email uniqueness across control plane

---

## Phase 3: File Storage & Infrastructure Isolation

**Goal**: Isolate R2 storage, queue jobs, and KV cache per tenant.

**Duration**: 2 weeks

### 3.1 R2 Storage Isolation

Prefix all R2 keys with org ID. One bucket, logical isolation.

**Current**: `attachments/1709234-invoice-abc123.pdf`
**New**: `{orgId}/attachments/1709234-invoice-abc123.pdf`

Modify `server/utils/storage.ts`:

```ts
export function generateStorageKey(
  category: FileCategory,
  originalFileName: string,
  entityId?: string,
  orgId?: string  // NEW — injected from event.context.orgId
): string {
  const prefix = orgId ? `${orgId}/` : ''
  // ... rest of existing logic
  return `${prefix}${category}/${timestamp}-${sanitizedName}-${uuid}.${extension}`
}
```

Also update all callers:
- Banner studio exports/publishes
- File upload endpoints
- Avatar uploads
- Invoice PDFs
- Training data exports

### 3.2 Queue Job Isolation

Add `orgId` to all queue job payloads.

```ts
export interface QueueJob {
  type: JobType
  orgId: string              // NEW
  payload: Record<string, any>
  enqueuedAt: string
}
```

Update `enqueue()`:
```ts
export async function enqueue(event: H3Event, type: JobType, payload: Record<string, any>) {
  const orgId = event.context.orgId
  const job: QueueJob = { type, orgId, payload, enqueuedAt: new Date().toISOString() }
  // ...
}
```

Queue consumer resolves tenant DB from `job.orgId` before processing.

### 3.3 KV Cache Isolation

Prefix all KV keys with org ID to prevent cross-tenant cache collisions.

**Current**: `auth-session:abc123`
**New**: `{orgId}:auth-session:abc123`

Modify `kvGet`/`kvPut` to accept org context, or wrap with tenant-aware helpers.

### 3.4 Durable Objects Isolation

Chat rooms and board events DOs already use unique IDs per board/channel. No change needed — they're inherently scoped because each tenant's boards/channels have different UUIDs.

**Verify**: DO names are derived from board/channel IDs (which live in tenant DBs) — no collision possible between tenants.

### 3.5 Vectorize Isolation

Add `orgId` as metadata on all vectors. Filter by `orgId` in queries.

```ts
// Embedding
await vectorize.insert([{
  id: `${orgId}:${entityType}:${entityId}`,
  values: embedding,
  metadata: { orgId, entityType, entityId }
}])

// Querying
const results = await vectorize.query(queryVector, {
  filter: { orgId: event.context.orgId },
  topK: 10
})
```

### 3.6 Acceptance Criteria

- [ ] All R2 uploads scoped to `{orgId}/` prefix
- [ ] Queue jobs carry `orgId` — consumer resolves correct tenant DB
- [ ] KV cache keys prefixed — no cross-tenant cache poisoning
- [ ] Vectorize queries filtered by orgId
- [ ] Existing file URLs still work (migration script for current data)

---

## Phase 4: External Integrations (Per-Tenant OAuth)

**Goal**: Each agency connects their own Xero, Meta, Google, TikTok accounts.

**Duration**: 2-3 weeks

### 4.1 The Problem

Currently, OAuth tokens for Xero/Meta/Google/TikTok are stored globally. In multi-tenant, each agency needs their own:
- Xero org connection
- Meta Ads accounts
- Google Ads accounts
- TikTok Ads accounts

### 4.2 OAuth Token Storage

Move OAuth tokens to the **control plane** (not tenant DBs) — because the routing middleware needs them before tenant DB is resolved.

Actually, reconsider: OAuth tokens are business data. They belong in the **tenant DB**. The auth middleware already resolves the tenant DB before any API endpoint runs. Keep tokens in tenant DBs.

**No schema changes needed** — `social_connections`, `xero_sessions`, `xero_tenants`, `integration_configs` already exist in each tenant DB. They'll naturally be isolated per-tenant.

### 4.3 OAuth Callback Routing

The challenge: OAuth callbacks (e.g., `/api/xero/callback`) don't carry org context. The user's browser redirected to Xero, Xero redirects back.

**Solution**: Encode `orgId` in the OAuth `state` parameter.

```ts
// Before redirect to Xero
const state = JSON.stringify({ orgId: event.context.orgId, nonce: generateToken() })
const authUrl = `https://login.xero.com/...&state=${encodeURIComponent(state)}`

// In callback
const { orgId, nonce } = JSON.parse(getQuery(event).state)
// Resolve tenant DB from orgId, store tokens there
```

Same pattern for Meta, Google, TikTok callbacks.

### 4.4 Spend Sync Per-Tenant

Currently `spend.sync.meta` / `spend.sync.google` queue jobs are global. With `orgId` in the payload, the worker:

1. Receives job with `orgId`
2. Resolves tenant DB via `getTenantDb(orgId)`
3. Reads `social_connections` from that tenant DB
4. Syncs spend data into that tenant DB

### 4.5 Xero Per-Tenant

Each agency connects their own Xero org:
- OAuth flow stores tokens in tenant DB's `xero_sessions`
- Xero tenant ID stored per-org
- EOM invoicing generates invoices against that org's Xero

**No code changes to Xero API calls** — they already read tokens from DB. Since the DB is now tenant-specific, isolation is automatic.

### 4.6 Acceptance Criteria

- [ ] Each agency can connect their own Xero org
- [ ] Each agency can connect their own Meta/Google/TikTok ad accounts
- [ ] OAuth callbacks correctly route tokens to the right tenant DB
- [ ] Spend sync jobs process per-tenant
- [ ] Disconnecting integration in one agency doesn't affect others

---

## Phase 5: Client Portal Multi-Tenancy

**Goal**: Client portal works correctly per-tenant, with tenant-branded experience.

**Duration**: 1-2 weeks

### 5.1 Current State

The client portal is **already mostly tenant-ready**:
- `client_users` belongs to `agency_clients` via `client_id`
- `requireClientAuth()` scopes queries to the client's data
- Portal pages only show data for the logged-in client

### 5.2 What Needs to Change

**Client portal auth must resolve tenant DB**:

Currently `requireClientAuth()` queries the global DB. It needs to know which tenant DB to query.

**Options**:
1. **Subdomain routing**: `clientname.portal.xeroflow.com` → resolve org from subdomain
2. **Lookup by email**: client user email → control plane lookup → org → tenant DB
3. **Token encodes org**: client session token includes orgId

Recommend option 3 — when client logs in, encode `orgId` in session. On subsequent requests, middleware resolves tenant DB from session.

### 5.3 Branded Portal

Each agency can customize their client portal:
- Logo + colors stored in `organizations.settings.portal_branding`
- Custom domain support (future): `portal.theiragency.com` → CNAME to XeroFlow

### 5.4 Acceptance Criteria

- [ ] Client portal resolves correct tenant DB
- [ ] Client users only see their agency's data
- [ ] Agency branding applied to portal

---

## Phase 6: Migration Runner & Admin Console

**Goal**: Tooling to manage tenant databases at scale.

**Duration**: 2 weeks

### 6.1 Migration Runner

When you ship a new migration, it must run on ALL tenant databases.

```ts
// scripts/migrate-all-tenants.ts
async function migrateAllTenants() {
  const orgs = await controlPlaneQuery('SELECT id, database_url_encrypted FROM organizations WHERE status = $1', ['active'])

  for (const org of orgs) {
    const connString = decrypt(org.database_url_encrypted)
    const pool = new Pool({ connectionString: connString })

    try {
      await runMigrations(pool, './migrations/tenant/')
      console.log(`Migrated ${org.id}`)
    } catch (err) {
      console.error(`Failed to migrate ${org.id}:`, err)
      // Don't stop — continue with other tenants
      // Log failure to control plane for retry
    } finally {
      await pool.end()
    }
  }
}
```

**Migration tracking**: Each tenant DB has a `schema_migrations` table tracking which migrations have run. New tenants branched from template already have all migrations.

**Template DB maintenance**: After adding new migrations, re-branch the template so new signups get the latest schema instantly.

### 6.2 Superadmin Console

Page: `/superadmin` (protected by superadmin role in control plane)

| Feature | Description |
|---------|-------------|
| Tenant list | All orgs with status, plan, user count, last active |
| Tenant detail | DB stats, storage usage, integration status |
| Suspend/activate | Toggle org status |
| Impersonate | Log into a tenant as support (audit logged) |
| Migration status | Which tenants have run which migrations |
| Run migration | Trigger migration across all or specific tenants |
| Billing overview | MRR, churn, plan distribution |

### 6.3 Health Monitoring

- Cron job checks all tenant DBs are reachable
- Alert on: DB unreachable, migration drift, storage quota exceeded
- Neon API: check project status, compute usage, storage size

### 6.4 Acceptance Criteria

- [ ] New migrations deploy to all active tenants
- [ ] Template DB stays current for new signups
- [ ] Superadmin can view, suspend, activate tenants
- [ ] Impersonation works with full audit trail
- [ ] Health checks alert on tenant DB issues

---

## Phase 7: Billing & Plans

**Goal**: Stripe integration for subscription billing with plan-based limits.

**Duration**: 2-3 weeks

### 7.1 Plan Structure

| Feature | Trial (14d) | Starter ($149/mo) | Pro ($349/mo) | Enterprise (custom) |
|---------|-------------|-------------------|---------------|---------------------|
| Users | 3 | 10 | 25 | Unlimited |
| Clients | 5 | 25 | 100 | Unlimited |
| Boards | 3 | 10 | Unlimited | Unlimited |
| Storage | 1 GB | 10 GB | 50 GB | Custom |
| Ad accounts | 1 | 5 | 20 | Unlimited |
| AI chat | 50 msgs/mo | 500 msgs/mo | Unlimited | Unlimited |
| Banner studio | Basic | Full | Full + DCO | Full + DCO |
| Client portal | No | Yes | Yes | Yes + custom domain |
| Xero integration | No | Yes | Yes | Yes |
| Support | Community | Email | Priority | Dedicated |

*Prices are placeholders — adjust based on market research.*

### 7.2 Limit Enforcement

Server middleware checks limits before creating resources:

```ts
// server/utils/planLimits.ts
export async function checkPlanLimit(event: H3Event, resource: string): Promise<void> {
  const orgId = event.context.orgId
  const plan = await getOrgPlan(orgId)
  const limits = PLAN_LIMITS[plan]
  const currentCount = await getResourceCount(event, resource)

  if (currentCount >= limits[resource]) {
    throw createError({
      statusCode: 403,
      statusMessage: `Plan limit reached: ${resource}. Upgrade to add more.`
    })
  }
}
```

Check on: user creation, client creation, board creation, file upload (storage quota), AI message send.

### 7.3 Stripe Integration

- Checkout: Stripe Checkout Session for initial subscription
- Portal: Stripe Customer Portal for plan changes, payment method, invoices
- Webhooks: `/api/webhooks/stripe` for subscription updates, payment failures
- Dunning: Grace period on failed payment → suspend after 7 days

### 7.4 Acceptance Criteria

- [ ] Trial auto-expires after 14 days (with warning emails at 3d, 1d)
- [ ] Plan limits enforced server-side
- [ ] Stripe Checkout for subscription signup
- [ ] Plan upgrades/downgrades via Stripe Portal
- [ ] Failed payment → warning → suspension flow
- [ ] Superadmin can override plan limits

---

## Phase 8: Hardening & Launch Prep

**Goal**: Security audit, performance testing, documentation, and launch.

**Duration**: 2-3 weeks

### 8.1 Security Audit

- [ ] **Tenant isolation verification**: Automated tests that sign in as Tenant A and attempt to access Tenant B's data — must fail on every endpoint
- [ ] **R2 key isolation**: Verify no endpoint returns files from another tenant's prefix
- [ ] **KV cache isolation**: Verify cache keys are prefixed and can't collide
- [ ] **Queue job isolation**: Verify jobs process against correct tenant DB
- [ ] **OAuth state validation**: Verify callback state parameter can't be forged
- [ ] **JWT claims**: Verify orgId in token matches org resolution
- [ ] **Rate limiting**: Per-tenant rate limits to prevent one tenant from degrading others
- [ ] **Encryption audit**: Connection strings encrypted at rest, no plaintext in logs

### 8.2 Performance Testing

- [ ] Tenant DB resolution adds <5ms to request latency
- [ ] Pool cache hit rate >95% under normal load
- [ ] Signup-to-dashboard <30 seconds including DB provisioning
- [ ] 50 concurrent tenants with normal load — no degradation
- [ ] Neon cold-start (waking suspended compute) <2 seconds

### 8.3 Data Isolation Tests

Write a test suite that:
1. Provisions 3 test tenants
2. Creates data in each (boards, tasks, clients, files)
3. Authenticates as each tenant
4. Attempts to access other tenants' data via every API endpoint
5. Verifies 404/403 on every cross-tenant attempt
6. Cleans up test tenants

Run this in CI on every deploy.

### 8.4 Documentation

- [ ] Tenant provisioning runbook
- [ ] Migration deployment guide
- [ ] Incident response for tenant issues
- [ ] Superadmin operations guide

### 8.5 Acceptance Criteria

- [ ] Zero cross-tenant data access in isolation tests
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Monitoring and alerting configured
- [ ] Runbooks documented

---

## Implementation Roadmap

```
Week 1-2:   Phase 1 — Control plane schema, DB routing, pool cache
Week 3:     Phase 1 — Neon provisioning API, migration runner (basic)
Week 4-5:   Phase 2 — Signup flow, onboarding wizard, invite system
Week 6-7:   Phase 3 — R2 isolation, queue isolation, KV prefixing
Week 8-9:   Phase 4 — Per-tenant OAuth (Xero, Meta, Google, TikTok)
Week 10:    Phase 5 — Client portal tenant routing
Week 11:    Phase 6 — Migration runner (production), superadmin console
Week 12-13: Phase 7 — Stripe billing, plan limits
Week 14-15: Phase 8 — Security audit, performance testing, launch prep
```

**Total: ~15 weeks (3.5 months)**

### Critical Path

```
Phase 1 (routing) ──→ Phase 2 (signup) ──→ Phase 8 (launch)
     │                      │
     ├── Phase 3 (infra)    ├── Phase 5 (portal)
     │                      │
     ├── Phase 4 (oauth)    ├── Phase 7 (billing)
     │                      │
     └── Phase 6 (admin)    └── Phase 8 (hardening)
```

Phases 3, 4, 6 can overlap with Phase 2.
Phase 7 can start once Phase 2 is complete.

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Neon API rate limits during bulk provisioning | Medium | Low | Queue provisioning, use branching for speed |
| Pool cache memory growth with many tenants | Medium | Medium | Evict idle pools aggressively (5 min TTL), monitor |
| Migration fails on one tenant | High | Medium | Continue-on-error + retry queue + alerting |
| Neon cold start latency on idle tenants | Low | High | Acceptable (<2s) — only affects first request after idle |
| Cross-tenant data leak via bug | Critical | Low | RLS as safety net on sensitive tables, isolation test suite in CI |
| Neon pricing at scale (200+ tenants) | Medium | Medium | Monitor unit economics — migrate to shared schema if needed |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Signup to dashboard | <30 seconds |
| Request latency overhead (tenant routing) | <5ms |
| Cross-tenant data leaks | Zero |
| Tenant provisioning success rate | >99.5% |
| Migration deployment (across all tenants) | <10 minutes for 100 tenants |
| Monthly recurring revenue (6 months post-launch) | Depends on GTM strategy |

---

## Out of Scope (Future)

- **Custom domains for client portal** — requires Cloudflare for SaaS + SSL provisioning
- **Data export / tenant deletion (GDPR)** — important but post-launch
- **Cross-tenant analytics** — aggregated reporting for XeroFlow's own metrics
- **Marketplace** — agencies sharing templates, automations with each other
- **White-labeling** — complete rebrand of the platform per agency
- **SSO / SAML** — enterprise auth integration
- **Multi-region** — tenant DBs in specific Neon regions based on geography

---

## Technical Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tenant isolation strategy | Database per tenant (Neon) | Minimal code changes, physical isolation, ships faster |
| Where to store OAuth tokens | Tenant DB | Business data belongs with business data; middleware resolves tenant first |
| Where to store org registry | Control plane DB | Must be accessible before tenant resolution |
| Connection string security | AES-256-GCM encryption | At-rest protection for credentials |
| New tenant provisioning | Neon branching from template | Instant (<5s) vs running all migrations (~30s) |
| R2 isolation | Key prefix (single bucket) | Simpler than per-tenant buckets; prefix provides logical isolation |
| Billing provider | Stripe | Industry standard, Checkout + Portal reduces custom UI |
| User-to-org mapping | Email-based in control plane | Supports multi-org; user doesn't need separate accounts per agency |

---

## Addendum: Audit Findings & PRD Gaps

*Added after comprehensive codebase audit of all 693 API endpoints, 4 workers, 11 job types, and all server utilities.*

### CRITICAL GAP 1: `getDb()` Threading via AsyncLocalStorage

The PRD's core claim — "queries work as-is" — has a threading problem. Today:

```ts
// server/utils/db.ts
export async function queryRows(sql, params) {
  const db = getDb()  // ← No event parameter!
  ...
}
```

Every utility function (`queryRows`, `queryOne`, `execute`, `transaction`) calls `getDb()` with **zero arguments**. The PRD proposes `getDb(event?)` reading from `event.context.orgPool`, but passing `event` through to every query call means touching **693 endpoint files**.

**Solution: AsyncLocalStorage (ALS)**

Cloudflare Workers supports ALS with `nodejs_compat` (already enabled in our wrangler.toml). This lets middleware set a request-scoped tenant pool that `getDb()` reads without any event parameter:

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

const tenantContext = new AsyncLocalStorage<{ pool: Pool; orgId: string }>()

// Middleware sets context per-request:
export function runWithTenant(orgId: string, pool: Pool, fn: () => Promise<any>) {
  return tenantContext.run({ pool, orgId }, fn)
}

// getDb() reads from ALS — NO changes to callers:
export function getDb(): Pool {
  const ctx = tenantContext.getStore()
  if (ctx?.pool) return ctx.pool
  // Dev fallback to DATABASE_URL
  if (!globalPool) globalPool = new Pool({ connectionString: process.env.DATABASE_URL })
  return globalPool
}
```

**This means 693 endpoints truly need zero changes.** The middleware wraps the request handler in `tenantContext.run()`, and every downstream `queryRows()`/`queryOne()` call inherits the correct pool automatically.

**Add to Phase 1. This is the single most important implementation detail.**

---

### CRITICAL GAP 2: In-Memory Cache Singletons

`server/utils/cache.ts` has **4 module-level MemoryCache instances** that persist across requests in the same Cloudflare Workers isolate:

| Cache | Purpose | Leak Risk |
|-------|---------|-----------|
| `sessionCache` | User sessions | Tenant A's session served to Tenant B |
| `workspaceCache` | Workspace settings | Cross-tenant workspace config |
| `departmentCache` | Board/dept listings | Tenant A sees Tenant B's boards |
| `cache` (generic) | General purpose | Any cached data leaks |

**The DB-per-tenant strategy does NOT fix this.** Even though queries go to the right database, the cache stores results keyed without tenant context. Tenant A caches "departments" → Tenant B hits the same cache key → gets Tenant A's departments.

**Fix**: Prefix all cache keys with orgId from ALS context:

```ts
function getCacheKey(key: string): string {
  const ctx = tenantContext.getStore()
  return ctx?.orgId ? `${ctx.orgId}:${key}` : key
}
```

**Add to Phase 3 (Infrastructure Isolation).**

---

### CRITICAL GAP 3: Workers & Crons Need Per-Tenant Iteration

The PRD addresses queue jobs but misses how **workers** themselves need to become multi-tenant:

**AI Agent Worker** (`workers/ai-agent-worker/`) runs two crons:
- Daily digest at 21:00 UTC
- Weekly report at 22:00 UTC Sunday

Currently calls `/api/internal/ai-agent/daily-digest` once → `runAgentDigest()` scans **ALL team members and ALL data globally**. The 8 analyzers (overdue tasks, ad spend anomalies, EOM status, etc.) query every table without filtering.

**Fix**: Cron must iterate over all active tenants:

```ts
// Worker cron handler
async scheduled(event, env, ctx) {
  const orgs = await fetch(`${env.API_URL}/api/internal/tenants/active`, {
    headers: { Authorization: `Bearer ${env.INTERNAL_API_KEY}` }
  }).then(r => r.json())

  for (const org of orgs) {
    await fetch(`${env.API_URL}/api/internal/ai-agent/daily-digest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.INTERNAL_API_KEY}`,
        'X-Tenant-Id': org.id   // NEW: tenant context header
      }
    })
  }
}
```

**Same pattern needed for**: spend sync crons, EOM generation, any future scheduled tasks.

**New internal endpoint needed**: `GET /api/internal/tenants/active` — returns list of active org IDs from control plane.

**Add to Phase 3.**

---

### CRITICAL GAP 4: Hardcoded ADME Business Logic

Several files contain business rules hardcoded for the current agency (ADME Advertising). These won't work for other agencies:

| File | What's Hardcoded | Fix |
|------|-----------------|-----|
| `server/utils/invoicing/coa-map.ts` | 60+ keyword→account mapping rules (e.g., "facebook ppc" → account 330) | Move to DB table `coa_mapping_rules` per tenant |
| `server/utils/invoicing/xero-clients.ts` | `DEALER_GROUPS` object with ADME's specific dealer structure | Move to DB table `dealer_groups` per tenant |
| `server/utils/invoicing/xero-clients.ts` | `FOURTEEN_DAY_CLIENTS` hardcoded list | Move to `agency_clients.payment_terms` column |
| `server/utils/invoicing/gst-rules.ts` | GST calculation rules specific to Australia | Make configurable per-tenant (country/tax regime) |
| `server/utils/invoicing/invoice-config.ts` | Invoice line item templates | Move to DB-driven config per tenant |

**This is NOT just a multi-tenancy issue** — it's a productization issue. No other agency can use the EOM invoicing system without rewriting these files.

**Fix**: Create a `tenant_config` pattern:
```sql
-- In each tenant DB (already exists — use integration_configs or new table)
CREATE TABLE invoicing_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_type VARCHAR(50) NOT NULL, -- 'coa_mapping' | 'dealer_groups' | 'tax_rules'
  rules JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

Seed ADME's current rules as default data in the template DB. New tenants get a blank slate or can import from templates.

**Add as new Phase 2.5 or fold into Phase 4 (Integrations).**

---

### CRITICAL GAP 5: Resend Email Singleton

`server/utils/email.ts` caches the Resend client at module level:

```ts
let resend: Resend | null = null
let cachedApiKey: string | null = null
```

If different tenants have different Resend API keys (different FROM domains), the cached client serves the wrong tenant. Same issue: the `EMAIL_FROM` address is global — all tenants send from the same address.

**Fix for DB-per-tenant**: Store email config in each tenant DB:
```sql
-- In tenant DB
CREATE TABLE email_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_address VARCHAR(255) NOT NULL DEFAULT 'noreply@xeroflow.com',
  resend_api_key_encrypted TEXT,  -- NULL = use platform default
  reply_to VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

For MVP: all tenants use XeroFlow's Resend account with `noreply@xeroflow.com`. Per-tenant email domains as an Enterprise feature.

**Add to Phase 4 or mark as post-launch.**

---

### HIGH GAP 6: Internal API Auth for Tenant Context

Three internal endpoints use `INTERNAL_API_KEY` but have no tenant routing:

| Endpoint | Called By | Issue |
|----------|----------|-------|
| `/api/internal/ai-agent/daily-digest` | ai-agent-worker cron | No orgId in request |
| `/api/internal/ai-agent/weekly-report` | ai-agent-worker cron | No orgId in request |
| `/api/internal/email-to-board` | email-worker | Uses boardToken (safe — token maps to tenant DB board) |

**Fix**: Internal endpoints accept `X-Tenant-Id` header. Middleware detects this + valid `INTERNAL_API_KEY` → resolves tenant DB:

```ts
// In auth middleware, before regular JWT check:
if (pathname.startsWith('/api/internal/')) {
  const apiKey = getHeader(event, 'authorization')?.replace('Bearer ', '')
  const tenantId = getHeader(event, 'x-tenant-id')
  if (apiKey === process.env.INTERNAL_API_KEY && tenantId) {
    const tenantPool = await getTenantDb(tenantId)
    event.context.orgId = tenantId
    event.context.orgPool = tenantPool
    return
  }
}
```

**Add to Phase 1 (Auth Middleware Update).**

---

### HIGH GAP 7: Groq AI Key Sharing / Rate Limits

All tenants share one `GROQ_API_KEY`. One agency flooding the AI chat blocks everyone.

**Options**:
1. **Platform-level rate limiting** — track AI messages per-tenant in control plane, enforce daily/monthly caps per plan tier
2. **Per-tenant API keys** — store in tenant DB, each agency brings their own Groq key (Enterprise feature)
3. **Fair-share scheduling** — round-robin or token-bucket per tenant in the queue

**Recommended for MVP**: Option 1 — track usage, enforce plan limits (already in Phase 7 plan tiers). Add `ai_usage_tracker` to control plane:

```sql
CREATE TABLE ai_usage (
  org_id UUID NOT NULL REFERENCES organizations(id),
  period VARCHAR(7) NOT NULL,  -- '2026-03'
  message_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  PRIMARY KEY (org_id, period)
);
```

**Add to Phase 7 (Billing & Plans).**

---

### HIGH GAP 8: Pre-Existing Security Issues (Fix Before Multi-Tenancy)

The audit found vulnerabilities that exist TODAY and must be fixed regardless of multi-tenancy:

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| `create-super-admin.post.ts` — **PUBLIC, no auth** | CRITICAL | `/api/admin/create-super-admin.post.ts` | Delete or require bootstrap secret |
| Xero webhook — **no signature verification** | HIGH | `/api/xero/webhook.post.ts` | Validate `x-xero-signature` HMAC |
| Admin endpoints — **no role check** | HIGH | `/api/admin/*` (8 files) | Add `requireRole(event, ['admin'])` |
| OAuth callbacks — **no CSRF state validation** | MEDIUM | Meta/Google/TikTok callbacks | Validate state token round-trip |

**These should be fixed NOW as Phase 0, before any multi-tenancy work begins.**

---

### MEDIUM GAP 9: Template DB Seed Data

When provisioning a new tenant via Neon branching, the template DB needs clean seed data:

| What to Seed | Description |
|--------------|-------------|
| Default board template | "Getting Started" board with sample columns |
| Default task statuses | Todo, In Progress, Review, Done |
| Default expense categories | Standard categories |
| Chart of Accounts (blank) | Empty — tenant configures their own via Xero sync |
| Email templates | Default notification templates |
| Banner templates (system) | Shared system templates marked `is_system = true` |

What to **NOT** seed:
- No ADME-specific data (clients, projects, boards)
- No hardcoded COA mapping rules
- No dealer groups
- No social connections

**Add to Phase 2 (Signup & Onboarding).**

---

### MEDIUM GAP 10: Endpoint Count & Scope Correction

The PRD originally estimated ~15 files modified. The audit found:

| Category | Endpoint Count |
|----------|---------------|
| `/api/agency/*` | 528 |
| `/api/chat/*` | 33 |
| `/api/xero/*` | 24 |
| `/api/auth/*` | 25 |
| `/api/portal/*` | 15 |
| `/api/admin/*` | 9 |
| `/api/notifications/*` | 8 |
| `/api/internal/*` | 4 |
| `/api/public/*` | 4 |
| Other | 43 |
| **Total** | **693** |

**With the AsyncLocalStorage approach, these 693 endpoints still need zero query changes.** But the following DO need manual review:

- **~25 R2 upload endpoints** — need orgId prefix in storage keys
- **~10 queue enqueue calls** — auto-handled if `enqueue()` reads from ALS
- **Internal endpoints** — need X-Tenant-Id header support
- **OAuth callbacks** — need state parameter with orgId
- **Webhook endpoints** — need signature verification + tenant routing

**The "~15 files" estimate in the PRD is accurate for Phase 1, but total files touched across all phases is ~40-50.**

---

### LOW GAP 11: Dashboard Preferences for Multi-Org Users

`dashboard_preferences` is keyed by `user_id` only. A user in two orgs would have the same widget layout for both.

**Fix**: Not critical for launch. If needed later, add `org_context` to preferences storage. For now, acceptable that preferences follow the user across orgs.

---

### Revised Risk Register (additions)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| AsyncLocalStorage unavailable in CF Workers | Critical | Very Low | Already available with `nodejs_compat`; fallback to explicit `event` passing |
| In-memory cache cross-tenant contamination | High | High | Prefix cache keys with orgId from ALS — must be done in Phase 1 |
| AI Agent cron scanning all tenants at once | High | High | Iterate per-tenant; add timeout per tenant to prevent cron overrun |
| Hardcoded business logic blocks new agencies | High | Certain | Move to DB-driven config in Phase 2.5 |
| Resend email sent from wrong tenant's domain | Medium | Medium | Use platform FROM address for MVP; per-tenant domains for Enterprise |
| create-super-admin.post.ts exploited before fix | Critical | Medium | **Fix immediately (Phase 0)** |

---

### Revised Phase Summary

| Phase | Duration | Description |
|-------|----------|-------------|
| **0. Pre-requisites** | **1 week** | **Fix pre-existing security holes (super-admin, webhook sigs, CSRF)** |
| 1. Control Plane & Routing | 2-3 weeks | + AsyncLocalStorage threading, in-memory cache prefixing |
| 2. Signup & Onboarding | 2-3 weeks | + Template DB seed data (clean, no ADME data) |
| 2.5 Business Logic Extraction | 1-2 weeks | COA mapping, dealer groups, GST rules → DB-driven |
| 3. Infrastructure Isolation | 2 weeks | + Worker cron per-tenant iteration, internal API tenant headers |
| 4. External Integrations | 2-3 weeks | + Email FROM config, Xero callback state validation |
| 5. Client Portal | 1-2 weeks | No changes from original |
| 6. Migration Runner & Admin | 2 weeks | No changes from original |
| 7. Billing & Plans | 2-3 weeks | + AI usage tracking per-tenant |
| 8. Hardening & Launch | 2-3 weeks | + In-memory cache audit, ALS verification |
| **Revised Total** | **~17-19 weeks (~4 months)** | +2-4 weeks from original estimate |
