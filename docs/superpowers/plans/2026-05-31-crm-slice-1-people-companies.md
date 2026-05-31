# CRM Slice 1 — People + Companies (agency-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native CRM module to the dashboard with agency-side management of per-client People + Companies — schema, client-scoped CRUD APIs, custom fields, CSV import, and Nuxt UI v4 list/detail/form UI.

**Architecture:** Generic CRM core ported from the in-house `crm-dashboard-main` project into the dashboard's stack. Dedicated relational `crm_*` tables in Neon, every row scoped by `client_id` (FK → `agency_clients`) and enforced server-side via `requireAuth`. Pinia/Supabase patterns are replaced by `db.ts` helpers + `useState`/`useFetch`. Vertical-pack scaffolding (`crm_verticals`, `crm_client_verticals`) is created but only lightly used this slice. Client-portal exposure is a follow-up plan.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nuxt UI v4, Nitro server routes, Neon Postgres via `server/utils/db.ts`, Zod, Vitest + happy-dom.

**Reference spec:** `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md` (Phase A / Slice 1).

---

## File Structure

**Create:**
- `server/database/migrations/134-crm-core.sql` — all `crm_*` tables for the slice + seed generic vertical
- `server/utils/crm/types.ts` — shared server-side TS types for CRM rows
- `server/utils/crm/queryScope.ts` — `buildWhere()` helper (params + client scoping)
- `server/utils/crm/customFields.ts` — `validateCustomFields()` (values vs field defs)
- `server/utils/crm/csv.ts` — `parseCsv()` (ported proven parser) + `normalizeKey()`
- `server/api/crm/companies/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`
- `server/api/crm/people/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `import.post.ts`
- `server/api/crm/custom-fields/index.get.ts`, `index.post.ts`, `[id].delete.ts`
- `server/api/crm/verticals/index.get.ts`, `assign.post.ts`
- `app/types/crm.ts` — frontend CRM types
- `app/composables/useCrmCompanies.ts`, `app/composables/useCrmPeople.ts`, `app/composables/useCrmCustomFields.ts`
- `app/pages/agency/crm/index.vue` — CRM home: client picker + object tabs
- `app/components/crm/CompaniesTable.vue`, `app/components/crm/PeopleTable.vue`
- `app/components/crm/RecordSlideover.vue` — detail/edit slide-over
- `app/components/crm/RecordForm.vue` — create/edit form (built-in + custom fields)
- `app/components/crm/CsvImportModal.vue`
- `app/components/crm/CustomFieldsManager.vue`
- Tests: `test/crm/queryScope.test.ts`, `test/crm/customFields.test.ts`, `test/crm/csv.test.ts`

**Modify:**
- `app/components/AppSidebar.vue` (or the agency nav source — confirm in Task 12) — add CRM nav entry

---

## Conventions (apply in every task)
- Server imports use `~~/server/utils/...` (double-tilde), never `~/server/...`.
- Parameterized SQL only; build `$1..$N` via the `push()`/`buildWhere()` helper. Escape `%`/`_` in ILIKE.
- Every read/write filters by `client_id` server-side — never trust a client-supplied scope without an auth check.
- `USelectMenu` values are never `''` — use sentinels (`'all'`) and map before the API call.
- Forms: wrap fields in `UFormField`; dates via `UPopover`+`UCalendar` (not `<input type=date>`). Invoke the `frontend-design` skill before building/editing `RecordForm.vue` and `CustomFieldsManager.vue`.
- Run migrations against the DB as part of the work:
  `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -f server/database/migrations/134-crm-core.sql`

---

### Task 1: Migration — CRM core schema

**Files:**
- Create: `server/database/migrations/134-crm-core.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 134: CRM core — companies, people, custom fields, vertical scaffolding (Slice 1)
-- Multi-tenant: client_id (FK agency_clients) on every row; app-level isolation.
-- Ported/generalised from the in-house crm-dashboard project (contacts/accounts).

-- Available verticals (code|config packs). Seeded with the always-on generic core.
CREATE TABLE IF NOT EXISTS crm_verticals (
  key        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'config' CHECK (kind IN ('code','config')),
  is_core    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO crm_verticals (key, name, kind, is_core)
VALUES ('generic', 'Generic CRM', 'code', true)
ON CONFLICT (key) DO NOTHING;

-- Which verticals a client has enabled.
CREATE TABLE IF NOT EXISTS crm_client_verticals (
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical_key TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  enabled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, vertical_key)
);

-- Per-client custom field definitions for core objects.
CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('person','company')),
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text'
              CHECK (field_type IN ('text','number','currency','date','status','dropdown','checkbox','rating','link','email','phone','location','tags')),
  options     JSONB NOT NULL DEFAULT '[]'::jsonb,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, object_type, key)
);

-- Companies (≈ Twenty Company / source accounts). Clean schema (source `accounts` was inferred).
CREATE TABLE IF NOT EXISTS crm_companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  domain        TEXT,
  phone         TEXT,
  employees     INTEGER,
  address_line1 TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT DEFAULT 'AU',
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

-- People (≈ Twenty Person / source contacts). Ported columns; dealership_id→client_id, account_id→company_id.
CREATE TABLE IF NOT EXISTS crm_people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  company_id    UUID REFERENCES crm_companies(id) ON DELETE SET NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT,
  email         TEXT,
  phone         TEXT,
  mobile        TEXT,
  job_title     TEXT,
  department    TEXT,
  city          TEXT,
  notes         TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_crm_companies_client ON crm_companies(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_people_client ON crm_people(client_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_people_company ON crm_people(company_id);
CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_lookup ON crm_custom_fields(client_id, object_type, position);
```

- [ ] **Step 2: Run the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/134-crm-core.sql
```
Expected: `CREATE TABLE` / `INSERT 0 1` / `CREATE INDEX` lines, no errors.

- [ ] **Step 3: Verify tables exist**

Run:
```bash
psql "$DATABASE_URL" -c "\dt crm_*"
```
Expected: lists `crm_companies`, `crm_people`, `crm_custom_fields`, `crm_verticals`, `crm_client_verticals`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/134-crm-core.sql
git commit -m "feat(crm): core schema — companies, people, custom fields, vertical scaffolding"
```

---

### Task 2: Query-scope helper (TDD)

**Files:**
- Create: `server/utils/crm/queryScope.ts`
- Test: `test/crm/queryScope.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildWhere } from '~~/server/utils/crm/queryScope'

describe('buildWhere', () => {
  it('always scopes by client_id and excludes soft-deleted', () => {
    const { where, params } = buildWhere('c1', [])
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1')
    expect(params).toEqual(['c1'])
  })

  it('appends extra conditions with correct param indexes', () => {
    const { where, params } = buildWhere('c1', [
      { sql: 'company_id = ?', value: 'co9' },
      { sql: 'first_name ILIKE ?', value: '%ann%' },
    ])
    expect(where).toBe(
      'WHERE deleted_at IS NULL AND client_id = $1 AND company_id = $2 AND first_name ILIKE $3',
    )
    expect(params).toEqual(['c1', 'co9', '%ann%'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/queryScope.test.ts`
Expected: FAIL — cannot find module `queryScope`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/utils/crm/queryScope.ts
// Builds a parameterized WHERE that always enforces client scoping + soft-delete.

export interface Cond { sql: string, value: unknown }

export function buildWhere(clientId: string, extra: Cond[]): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = ?']
  const params: unknown[] = [clientId]
  for (const c of extra) {
    conds.push(c.sql)
    params.push(c.value)
  }
  // Number the placeholders left-to-right.
  let i = 0
  const where = 'WHERE ' + conds.join(' AND ').replace(/\?/g, () => '$' + (++i))
  return { where, params }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/queryScope.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/queryScope.ts test/crm/queryScope.test.ts
git commit -m "feat(crm): client-scoped WHERE builder with tests"
```

---

### Task 3: Custom-field validation helper (TDD)

**Files:**
- Create: `server/utils/crm/customFields.ts`
- Test: `test/crm/customFields.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'

const defs: FieldDef[] = [
  { key: 'tier', field_type: 'dropdown', options: ['gold', 'silver'] },
  { key: 'score', field_type: 'number', options: [] },
]

describe('validateCustomFields', () => {
  it('passes known keys with valid values and drops unknown keys', () => {
    const out = validateCustomFields(defs, { tier: 'gold', score: 5, bogus: 'x' })
    expect(out).toEqual({ tier: 'gold', score: 5 })
  })

  it('throws on a dropdown value not in options', () => {
    expect(() => validateCustomFields(defs, { tier: 'bronze' })).toThrow(/tier/)
  })

  it('throws on a non-numeric number field', () => {
    expect(() => validateCustomFields(defs, { score: 'abc' })).toThrow(/score/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/customFields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/utils/crm/customFields.ts
// Validates a custom_fields value object against the client's field definitions.
// Unknown keys are dropped; invalid values throw with the offending key in the message.

export interface FieldDef {
  key: string
  field_type: string
  options: string[]
}

export function validateCustomFields(
  defs: FieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(defs.map(d => [d.key, d]))
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values ?? {})) {
    const def = byKey.get(k)
    if (!def) continue // drop unknown
    if (v === null || v === '') continue
    if (def.field_type === 'number' || def.field_type === 'currency' || def.field_type === 'rating') {
      if (typeof v !== 'number' && Number.isNaN(Number(v))) {
        throw new Error(`Invalid number for field "${k}"`)
      }
      out[k] = Number(v)
      continue
    }
    if ((def.field_type === 'dropdown' || def.field_type === 'status') && def.options.length) {
      if (!def.options.includes(String(v))) {
        throw new Error(`Invalid option for field "${k}"`)
      }
    }
    out[k] = v
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/customFields.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/customFields.ts test/crm/customFields.test.ts
git commit -m "feat(crm): custom-field value validation with tests"
```

---

### Task 4: CSV parser util (TDD)

**Files:**
- Create: `server/utils/crm/csv.ts`
- Test: `test/crm/csv.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { parseCsv, normalizeKey } from '~~/server/utils/crm/csv'

describe('parseCsv', () => {
  it('parses quoted fields, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x,1","say ""hi"""\n')
    expect(rows).toEqual([['a', 'b'], ['x,1', 'say "hi"']])
  })
  it('skips fully blank lines', () => {
    expect(parseCsv('a\n\nb\n')).toEqual([['a'], ['b']])
  })
})

describe('normalizeKey', () => {
  it('lowercases, underscores spaces, strips junk', () => {
    expect(normalizeKey('  First Name! ')).toBe('first_name')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/csv.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// server/utils/crm/csv.ts
// Minimal dependency-free CSV parser (ported from the leads importer) + key normaliser.

export function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      cell += ch; i++; continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') {
      row.push(cell)
      if (row.length > 1 || row[0].trim() !== '') rows.push(row)
      row = []; cell = ''; i++; continue
    }
    cell += ch; i++
  }
  row.push(cell)
  if (row.length > 1 || row[0].trim() !== '') rows.push(row)
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/csv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/csv.ts test/crm/csv.test.ts
git commit -m "feat(crm): CSV parser + key normaliser with tests"
```

---

### Task 5: Server types + companies list/create endpoints

**Files:**
- Create: `server/utils/crm/types.ts`
- Create: `server/api/crm/companies/index.get.ts`, `server/api/crm/companies/index.post.ts`

- [ ] **Step 1: Write shared server types**

```typescript
// server/utils/crm/types.ts
export interface CrmCompany {
  id: string
  client_id: string
  name: string
  domain: string | null
  phone: string | null
  employees: number | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
  notes: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CrmPerson {
  id: string
  client_id: string
  company_id: string | null
  first_name: string
  last_name: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  job_title: string | null
  department: string | null
  city: string | null
  notes: string | null
  custom_fields: Record<string, unknown>
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Write the companies list endpoint**

```typescript
// server/api/crm/companies/index.get.ts
// Client-scoped, paginated, searchable company list.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  client_id: z.string().uuid(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const extra: Cond[] = []
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    extra.push({ sql: '(name ILIKE ? OR domain ILIKE ?)', value: `%${safe}%` })
  }
  // Note: the OR uses one value twice — expand it explicitly:
  const conds: Cond[] = []
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    conds.push({ sql: 'name ILIKE ?', value: `%${safe}%` })
  }
  const { where, params } = buildWhere(q.client_id, conds)
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_companies ${where} ORDER BY name ASC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_companies ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size }
})
```

- [ ] **Step 3: Write the companies create endpoint**

```typescript
// server/api/crm/companies/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
import { queryRows } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1),
  domain: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  employees: z.coerce.number().int().optional().nullable(),
  address_line1: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postal_code: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  custom_fields: z.record(z.unknown()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data

  const defs = await queryRows<FieldDef>(
    `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'company'`,
    [b.client_id],
  )
  let cf: Record<string, unknown>
  try { cf = validateCustomFields(defs, b.custom_fields) }
  catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }

  const row = await queryOne(
    `INSERT INTO crm_companies
       (client_id, name, domain, phone, employees, address_line1, city, state, postal_code, country, notes, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING *`,
    [b.client_id, b.name, b.domain ?? null, b.phone ?? null, b.employees ?? null,
      b.address_line1 ?? null, b.city ?? null, b.state ?? null, b.postal_code ?? null,
      b.country ?? 'AU', b.notes ?? null, JSON.stringify(cf), user.id],
  )
  return { item: row }
})
```

- [ ] **Step 4: Verify against a running dev server**

Run (in one terminal): `pnpm dev`
Then (replace `<CLIENT_UUID>` with a real `agency_clients.id`, and use a valid session cookie or run while logged in via the browser):
```bash
curl -s 'http://localhost:3000/api/crm/companies?client_id=<CLIENT_UUID>' | head -c 400
```
Expected: JSON `{ "items": [...], "total": ..., "page":1, "page_size":50 }` (200). Then POST and confirm the row returns.

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/types.ts server/api/crm/companies/index.get.ts server/api/crm/companies/index.post.ts
git commit -m "feat(crm): company list + create endpoints (client-scoped)"
```

---

### Task 6: Companies get / patch / delete endpoints

**Files:**
- Create: `server/api/crm/companies/[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: Write the get endpoint**

```typescript
// server/api/crm/companies/[id].get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne(
    `SELECT * FROM crm_companies WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  return { item: row }
})
```

- [ ] **Step 2: Write the patch endpoint**

```typescript
// server/api/crm/companies/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'

const Body = z.object({
  client_id: z.string().uuid(),
  name: z.string().min(1).optional(),
  domain: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  employees: z.coerce.number().int().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data

  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }

  for (const col of ['name','domain','phone','employees','address_line1','city','state','postal_code','country','notes'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (b.custom_fields !== undefined) {
    const defs = await queryRows<FieldDef>(
      `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'company'`,
      [b.client_id],
    )
    let cf: Record<string, unknown>
    try { cf = validateCustomFields(defs, b.custom_fields) }
    catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    params.push(JSON.stringify(cf)); sets.push(`custom_fields = $${params.length}::jsonb`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')

  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_companies SET ${sets.join(', ')}
     WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL
     RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  return { item: row }
})
```

- [ ] **Step 3: Write the delete endpoint (soft delete)**

```typescript
// server/api/crm/companies/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(
    `UPDATE crm_companies SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Company not found' })
  return { ok: true }
})
```

- [ ] **Step 4: Verify via dev server**

With `pnpm dev` running and a created company id: GET returns the row, PATCH `{client_id, name:"New"}` updates it, DELETE soft-deletes (subsequent GET → 404). Verify cross-client isolation: GET with a *different* `client_id` → 404.

- [ ] **Step 5: Commit**

```bash
git add server/api/crm/companies/[id].get.ts server/api/crm/companies/[id].patch.ts server/api/crm/companies/[id].delete.ts
git commit -m "feat(crm): company get/patch/delete endpoints"
```

---

### Task 7: People endpoints (list/create/get/patch/delete)

**Files:**
- Create: `server/api/crm/people/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: Write the people list endpoint**

```typescript
// server/api/crm/people/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { buildWhere, type Cond } from '~~/server/utils/crm/queryScope'

const Query = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const conds: Cond[] = []
  if (q.company_id) conds.push({ sql: 'company_id = ?', value: q.company_id })
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    conds.push({ sql: '(first_name ILIKE ? OR last_name ILIKE ? OR email ILIKE ?)', value: `%${safe}%` })
  }
  // The 3-way OR needs the same value three times; rebuild params explicitly:
  const conds2: Cond[] = []
  if (q.company_id) conds2.push({ sql: 'company_id = ?', value: q.company_id })
  let searchClause = ''
  const { where, params } = buildWhere(q.client_id, conds2)
  let finalWhere = where
  const finalParams = [...params]
  if (q.q) {
    const safe = q.q.replace(/[%_]/g, c => '\\' + c)
    const base = finalParams.length
    finalWhere += ` AND (first_name ILIKE $${base + 1} OR last_name ILIKE $${base + 2} OR email ILIKE $${base + 3})`
    finalParams.push(`%${safe}%`, `%${safe}%`, `%${safe}%`)
  }
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_people ${finalWhere} ORDER BY last_name NULLS LAST, first_name LIMIT ${q.page_size} OFFSET ${offset}`,
    finalParams,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_people ${finalWhere}`, finalParams)
  return { items, total, page: q.page, page_size: q.page_size }
})
```

> Note: `searchClause`/`conds`/`extra` scratch variables above show the reasoning; keep only `conds2`, `finalWhere`, `finalParams` in the committed file.

- [ ] **Step 2: Write the people create endpoint**

```typescript
// server/api/crm/people/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'

const Body = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional().default({}),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const defs = await queryRows<FieldDef>(
    `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'person'`,
    [b.client_id],
  )
  let cf: Record<string, unknown>
  try { cf = validateCustomFields(defs, b.custom_fields) }
  catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
  const row = await queryOne(
    `INSERT INTO crm_people
       (client_id, company_id, first_name, last_name, email, phone, mobile, job_title, department, city, notes, custom_fields, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
     RETURNING *`,
    [b.client_id, b.company_id ?? null, b.first_name, b.last_name ?? null, b.email ?? null,
      b.phone ?? null, b.mobile ?? null, b.job_title ?? null, b.department ?? null, b.city ?? null,
      b.notes ?? null, JSON.stringify(cf), user.id],
  )
  return { item: row }
})
```

- [ ] **Step 3: Write get / patch / delete**

```typescript
// server/api/crm/people/[id].get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne(
    `SELECT * FROM crm_people WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client_id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return { item: row }
})
```

```typescript
// server/api/crm/people/[id].patch.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { validateCustomFields, type FieldDef } from '~~/server/utils/crm/customFields'
const Body = z.object({
  client_id: z.string().uuid(),
  company_id: z.string().uuid().nullable().optional(),
  first_name: z.string().min(1).optional(),
  last_name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  department: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custom_fields: z.record(z.unknown()).optional(),
})
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  for (const col of ['company_id','first_name','last_name','email','phone','mobile','job_title','department','city','notes'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (b.custom_fields !== undefined) {
    const defs = await queryRows<FieldDef>(
      `SELECT key, field_type, options FROM crm_custom_fields WHERE client_id = $1 AND object_type = 'person'`, [b.client_id])
    let cf: Record<string, unknown>
    try { cf = validateCustomFields(defs, b.custom_fields) }
    catch (e: any) { throw createError({ statusCode: 400, statusMessage: e.message }) }
    params.push(JSON.stringify(cf)); sets.push(`custom_fields = $${params.length}::jsonb`)
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_people SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`, params)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return { item: row }
})
```

```typescript
// server/api/crm/people/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(
    `UPDATE crm_people SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`, [id, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Person not found' })
  return { ok: true }
})
```

- [ ] **Step 4: Verify via dev server** — create/list/get/patch/delete a person under a client; confirm cross-client GET → 404; confirm an invalid custom-field value → 400.

- [ ] **Step 5: Commit**

```bash
git add server/api/crm/people/
git commit -m "feat(crm): people CRUD endpoints (client-scoped, custom-field validated)"
```

---

### Task 8: Custom-fields + verticals endpoints

**Files:**
- Create: `server/api/crm/custom-fields/index.get.ts`, `index.post.ts`, `[id].delete.ts`
- Create: `server/api/crm/verticals/index.get.ts`, `server/api/crm/verticals/assign.post.ts`

- [ ] **Step 1: custom-fields list + create + delete**

```typescript
// server/api/crm/custom-fields/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid(), object_type: z.enum(['person','company']) })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_custom_fields WHERE client_id = $1 AND object_type = $2 ORDER BY position, label`,
    [q.client_id, q.object_type])
  return { items }
})
```

```typescript
// server/api/crm/custom-fields/index.post.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
const Body = z.object({
  client_id: z.string().uuid(),
  object_type: z.enum(['person','company']),
  key: z.string().min(1).regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  field_type: z.enum(['text','number','currency','date','status','dropdown','checkbox','rating','link','email','phone','location','tags']),
  options: z.array(z.string()).optional().default([]),
  position: z.coerce.number().int().optional().default(0),
})
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_custom_fields (client_id, object_type, key, label, field_type, options, position)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT (client_id, object_type, key) DO UPDATE SET label = EXCLUDED.label, field_type = EXCLUDED.field_type, options = EXCLUDED.options, position = EXCLUDED.position
     RETURNING *`,
    [b.client_id, b.object_type, b.key, b.label, b.field_type, JSON.stringify(b.options), b.position])
  return { item: row }
})
```

```typescript
// server/api/crm/custom-fields/[id].delete.ts
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`DELETE FROM crm_custom_fields WHERE id = $1 AND client_id = $2`, [id, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { ok: true }
})
```

- [ ] **Step 2: verticals list + assign**

```typescript
// server/api/crm/verticals/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
const Query = z.object({ client_id: z.string().uuid().optional() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { client_id } = Query.parse(getQuery(event))
  const all = await queryRows(`SELECT * FROM crm_verticals ORDER BY is_core DESC, name`)
  let enabled: string[] = ['generic']
  if (client_id) {
    const rows = await queryRows<{ vertical_key: string }>(
      `SELECT vertical_key FROM crm_client_verticals WHERE client_id = $1`, [client_id])
    enabled = ['generic', ...rows.map(r => r.vertical_key)]
  }
  return { all, enabled: [...new Set(enabled)] }
})
```

```typescript
// server/api/crm/verticals/assign.post.ts
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'
const Body = z.object({ client_id: z.string().uuid(), vertical_key: z.string().min(1), enabled: z.boolean() })
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (b.enabled) {
    await execute(
      `INSERT INTO crm_client_verticals (client_id, vertical_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [b.client_id, b.vertical_key])
  } else {
    await execute(`DELETE FROM crm_client_verticals WHERE client_id = $1 AND vertical_key = $2`, [b.client_id, b.vertical_key])
  }
  return { ok: true }
})
```

- [ ] **Step 3: Verify** via dev server: create a person custom field (dropdown with options), confirm a person create with an out-of-options value → 400; list verticals returns `generic` enabled.

- [ ] **Step 4: Commit**

```bash
git add server/api/crm/custom-fields/ server/api/crm/verticals/
git commit -m "feat(crm): custom-fields + vertical assignment endpoints"
```

---

### Task 9: CSV import endpoint for people

**Files:**
- Create: `server/api/crm/people/import.post.ts`

- [ ] **Step 1: Write the import endpoint**

```typescript
// server/api/crm/people/import.post.ts
// Accepts { client_id, csv } and bulk-creates people. Maps common headers; idempotent on email.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { parseCsv, normalizeKey } from '~~/server/utils/crm/csv'

const Body = z.object({ client_id: z.string().uuid(), csv: z.string().min(1) })

const HEADER_MAP: Record<string, keyof typeof COLS> = {
  first_name: 'first_name', firstname: 'first_name', 'first': 'first_name',
  last_name: 'last_name', lastname: 'last_name', 'last': 'last_name', surname: 'last_name',
  email: 'email', email_address: 'email',
  phone: 'phone', phone_number: 'phone', mobile: 'mobile',
  job_title: 'job_title', title: 'job_title', department: 'department', city: 'city',
} as Record<string, keyof typeof COLS>

const COLS = { first_name: '', last_name: '', email: '', phone: '', mobile: '', job_title: '', department: '', city: '' }

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const { client_id, csv } = parsed.data

  const rows = parseCsv(csv)
  if (rows.length < 2) throw createError({ statusCode: 400, statusMessage: 'CSV has no data rows' })
  const headers = rows[0].map(normalizeKey)
  const result = { imported: 0, skipped: 0, errors: [] as { row: number, message: string }[] }

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    if (cols.every(c => !c.trim())) continue
    const rec: Record<string, string> = {}
    headers.forEach((h, i) => {
      const target = HEADER_MAP[h]
      if (target && cols[i]?.trim()) rec[target] = cols[i].trim()
    })
    if (!rec.first_name) { result.errors.push({ row: r + 1, message: 'missing first_name' }); continue }
    try {
      if (rec.email) {
        const dup = await queryRows(
          `SELECT 1 FROM crm_people WHERE client_id = $1 AND lower(email) = lower($2) AND deleted_at IS NULL LIMIT 1`,
          [client_id, rec.email])
        if (dup.length) { result.skipped++; continue }
      }
      await queryOne(
        `INSERT INTO crm_people (client_id, first_name, last_name, email, phone, mobile, job_title, department, city, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [client_id, rec.first_name, rec.last_name ?? null, rec.email ?? null, rec.phone ?? null,
          rec.mobile ?? null, rec.job_title ?? null, rec.department ?? null, rec.city ?? null, user.id])
      result.imported++
    } catch (e: any) {
      result.errors.push({ row: r + 1, message: e?.message ?? 'insert_failed' })
    }
  }
  return result
})
```

- [ ] **Step 2: Verify** via dev server: POST `{client_id, csv:"first_name,email\nAnn,ann@x.com\nAnn,ann@x.com"}` → `{ imported:1, skipped:1, errors:[] }`.

- [ ] **Step 3: Commit**

```bash
git add server/api/crm/people/import.post.ts
git commit -m "feat(crm): people CSV import (header mapping, email dedupe)"
```

---

### Task 10: Frontend types + composables

**Files:**
- Create: `app/types/crm.ts`, `app/composables/useCrmCompanies.ts`, `app/composables/useCrmPeople.ts`, `app/composables/useCrmCustomFields.ts`

- [ ] **Step 1: Frontend types**

```typescript
// app/types/crm.ts
export interface CrmCompany {
  id: string; client_id: string; name: string; domain: string | null; phone: string | null
  employees: number | null; address_line1: string | null; city: string | null; state: string | null
  postal_code: string | null; country: string | null; notes: string | null
  custom_fields: Record<string, unknown>; created_at: string; updated_at: string
}
export interface CrmPerson {
  id: string; client_id: string; company_id: string | null; first_name: string; last_name: string | null
  email: string | null; phone: string | null; mobile: string | null; job_title: string | null
  department: string | null; city: string | null; notes: string | null
  custom_fields: Record<string, unknown>; created_at: string; updated_at: string
}
export interface CrmCustomField {
  id: string; client_id: string; object_type: 'person' | 'company'; key: string; label: string
  field_type: string; options: string[]; position: number
}
export interface CrmListResponse<T> { items: T[]; total: number; page: number; page_size: number }
```

- [ ] **Step 2: Companies composable**

```typescript
// app/composables/useCrmCompanies.ts
import type { CrmCompany, CrmListResponse } from '~/types/crm'

export function useCrmCompanies(clientId: Ref<string | null>) {
  const search = useState<string>('crm-companies-search', () => '')
  const page = useState<number>('crm-companies-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmCompany>>('/api/crm/companies', {
    query, watch: [query], immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>('/api/crm/companies', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh(); return res.item
  }
  async function update(id: string, body: Partial<CrmCompany>) {
    const res = await $fetch<{ item: CrmCompany }>(`/api/crm/companies/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh(); return res.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/companies/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { data, pending, refresh, search, page, create, update, remove }
}
```

- [ ] **Step 3: People composable** (same shape, people endpoints)

```typescript
// app/composables/useCrmPeople.ts
import type { CrmPerson, CrmListResponse } from '~/types/crm'

export function useCrmPeople(clientId: Ref<string | null>) {
  const search = useState<string>('crm-people-search', () => '')
  const companyId = useState<string | null>('crm-people-company', () => null)
  const page = useState<number>('crm-people-page', () => 1)
  const query = computed(() => {
    const p: Record<string, string> = { page: String(page.value), page_size: '50' }
    if (clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    if (companyId.value) p.company_id = companyId.value
    return p
  })
  const { data, pending, refresh } = useFetch<CrmListResponse<CrmPerson>>('/api/crm/people', {
    query, watch: [query], immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50 }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>('/api/crm/people', { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh(); return res.item
  }
  async function update(id: string, body: Partial<CrmPerson>) {
    const res = await $fetch<{ item: CrmPerson }>(`/api/crm/people/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh(); return res.item
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/people/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  async function importCsv(csv: string) {
    const res = await $fetch<{ imported: number, skipped: number, errors: { row: number, message: string }[] }>(
      '/api/crm/people/import', { method: 'POST', body: { client_id: clientId.value, csv } })
    await refresh(); return res
  }
  return { data, pending, refresh, search, companyId, page, create, update, remove, importCsv }
}
```

- [ ] **Step 4: Custom-fields composable**

```typescript
// app/composables/useCrmCustomFields.ts
import type { CrmCustomField } from '~/types/crm'

export function useCrmCustomFields(clientId: Ref<string | null>, objectType: 'person' | 'company') {
  const query = computed(() => ({ client_id: clientId.value ?? '', object_type: objectType }))
  const { data, refresh } = useFetch<{ items: CrmCustomField[] }>('/api/crm/custom-fields', {
    query, watch: [query], immediate: false, default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })
  async function create(body: Partial<CrmCustomField>) {
    await $fetch('/api/crm/custom-fields', { method: 'POST', body: { ...body, client_id: clientId.value, object_type: objectType } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`/api/crm/custom-fields/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, remove }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/types/crm.ts app/composables/useCrmCompanies.ts app/composables/useCrmPeople.ts app/composables/useCrmCustomFields.ts
git commit -m "feat(crm): frontend types + companies/people/custom-fields composables"
```

---

### Task 11: Agency UI — page, tables, form, slide-over, CSV modal, custom-fields manager

> **Invoke the `frontend-design` skill before writing `RecordForm.vue` and `CustomFieldsManager.vue`** (project mandate for any form work), then apply Nuxt UI v4 patterns (`UFormField`, `UInput`, `USelectMenu`, `UPopover`+`UCalendar`, `USlideover`, `UModal`, `UTable`).

**Files:**
- Create: `app/components/crm/CompaniesTable.vue`, `PeopleTable.vue`, `RecordSlideover.vue`, `RecordForm.vue`, `CsvImportModal.vue`, `CustomFieldsManager.vue`
- Create: `app/pages/agency/crm/index.vue`

- [ ] **Step 1: CRM page with client picker + tabs**

```vue
<!-- app/pages/agency/crm/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'default', middleware: 'auth' })
useHead({ title: 'CRM' })

// Clients to pick from (reuse existing agency clients endpoint).
const { data: clientsData } = await useFetch<{ items: { id: string, name: string }[] }>('/api/agency/clients')
const clientOptions = computed(() => (clientsData.value?.items ?? []).map(c => ({ label: c.name, value: c.id })))
const clientId = useState<string | null>('crm-active-client', () => null)
const tab = ref<'people' | 'companies'>('people')
const tabItems = [{ label: 'People', value: 'people' }, { label: 'Companies', value: 'companies' }]
</script>

<template>
  <div class="p-6 space-y-4">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-bold">CRM</h1>
      <USelectMenu
        v-model="clientId"
        :items="clientOptions"
        value-key="value"
        placeholder="Select a client"
        class="w-64"
      />
    </div>

    <div v-if="!clientId" class="text-muted text-sm border border-default rounded-lg p-8 text-center">
      Select a client to view their CRM.
    </div>
    <template v-else>
      <UTabs v-model="tab" :items="tabItems" />
      <CrmPeopleTable v-if="tab === 'people'" :client-id="clientId" />
      <CrmCompaniesTable v-else :client-id="clientId" />
    </template>
  </div>
</template>
```

> If `/api/agency/clients` returns a different shape than `{ items: [...] }`, adjust `clientOptions` to match (confirm by curling it once).

- [ ] **Step 2: PeopleTable** (list + search + open detail + add + import)

```vue
<!-- app/components/crm/PeopleTable.vue -->
<script setup lang="ts">
import type { CrmPerson } from '~/types/crm'
const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const { data, pending, search, create, update, remove, importCsv } = useCrmPeople(clientId)

const slideoverOpen = ref(false)
const editing = ref<CrmPerson | null>(null)
const importOpen = ref(false)
const fieldsOpen = ref(false)

const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'email', header: 'Email' },
  { accessorKey: 'phone', header: 'Phone' },
  { accessorKey: 'job_title', header: 'Title' },
  { accessorKey: 'actions', header: '' },
]
function fullName(p: CrmPerson) { return [p.first_name, p.last_name].filter(Boolean).join(' ') }
function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(p: CrmPerson) { editing.value = p; slideoverOpen.value = true }
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <UInput v-model="search" placeholder="Search people…" icon="i-lucide-search" class="flex-1" />
      <UButton icon="i-lucide-sliders-horizontal" variant="ghost" @click="fieldsOpen = true">Fields</UButton>
      <UButton icon="i-lucide-upload" variant="ghost" @click="importOpen = true">Import</UButton>
      <UButton icon="i-lucide-plus" @click="openNew">Add person</UButton>
    </div>

    <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
      <template #name-cell="{ row }">
        <button class="font-medium hover:underline" @click="openEdit(row.original)">{{ fullName(row.original) }}</button>
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="[[{ label: 'Edit', icon: 'i-lucide-pen', onSelect: () => openEdit(row.original) }, { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(row.original.id) }]]">
          <UButton icon="i-lucide-ellipsis" variant="ghost" size="xs" />
        </UDropdownMenu>
      </template>
    </UTable>

    <CrmRecordSlideover
      v-model:open="slideoverOpen" object-type="person" :client-id="clientId" :record="editing"
      @save="async (body) => { editing ? await update(editing.id, body) : await create(body); slideoverOpen = false }"
    />
    <CrmCsvImportModal v-model:open="importOpen" @import="async (csv) => { const r = await importCsv(csv); importOpen = false; return r }" />
    <CrmCustomFieldsManager v-model:open="fieldsOpen" object-type="person" :client-id="clientId" />
  </div>
</template>
```

- [ ] **Step 3: CompaniesTable** (same structure, company columns/fields)

```vue
<!-- app/components/crm/CompaniesTable.vue -->
<script setup lang="ts">
import type { CrmCompany } from '~/types/crm'
const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const { data, pending, search, create, update, remove } = useCrmCompanies(clientId)
const slideoverOpen = ref(false)
const editing = ref<CrmCompany | null>(null)
const fieldsOpen = ref(false)
const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'domain', header: 'Domain' },
  { accessorKey: 'city', header: 'City' },
  { accessorKey: 'actions', header: '' },
]
function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(c: CrmCompany) { editing.value = c; slideoverOpen.value = true }
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <UInput v-model="search" placeholder="Search companies…" icon="i-lucide-search" class="flex-1" />
      <UButton icon="i-lucide-sliders-horizontal" variant="ghost" @click="fieldsOpen = true">Fields</UButton>
      <UButton icon="i-lucide-plus" @click="openNew">Add company</UButton>
    </div>
    <UTable :data="data?.items ?? []" :columns="columns" :loading="pending">
      <template #name-cell="{ row }">
        <button class="font-medium hover:underline" @click="openEdit(row.original)">{{ row.original.name }}</button>
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="[[{ label: 'Edit', icon: 'i-lucide-pen', onSelect: () => openEdit(row.original) }, { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(row.original.id) }]]">
          <UButton icon="i-lucide-ellipsis" variant="ghost" size="xs" />
        </UDropdownMenu>
      </template>
    </UTable>
    <CrmRecordSlideover
      v-model:open="slideoverOpen" object-type="company" :client-id="clientId" :record="editing"
      @save="async (body) => { editing ? await update(editing.id, body) : await create(body); slideoverOpen = false }"
    />
    <CrmCustomFieldsManager v-model:open="fieldsOpen" object-type="company" :client-id="clientId" />
  </div>
</template>
```

- [ ] **Step 4: RecordSlideover wrapping RecordForm**

```vue
<!-- app/components/crm/RecordSlideover.vue -->
<script setup lang="ts">
const props = defineProps<{ open: boolean, objectType: 'person' | 'company', clientId: string, record: any | null }>()
const emit = defineEmits<{ 'update:open': [boolean], 'save': [Record<string, unknown>] }>()
const title = computed(() => (props.record ? 'Edit ' : 'New ') + (props.objectType === 'person' ? 'person' : 'company'))
</script>

<template>
  <USlideover :open="open" :title="title" @update:open="emit('update:open', $event)">
    <template #body>
      <CrmRecordForm
        :object-type="objectType" :client-id="clientId" :record="record"
        @submit="(body) => emit('save', body)"
        @cancel="emit('update:open', false)"
      />
    </template>
  </USlideover>
</template>
```

- [ ] **Step 5: RecordForm** (built-in fields per object + dynamic custom fields)

```vue
<!-- app/components/crm/RecordForm.vue -->
<!-- Invoke the frontend-design skill before authoring this file. -->
<script setup lang="ts">
const props = defineProps<{ objectType: 'person' | 'company', clientId: string, record: any | null }>()
const emit = defineEmits<{ submit: [Record<string, unknown>], cancel: [] }>()
const clientId = toRef(props, 'clientId')
const { fields } = useCrmCustomFields(clientId, props.objectType)

const PERSON_FIELDS = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'mobile', label: 'Mobile' },
  { key: 'job_title', label: 'Job title' },
  { key: 'department', label: 'Department' },
  { key: 'city', label: 'City' },
]
const COMPANY_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'domain', label: 'Domain' },
  { key: 'phone', label: 'Phone' },
  { key: 'employees', label: 'Employees' },
  { key: 'address_line1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'postal_code', label: 'Postcode' },
]
const builtins = computed(() => props.objectType === 'person' ? PERSON_FIELDS : COMPANY_FIELDS)

const form = reactive<Record<string, any>>({})
const custom = reactive<Record<string, any>>({})
const errors = ref<Record<string, string>>({})

watchEffect(() => {
  for (const f of builtins.value) form[f.key] = props.record?.[f.key] ?? ''
  for (const cf of fields.value) custom[cf.key] = (props.record?.custom_fields ?? {})[cf.key] ?? ''
})

const loading = ref(false)
const toast = useToast()
async function submit() {
  errors.value = {}
  for (const f of builtins.value) if (f.required && !String(form[f.key] ?? '').trim()) errors.value[f.key] = `${f.label} is required`
  if (Object.keys(errors.value).length) return
  loading.value = true
  try {
    const body: Record<string, unknown> = { ...form, custom_fields: { ...custom } }
    if (form.employees === '' || form.employees == null) delete body.employees
    emit('submit', body)
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.message || e?.message, color: 'error' })
  } finally { loading.value = false }
}
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div class="grid grid-cols-2 gap-4">
      <UFormField v-for="f in builtins" :key="f.key" :label="f.label" :error="errors[f.key]" :required="f.required">
        <UInput v-model="form[f.key]" :type="f.key === 'employees' ? 'number' : 'text'" />
      </UFormField>
    </div>

    <template v-if="fields.length">
      <h3 class="text-sm font-medium text-muted pt-2">Custom fields</h3>
      <div class="grid grid-cols-2 gap-4">
        <UFormField v-for="cf in fields" :key="cf.id" :label="cf.label">
          <USelectMenu v-if="cf.field_type === 'dropdown' || cf.field_type === 'status'" v-model="custom[cf.key]" :items="cf.options" />
          <UCheckbox v-else-if="cf.field_type === 'checkbox'" v-model="custom[cf.key]" />
          <UInput v-else v-model="custom[cf.key]" :type="cf.field_type === 'number' || cf.field_type === 'currency' ? 'number' : 'text'" />
        </UFormField>
      </div>
    </template>

    <div class="flex justify-end gap-2 pt-2">
      <UButton type="button" variant="ghost" @click="emit('cancel')">Cancel</UButton>
      <UButton type="submit" :loading="loading">{{ record ? 'Save' : 'Create' }}</UButton>
    </div>
  </form>
</template>
```

- [ ] **Step 6: CsvImportModal**

```vue
<!-- app/components/crm/CsvImportModal.vue -->
<script setup lang="ts">
defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean], 'import': [string] }>()
const csv = ref('')
const result = ref<{ imported: number, skipped: number, errors: { row: number, message: string }[] } | null>(null)
const loading = ref(false)
async function go() {
  loading.value = true
  try { result.value = (await emit('import', csv.value)) as any } finally { loading.value = false }
}
</script>

<template>
  <UModal :open="open" title="Import people from CSV" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">Paste CSV with a header row. Recognised columns: first_name, last_name, email, phone, mobile, job_title, department, city.</p>
        <UTextarea v-model="csv" :rows="8" class="font-mono text-xs" placeholder="first_name,last_name,email&#10;Ann,Lee,ann@example.com" />
        <UAlert v-if="result" icon="i-lucide-check" :title="`Imported ${result.imported}, skipped ${result.skipped}, errors ${result.errors.length}`" />
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="emit('update:open', false)">Close</UButton>
          <UButton :loading="loading" :disabled="!csv.trim()" @click="go">Import</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 7: CustomFieldsManager**

```vue
<!-- app/components/crm/CustomFieldsManager.vue -->
<!-- Invoke the frontend-design skill before authoring this file. -->
<script setup lang="ts">
const props = defineProps<{ open: boolean, objectType: 'person' | 'company', clientId: string }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()
const clientId = toRef(props, 'clientId')
const { fields, create, remove } = useCrmCustomFields(clientId, props.objectType)
const TYPES = ['text','number','currency','date','status','dropdown','checkbox','rating','link','email','phone','location','tags']
const draft = reactive({ key: '', label: '', field_type: 'text', options: '' })
async function add() {
  if (!draft.key.trim() || !draft.label.trim()) return
  await create({ key: draft.key, label: draft.label, field_type: draft.field_type, options: draft.options ? draft.options.split(',').map(s => s.trim()) : [] })
  Object.assign(draft, { key: '', label: '', field_type: 'text', options: '' })
}
</script>

<template>
  <UModal :open="open" :title="`Custom fields — ${objectType}`" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-4">
        <ul class="divide-y divide-default">
          <li v-for="f in fields" :key="f.id" class="flex items-center justify-between py-2">
            <span><span class="font-medium">{{ f.label }}</span> <span class="text-xs text-muted">({{ f.field_type }}, {{ f.key }})</span></span>
            <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="remove(f.id)" />
          </li>
          <li v-if="!fields.length" class="py-2 text-sm text-muted">No custom fields yet.</li>
        </ul>
        <div class="grid grid-cols-2 gap-3 border-t border-default pt-3">
          <UFormField label="Key"><UInput v-model="draft.key" placeholder="tier" /></UFormField>
          <UFormField label="Label"><UInput v-model="draft.label" placeholder="Tier" /></UFormField>
          <UFormField label="Type"><USelectMenu v-model="draft.field_type" :items="TYPES" /></UFormField>
          <UFormField label="Options (comma-sep)"><UInput v-model="draft.options" placeholder="gold,silver" /></UFormField>
        </div>
        <div class="flex justify-end"><UButton :disabled="!draft.key || !draft.label" @click="add">Add field</UButton></div>
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 8: Manual verification (dev server)**

Run `pnpm dev`, log in as an agency user, go to `/agency/crm`, pick a client. Verify: add a company; add a person (assign company by editing later); search; edit via name click; delete; add a custom dropdown field then confirm it appears in the form and rejects invalid values (toast error from the 400); CSV import a couple of rows.

- [ ] **Step 9: Typecheck + commit**

Run: `pnpm exec nuxt typecheck` (expect no NEW errors beyond the ~60 known pre-existing ones).
```bash
git add app/pages/agency/crm/ app/components/crm/
git commit -m "feat(crm): agency CRM UI — people/companies tables, form, slide-over, CSV, custom fields"
```

---

### Task 12: Navigation entry + RBAC

**Files:**
- Modify: the agency sidebar/nav component (find it: `grep -rl "agency/leads" app/components app/layouts`)

- [ ] **Step 1: Locate the nav source**

Run: `grep -rln "agency/leads" app/components app/layouts app/app.config.ts`
Expected: the file rendering agency nav links (e.g. `app/components/AppSidebar.vue`).

- [ ] **Step 2: Add a CRM nav link**

In that file, add an entry mirroring the existing ones, pointing to `/agency/crm` with icon `i-lucide-contact` and label `CRM`. (Match the exact object shape the file already uses for other links — copy a sibling entry and change `to`, `label`, `icon`.)

- [ ] **Step 3: Verify route guard**

Confirm `/agency/crm` uses `middleware: 'auth'` (set in Task 11 Step 1) and renders only for authenticated agency users. The mutation endpoints already enforce `requireWriteAccess`; vertical assignment requires `PERMISSIONS.MANAGEMENT`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(crm): add CRM to agency navigation"
```

---

## Self-Review Notes (author)
- **Spec coverage:** schema (Task 1), client-scoped CRUD (5–7), custom fields (3,8,11), CSV import (4,9), composables/UI (10,11), vertical scaffolding (1,8,11), tenancy isolation (2 + every endpoint). Client-portal surface is intentionally a **follow-up plan** (noted in spec §10 / here in Architecture).
- **Type consistency:** `CrmCompany`/`CrmPerson`/`CrmCustomField` shared shapes match between server `types.ts` and `app/types/crm.ts`; endpoint bodies match composable payloads (`client_id` injected by composables).
- **Known caveats to honour at execution:** (1) confirm `/api/agency/clients` response shape (Task 11 Step 1 note). (2) `UTable`/`USelectMenu`/`UDropdownMenu`/`USlideover`/`UModal` prop names are Nuxt UI v4 — verify slot names (`#<column>-cell`, `#body`) against the installed version; adjust if minor drift. (3) In Tasks 5 & 7 the list endpoints contain scratch reasoning variables — commit only the explicit `finalWhere`/`finalParams` (people) and `conds`(name-only) (companies) forms.

## Out of scope (next plans)
- Client-portal CRM surface (`/portal/crm`) with `requireClientAuth` — sibling plan.
- Slice 2 (Opportunities + Pipeline), Slice 3 (Activities + Notes), Phase B (custom-objects engine), Phase C (automotive code pack).
