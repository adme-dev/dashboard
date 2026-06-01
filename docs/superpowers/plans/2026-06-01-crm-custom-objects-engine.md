# CRM Custom-Objects Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a metadata-driven custom-objects engine so a new CRM "config vertical" (e.g. Retail) is added by data, not code — config-defined object types + fields + JSONB records, with two-axis (client + vertical) isolation, surfaced in both agency and client-portal CRM.

**Architecture:** Four new tables (`crm_object_defs`, `crm_field_defs`, `crm_records`, `crm_pipeline_templates`) in migration 140. Records live in `crm_records.data` (JSONB), validated on write against `crm_field_defs`. The engine generalises shipped CRM code: `validateRecord` extends `validateCustomFields()`, `buildRecordFilter` extends the `buildWhere()` queryScope helper, and UI reuses the agency↔portal `provide/inject('crmApiBase')` split. Object/field *definition* is agency-only; *records* are editable agency + portal. Relations target core objects (person/company) only this milestone.

**Tech Stack:** Nuxt 4 (Nitro server routes), Neon Postgres via `server/utils/db.ts` (`queryRows`/`queryOne`/`queryCount`/`execute`/`transaction`), Zod validation, Vitest + happy-dom, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-06-01-crm-custom-objects-engine-design.md`

**Branch:** `feat/crm-custom-objects-engine` (off `origin/main`).

---

## Conventions (apply to every task)

- **Server imports** use the `~~/server/utils/` double-tilde alias, never `~/`.
- **Migrations** run automatically after creation: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -f server/database/migrations/<file>.sql`
- **Tests** run with `pnpm exec vitest run <path>`. Mirror the existing `test/crm/` style (pure-function unit tests, no DB).
- **Commits**: one per task step as indicated; messages use the `feat(crm):` / `test(crm):` prefix.
- **`field_type` canonical list** (shared by schema CHECK, Zod, validator, UI):
  `text, long_text, number, currency, date, status, dropdown, checkbox, rating, link, email, phone, location, tags, relation`
- **Pre-commit**: before each commit, re-read changed files for `~/` vs `~~/` mismatches and empty `USelectMenu` values (project rule).

---

## File Structure

**Created:**
- `server/database/migrations/140-crm-custom-objects.sql` — 4 tables + Retail seed
- `server/utils/crm/engine/types.ts` — engine TS types (ObjectDef, FieldDef, EngineRecord, etc.)
- `server/utils/crm/engine/validateRecord.ts` — record validation against field defs
- `server/utils/crm/engine/recordFilter.ts` — JSONB filter builder (`buildRecordFilter`)
- `server/utils/crm/engine/resolveObjects.ts` — `resolveClientObjects` isolation gate + `assertObjectVisible`
- `server/utils/crm/engine/seedVertical.ts` — `seedVerticalFromTemplate`
- `server/api/crm/object-defs/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`
- `server/api/crm/object-defs/[id]/field-defs/index.get.ts`, `index.post.ts`, `[fid].patch.ts`, `[fid].delete.ts`
- `server/api/crm/records/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `[id]/move.patch.ts`
- `server/api/client-portal/crm/object-defs/index.get.ts` (read-only), `field-defs` read, `records/*` (mirror)
- `app/composables/useCrmObjectDefs.ts`, `useCrmFieldDefs.ts`, `useCrmRecords.ts`
- `app/components/crm/ObjectDefManager.vue`, `FieldDefManager.vue`, `RecordsTable.vue`, `RecordForm.vue`, `RecordSlideover.vue`, `RecordPipelineBoard.vue`
- `app/utils/crmFieldControls.ts` — `field_type → Nuxt UI control` mapping (shared by form + table)
- Test files mirroring each util under `test/crm/engine/`

**Modified:**
- `app/types/crm.ts` — add engine types (append)
- `server/api/crm/verticals/assign.post.ts` — call `seedVerticalFromTemplate` on enable
- `app/pages/agency/crm/index.vue` — add "Custom Objects" designer tab + dynamic object tabs
- `app/pages/portal/crm.vue` — surface enabled config objects

---

## SLICE B1 — Schema + defs API + server utils

### Task 1: Migration 140 — schema + Retail seed

**Files:**
- Create: `server/database/migrations/140-crm-custom-objects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 140: CRM custom-objects engine — config verticals (Phase B). Stacked on 134/135/138.
-- Metadata-driven: object defs + field defs + JSONB records + per-vertical seed templates.
-- Two-axis isolation: every row carries client_id; object_def carries vertical_key.

-- Object type definitions (the "tables" a config vertical declares, per client).
CREATE TABLE IF NOT EXISTS crm_object_defs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical_key TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  label        TEXT NOT NULL,
  label_plural TEXT NOT NULL,
  icon         TEXT,
  has_pipeline BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (client_id, key)
);

-- Field definitions for a config object.
CREATE TABLE IF NOT EXISTS crm_field_defs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id   UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  field_type      TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN (
                    'text','long_text','number','currency','date','status','dropdown',
                    'checkbox','rating','link','email','phone','location','tags','relation')),
  options         JSONB NOT NULL DEFAULT '[]'::jsonb,
  relation_target TEXT CHECK (relation_target IN ('person','company')),
  is_required     BOOLEAN NOT NULL DEFAULT false,
  is_title        BOOLEAN NOT NULL DEFAULT false,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_def_id, key)
);

-- JSONB-backed records for config objects.
CREATE TABLE IF NOT EXISTS crm_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_id      UUID REFERENCES crm_stages(id) ON DELETE SET NULL,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_crm_records_scope ON crm_records(client_id, object_def_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_records_data  ON crm_records USING GIN (data);
CREATE INDEX IF NOT EXISTS idx_crm_records_stage ON crm_records(stage_id) WHERE stage_id IS NOT NULL;

-- Per-vertical seed templates: object defs + their fields + (optional) pipeline stages.
-- One row per object the vertical declares; instantiated per-client on vertical assign.
CREATE TABLE IF NOT EXISTS crm_object_templates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key   TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  object_key     TEXT NOT NULL,
  label          TEXT NOT NULL,
  label_plural   TEXT NOT NULL,
  icon           TEXT,
  has_pipeline   BOOLEAN NOT NULL DEFAULT false,
  position       INTEGER NOT NULL DEFAULT 0,
  fields         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{key,label,field_type,options,relation_target,is_required,is_title,position}]
  stages         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code,name,probability,sort_order,color,is_won,is_lost}]
  UNIQUE (vertical_key, object_key)
);

-- Retail proof vertical.
INSERT INTO crm_verticals (key, name, kind, is_core)
VALUES ('retail', 'Retail', 'config', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO crm_object_templates (vertical_key, object_key, label, label_plural, icon, has_pipeline, position, fields, stages)
VALUES
  ('retail', 'product', 'Product', 'Products', 'i-lucide-package', false, 1,
   '[{"key":"name","label":"Name","field_type":"text","is_title":true,"is_required":true,"position":1},
     {"key":"sku","label":"SKU","field_type":"text","position":2},
     {"key":"price","label":"Price","field_type":"currency","position":3},
     {"key":"category","label":"Category","field_type":"dropdown","options":["Apparel","Homeware","Electronics","Other"],"position":4},
     {"key":"stock","label":"Stock","field_type":"number","position":5}]'::jsonb,
   '[]'::jsonb),
  ('retail', 'order', 'Order', 'Orders', 'i-lucide-shopping-cart', true, 2,
   '[{"key":"reference","label":"Reference","field_type":"text","is_title":true,"is_required":true,"position":1},
     {"key":"customer","label":"Customer","field_type":"relation","relation_target":"person","position":2},
     {"key":"total","label":"Total","field_type":"currency","position":3},
     {"key":"notes","label":"Notes","field_type":"long_text","position":4}]'::jsonb,
   '[{"code":"new","name":"New","probability":10,"sort_order":1,"color":"#94a3b8","is_won":false,"is_lost":false},
     {"code":"paid","name":"Paid","probability":50,"sort_order":2,"color":"#3b82f6","is_won":false,"is_lost":false},
     {"code":"fulfilled","name":"Fulfilled","probability":100,"sort_order":3,"color":"#22c55e","is_won":true,"is_lost":false},
     {"code":"cancelled","name":"Cancelled","probability":0,"sort_order":4,"color":"#ef4444","is_won":false,"is_lost":true}]'::jsonb)
ON CONFLICT (vertical_key, object_key) DO NOTHING;
```

> Note: the spec called this table `crm_pipeline_templates`; renamed to `crm_object_templates` because it seeds full objects (defs + fields + stages), not just pipelines. The stages column carries the pipeline.

- [ ] **Step 2: Run the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/140-crm-custom-objects.sql
```
Expected: `CREATE TABLE` ×4, `CREATE INDEX` ×3, `INSERT 0 1` (retail vertical), `INSERT 0 2` (templates). Re-running is safe (all guarded).

- [ ] **Step 3: Verify schema landed**

Run:
```bash
psql "$DATABASE_URL" -c "SELECT key, kind FROM crm_verticals WHERE key='retail'; SELECT object_key, has_pipeline FROM crm_object_templates WHERE vertical_key='retail' ORDER BY position;"
```
Expected: one `retail|config` row; `product|f` and `order|t`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/140-crm-custom-objects.sql
git commit -m "feat(crm): migration 140 — custom-objects engine schema + Retail seed"
```

---

### Task 2: Engine types

**Files:**
- Create: `server/utils/crm/engine/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// server/utils/crm/engine/types.ts
// Shared types for the CRM custom-objects engine (Phase B).

export const FIELD_TYPES = [
  'text', 'long_text', 'number', 'currency', 'date', 'status', 'dropdown',
  'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags', 'relation',
] as const
export type FieldType = typeof FIELD_TYPES[number]

export type RelationTarget = 'person' | 'company'

export interface ObjectDef {
  id: string
  client_id: string
  vertical_key: string
  key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
}

export interface EngineFieldDef {
  id: string
  client_id: string
  object_def_id: string
  key: string
  label: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
  is_title: boolean
  position: number
}

export interface EngineRecord {
  id: string
  client_id: string
  object_def_id: string
  data: Record<string, unknown>
  stage_id: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Verify it compiles (no test yet — pure types)**

Run: `pnpm exec tsc --noEmit server/utils/crm/engine/types.ts`
Expected: no output (success). If `tsc` errors on module resolution, skip — types are validated by the consuming tests in later tasks.

- [ ] **Step 3: Commit**

```bash
git add server/utils/crm/engine/types.ts
git commit -m "feat(crm): engine TS types (object/field defs, record)"
```

---

### Task 3: `validateRecord` util (TDD)

**Files:**
- Create: `server/utils/crm/engine/validateRecord.ts`
- Test: `test/crm/engine/validateRecord.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/crm/engine/validateRecord.test.ts
import { describe, it, expect } from 'vitest'
import { validateRecord, type ValidatorFieldDef } from '~~/server/utils/crm/engine/validateRecord'

const defs: ValidatorFieldDef[] = [
  { key: 'name', field_type: 'text', options: [], relation_target: null, is_required: true },
  { key: 'price', field_type: 'currency', options: [], relation_target: null, is_required: false },
  { key: 'category', field_type: 'dropdown', options: ['a', 'b'], relation_target: null, is_required: false },
  { key: 'email', field_type: 'email', options: [], relation_target: null, is_required: false },
  { key: 'customer', field_type: 'relation', options: [], relation_target: 'person', is_required: false },
]

describe('validateRecord', () => {
  it('keeps known valid values, coerces numbers, drops unknown keys', () => {
    const out = validateRecord(defs, { name: 'Widget', price: '9.5', bogus: 'x' })
    expect(out).toEqual({ name: 'Widget', price: 9.5 })
  })

  it('throws when a required field is missing or empty', () => {
    expect(() => validateRecord(defs, { price: 5 })).toThrow(/name/)
    expect(() => validateRecord(defs, { name: '' })).toThrow(/name/)
  })

  it('throws on a dropdown value not in options', () => {
    expect(() => validateRecord(defs, { name: 'W', category: 'z' })).toThrow(/category/)
  })

  it('throws on a malformed email', () => {
    expect(() => validateRecord(defs, { name: 'W', email: 'nope' })).toThrow(/email/)
  })

  it('throws on a non-uuid relation value', () => {
    expect(() => validateRecord(defs, { name: 'W', customer: 'not-a-uuid' })).toThrow(/customer/)
  })

  it('accepts a uuid relation value (existence checked separately at the DB layer)', () => {
    const out = validateRecord(defs, { name: 'W', customer: '11111111-1111-1111-1111-111111111111' })
    expect(out.customer).toBe('11111111-1111-1111-1111-111111111111')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/engine/validateRecord.test.ts`
Expected: FAIL — cannot find module `validateRecord`.

- [ ] **Step 3: Write the implementation**

```typescript
// server/utils/crm/engine/validateRecord.ts
// Validates a record's `data` object against its object's field definitions.
// Pure + DB-free: coerces by type, enforces required, validates options/format, and
// shape-checks relations (UUID format only — existence is verified at the DB layer
// where client scoping is available). Unknown keys are dropped.
import type { FieldType, RelationTarget } from './types'

export interface ValidatorFieldDef {
  key: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

export function validateRecord(
  defs: ValidatorFieldDef[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const byKey = new Map(defs.map(d => [d.key, d]))
  const out: Record<string, unknown> = {}

  // First pass: required-field enforcement.
  for (const def of defs) {
    if (def.is_required && isEmpty(values?.[def.key])) {
      throw new Error(`Field "${def.key}" is required`)
    }
  }

  for (const [k, v] of Object.entries(values ?? {})) {
    const def = byKey.get(k)
    if (!def) continue // drop unknown
    if (isEmpty(v)) continue

    switch (def.field_type) {
      case 'number':
      case 'currency':
      case 'rating': {
        const n = Number(v)
        if (Number.isNaN(n)) throw new Error(`Invalid number for field "${k}"`)
        out[k] = n
        break
      }
      case 'checkbox': {
        out[k] = Boolean(v)
        break
      }
      case 'dropdown':
      case 'status': {
        if (def.options.length && !def.options.includes(String(v))) {
          throw new Error(`Invalid option for field "${k}"`)
        }
        out[k] = v
        break
      }
      case 'email': {
        if (!EMAIL_RE.test(String(v))) throw new Error(`Invalid email for field "${k}"`)
        out[k] = v
        break
      }
      case 'relation': {
        if (!UUID_RE.test(String(v))) throw new Error(`Invalid relation reference for field "${k}"`)
        out[k] = String(v)
        break
      }
      case 'tags': {
        out[k] = Array.isArray(v) ? v : [v]
        break
      }
      default:
        out[k] = v
    }
  }
  return out
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/engine/validateRecord.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/engine/validateRecord.ts test/crm/engine/validateRecord.test.ts
git commit -m "feat(crm): validateRecord engine util (TDD)"
```

---

### Task 4: `buildRecordFilter` util (TDD)

**Files:**
- Create: `server/utils/crm/engine/recordFilter.ts`
- Test: `test/crm/engine/recordFilter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/crm/engine/recordFilter.test.ts
import { describe, it, expect } from 'vitest'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'

describe('buildRecordFilter', () => {
  it('always scopes by client_id + object_def_id and excludes soft-deleted', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', {})
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2')
    expect(params).toEqual(['c1', 'o1'])
  })

  it('adds a title search across the given title keys with escaped wildcards', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', { q: 'wid_get', titleKeys: ['name', 'reference'] })
    expect(where).toBe(
      "WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2 AND (data->>'name' ILIKE $3 OR data->>'reference' ILIKE $4)",
    )
    expect(params).toEqual(['c1', 'o1', '%wid\\_get%', '%wid\\_get%'])
  })

  it('ignores an empty query and empty titleKeys', () => {
    const { where, params } = buildRecordFilter('c1', 'o1', { q: '   ', titleKeys: [] })
    expect(where).toBe('WHERE deleted_at IS NULL AND client_id = $1 AND object_def_id = $2')
    expect(params).toEqual(['c1', 'o1'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/engine/recordFilter.test.ts`
Expected: FAIL — cannot find module `recordFilter`.

- [ ] **Step 3: Write the implementation**

```typescript
// server/utils/crm/engine/recordFilter.ts
// Builds a parameterized WHERE for crm_records: always client + object scoped + soft-delete,
// plus an optional ILIKE title search across the object's title field keys (JSONB ->>).
// Wildcards in the search term are escaped (ILIKE-injection lesson).

export interface RecordFilterQuery {
  q?: string
  titleKeys?: string[]
}

export function buildRecordFilter(
  clientId: string,
  objectDefId: string,
  query: RecordFilterQuery,
): { where: string, params: unknown[] } {
  const conds: string[] = ['deleted_at IS NULL', 'client_id = $1', 'object_def_id = $2']
  const params: unknown[] = [clientId, objectDefId]

  const term = (query.q ?? '').trim()
  const keys = query.titleKeys ?? []
  if (term && keys.length) {
    const safe = term.replace(/[%_]/g, c => '\\' + c)
    const like = `%${safe}%`
    const ors = keys.map((k) => {
      params.push(like)
      // key is a validated field key (^[a-z0-9_]+$) — safe to inline; value is parameterized.
      return `data->>'${k}' ILIKE $${params.length}`
    })
    conds.push(`(${ors.join(' OR ')})`)
  }
  return { where: 'WHERE ' + conds.join(' AND '), params }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/engine/recordFilter.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/engine/recordFilter.ts test/crm/engine/recordFilter.test.ts
git commit -m "feat(crm): buildRecordFilter engine util (TDD)"
```

---

### Task 5: Object-defs definition API (agency-only)

**Files:**
- Create: `server/api/crm/object-defs/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`
- Test: `test/crm/engine/objectDefsBody.test.ts` (Zod-schema unit test — extract the schema)

- [ ] **Step 1: Write the shared Zod schema with a failing test**

Create `server/utils/crm/engine/schemas.ts`:
```typescript
// server/utils/crm/engine/schemas.ts
// Zod schemas shared between the engine's API routes (so they can be unit-tested).
import { z } from 'zod'
import { FIELD_TYPES } from './types'

export const KEY_RE = /^[a-z0-9_]+$/

export const ObjectDefCreate = z.object({
  client_id: z.string().uuid(),
  vertical_key: z.string().min(1),
  key: z.string().min(1).regex(KEY_RE),
  label: z.string().min(1),
  label_plural: z.string().min(1),
  icon: z.string().nullable().optional(),
  has_pipeline: z.boolean().optional().default(false),
  position: z.coerce.number().int().optional().default(0),
})

export const FieldDefCreate = z.object({
  client_id: z.string().uuid(),
  key: z.string().min(1).regex(KEY_RE),
  label: z.string().min(1),
  field_type: z.enum(FIELD_TYPES),
  options: z.array(z.string()).optional().default([]),
  relation_target: z.enum(['person', 'company']).nullable().optional(),
  is_required: z.boolean().optional().default(false),
  is_title: z.boolean().optional().default(false),
  position: z.coerce.number().int().optional().default(0),
})
```

Create `test/crm/engine/objectDefsBody.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { ObjectDefCreate, FieldDefCreate } from '~~/server/utils/crm/engine/schemas'

describe('engine schemas', () => {
  it('rejects an object key with uppercase/spaces', () => {
    const r = ObjectDefCreate.safeParse({ client_id: '11111111-1111-1111-1111-111111111111', vertical_key: 'retail', key: 'Bad Key', label: 'X', label_plural: 'Xs' })
    expect(r.success).toBe(false)
  })

  it('accepts a valid object def and defaults has_pipeline=false', () => {
    const r = ObjectDefCreate.safeParse({ client_id: '11111111-1111-1111-1111-111111111111', vertical_key: 'retail', key: 'product', label: 'Product', label_plural: 'Products' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.has_pipeline).toBe(false)
  })

  it('rejects an unknown field_type', () => {
    const r = FieldDefCreate.safeParse({ client_id: '11111111-1111-1111-1111-111111111111', key: 'x', label: 'X', field_type: 'wizard' })
    expect(r.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/engine/objectDefsBody.test.ts`
Expected: FAIL — cannot find module `schemas`.

- [ ] **Step 3: (schemas.ts already written in Step 1) — run test to verify it passes**

Run: `pnpm exec vitest run test/crm/engine/objectDefsBody.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write `object-defs/index.get.ts`**

```typescript
// server/api/crm/object-defs/index.get.ts — list a client's object defs (optionally by vertical).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid(), vertical_key: z.string().optional() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const params: unknown[] = [q.client_id]
  let sql = `SELECT * FROM crm_object_defs WHERE client_id = $1 AND deleted_at IS NULL`
  if (q.vertical_key) { params.push(q.vertical_key); sql += ` AND vertical_key = $2` }
  sql += ` ORDER BY position, label`
  return { items: await queryRows(sql, params) }
})
```

- [ ] **Step 5: Write `object-defs/index.post.ts`**

```typescript
// server/api/crm/object-defs/index.post.ts — define a config object (agency-only).
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { ObjectDefCreate } from '~~/server/utils/crm/engine/schemas'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const parsed = ObjectDefCreate.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const row = await queryOne(
    `INSERT INTO crm_object_defs (client_id, vertical_key, key, label, label_plural, icon, has_pipeline, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (client_id, key) DO UPDATE
       SET label = EXCLUDED.label, label_plural = EXCLUDED.label_plural, icon = EXCLUDED.icon,
           has_pipeline = EXCLUDED.has_pipeline, position = EXCLUDED.position, updated_at = NOW(), deleted_at = NULL
     RETURNING *`,
    [b.client_id, b.vertical_key, b.key, b.label, b.label_plural, b.icon ?? null, b.has_pipeline, b.position],
  )
  return { item: row }
})
```

- [ ] **Step 6: Write `object-defs/[id].patch.ts`**

```typescript
// server/api/crm/object-defs/[id].patch.ts — update a config object (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().min(1).optional(),
  label_plural: z.string().min(1).optional(),
  icon: z.string().nullable().optional(),
  has_pipeline: z.boolean().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  for (const col of ['label', 'label_plural', 'icon', 'has_pipeline', 'position'] as const) {
    if (b[col] !== undefined) set(col, b[col])
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_object_defs SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  return { item: row }
})
```

- [ ] **Step 7: Write `object-defs/[id].delete.ts`**

```typescript
// server/api/crm/object-defs/[id].delete.ts — soft-delete a config object (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(
    `UPDATE crm_object_defs SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  return { ok: true }
})
```

- [ ] **Step 8: Commit**

```bash
git add server/utils/crm/engine/schemas.ts test/crm/engine/objectDefsBody.test.ts server/api/crm/object-defs/
git commit -m "feat(crm): object-defs definition API + shared engine zod schemas (agency-only)"
```

---

### Task 6: Field-defs definition API (agency-only, nested under object)

**Files:**
- Create: `server/api/crm/object-defs/[id]/field-defs/index.get.ts`, `index.post.ts`, `[fid].patch.ts`, `[fid].delete.ts`

- [ ] **Step 1: Write `field-defs/index.get.ts`**

```typescript
// server/api/crm/object-defs/[id]/field-defs/index.get.ts — fields for one object def.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const objectDefId = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const items = await queryRows(
    `SELECT * FROM crm_field_defs WHERE object_def_id = $1 AND client_id = $2 ORDER BY position, label`,
    [objectDefId, client_id],
  )
  return { items }
})
```

- [ ] **Step 2: Write `field-defs/index.post.ts`**

```typescript
// server/api/crm/object-defs/[id]/field-defs/index.post.ts — define/upsert a field (agency-only).
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'
import { FieldDefCreate } from '~~/server/utils/crm/engine/schemas'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const objectDefId = getRouterParam(event, 'id')
  const parsed = FieldDefCreate.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  // Guard: relation fields must name a target.
  if (b.field_type === 'relation' && !b.relation_target) {
    throw createError({ statusCode: 400, statusMessage: 'relation_target required for relation field' })
  }
  const row = await queryOne(
    `INSERT INTO crm_field_defs (client_id, object_def_id, key, label, field_type, options, relation_target, is_required, is_title, position)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
     ON CONFLICT (object_def_id, key) DO UPDATE
       SET label = EXCLUDED.label, field_type = EXCLUDED.field_type, options = EXCLUDED.options,
           relation_target = EXCLUDED.relation_target, is_required = EXCLUDED.is_required,
           is_title = EXCLUDED.is_title, position = EXCLUDED.position, updated_at = NOW()
     RETURNING *`,
    [b.client_id, objectDefId, b.key, b.label, b.field_type, JSON.stringify(b.options),
      b.relation_target ?? null, b.is_required, b.is_title, b.position],
  )
  return { item: row }
})
```

- [ ] **Step 3: Write `field-defs/[fid].patch.ts`**

```typescript
// server/api/crm/object-defs/[id]/field-defs/[fid].patch.ts — update a field (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({
  client_id: z.string().uuid(),
  label: z.string().min(1).optional(),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().optional(),
  is_title: z.boolean().optional(),
  position: z.coerce.number().int().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const fid = getRouterParam(event, 'fid')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const sets: string[] = []
  const params: unknown[] = []
  const set = (frag: string, val: unknown) => { params.push(val); sets.push(frag.replace('?', `$${params.length}`)) }
  if (b.label !== undefined) set('label = ?', b.label)
  if (b.options !== undefined) set('options = ?::jsonb', JSON.stringify(b.options))
  if (b.is_required !== undefined) set('is_required = ?', b.is_required)
  if (b.is_title !== undefined) set('is_title = ?', b.is_title)
  if (b.position !== undefined) set('position = ?', b.position)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(fid); const fidIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_field_defs SET ${sets.join(', ')} WHERE id = $${fidIdx} AND client_id = $${clientIdx} RETURNING *`,
    params,
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { item: row }
})
```

- [ ] **Step 4: Write `field-defs/[fid].delete.ts`**

```typescript
// server/api/crm/object-defs/[id]/field-defs/[fid].delete.ts — delete a field (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const fid = getRouterParam(event, 'fid')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`DELETE FROM crm_field_defs WHERE id = $1 AND client_id = $2`, [fid, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { ok: true }
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/crm/object-defs/
git commit -m "feat(crm): field-defs definition API (agency-only, nested under object)"
```

---

## SLICE B2 — Records API + two-axis isolation + vertical seeding

### Task 7: `resolveClientObjects` + `assertObjectVisible` (TDD)

**Files:**
- Create: `server/utils/crm/engine/resolveObjects.ts`
- Test: `test/crm/engine/resolveObjects.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/crm/engine/resolveObjects.test.ts
import { describe, it, expect } from 'vitest'
import { filterVisibleObjects, type ObjectVisibilityRow } from '~~/server/utils/crm/engine/resolveObjects'

const objs: ObjectVisibilityRow[] = [
  { id: 'o1', key: 'product', vertical_key: 'retail' },
  { id: 'o2', key: 'order', vertical_key: 'retail' },
  { id: 'o3', key: 'permit', vertical_key: 'construction' },
]

describe('filterVisibleObjects', () => {
  it('keeps only objects whose vertical is enabled (generic always allowed)', () => {
    const out = filterVisibleObjects(objs, ['generic', 'retail'])
    expect(out.map(o => o.key)).toEqual(['product', 'order'])
  })

  it('returns nothing when no matching vertical is enabled', () => {
    expect(filterVisibleObjects(objs, ['generic'])).toEqual([])
  })

  it('includes construction objects when that vertical is enabled', () => {
    const out = filterVisibleObjects(objs, ['generic', 'construction'])
    expect(out.map(o => o.key)).toEqual(['permit'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/engine/resolveObjects.test.ts`
Expected: FAIL — cannot find module `resolveObjects`.

- [ ] **Step 3: Write the implementation**

```typescript
// server/utils/crm/engine/resolveObjects.ts
// Two-axis isolation source of truth. Pure helper `filterVisibleObjects` is unit-tested;
// the DB-backed `resolveClientObjects` / `assertObjectVisible` compose it with queries.
import { queryRows, queryOne } from '~~/server/utils/db'
import type { ObjectDef } from './types'

export interface ObjectVisibilityRow {
  id: string
  key: string
  vertical_key: string
}

// Keep only objects whose vertical_key is in the enabled set.
export function filterVisibleObjects<T extends { vertical_key: string }>(
  objects: T[],
  enabledVerticals: string[],
): T[] {
  const enabled = new Set(enabledVerticals)
  return objects.filter(o => enabled.has(o.vertical_key))
}

async function enabledVerticalsFor(clientId: string): Promise<string[]> {
  const rows = await queryRows<{ vertical_key: string }>(
    `SELECT vertical_key FROM crm_client_verticals WHERE client_id = $1`,
    [clientId],
  )
  return ['generic', ...rows.map(r => r.vertical_key)]
}

// All object defs a client may see (client_id AND enabled vertical).
export async function resolveClientObjects(clientId: string): Promise<ObjectDef[]> {
  const [objects, enabled] = await Promise.all([
    queryRows<ObjectDef>(
      `SELECT * FROM crm_object_defs WHERE client_id = $1 AND deleted_at IS NULL ORDER BY position, label`,
      [clientId],
    ),
    enabledVerticalsFor(clientId),
  ])
  return filterVisibleObjects(objects, enabled)
}

// Resolve one object by key for a client, enforcing the two-axis gate. Throws 404 if not
// visible (unknown, soft-deleted, wrong client, or vertical not enabled).
export async function assertObjectVisible(clientId: string, objectKey: string): Promise<ObjectDef> {
  const obj = await queryOne<ObjectDef>(
    `SELECT * FROM crm_object_defs WHERE client_id = $1 AND key = $2 AND deleted_at IS NULL`,
    [clientId, objectKey],
  )
  if (!obj) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  const enabled = await enabledVerticalsFor(clientId)
  if (!enabled.includes(obj.vertical_key)) {
    throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  }
  return obj
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/engine/resolveObjects.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/crm/engine/resolveObjects.ts test/crm/engine/resolveObjects.test.ts
git commit -m "feat(crm): resolveClientObjects + assertObjectVisible isolation gate (TDD)"
```

---

### Task 8: `seedVerticalFromTemplate` util + wire into vertical assign

**Files:**
- Create: `server/utils/crm/engine/seedVertical.ts`
- Test: `test/crm/engine/seedVertical.test.ts` (pure planner unit test)
- Modify: `server/api/crm/verticals/assign.post.ts`

- [ ] **Step 1: Write the failing test for the pure planner**

```typescript
// test/crm/engine/seedVertical.test.ts
import { describe, it, expect } from 'vitest'
import { planSeedInserts, type ObjectTemplate } from '~~/server/utils/crm/engine/seedVertical'

const templates: ObjectTemplate[] = [
  {
    object_key: 'order', label: 'Order', label_plural: 'Orders', icon: 'i-lucide-cart',
    has_pipeline: true, position: 2,
    fields: [{ key: 'reference', label: 'Reference', field_type: 'text', options: [], relation_target: null, is_required: true, is_title: true, position: 1 }],
    stages: [{ code: 'new', name: 'New', probability: 10, sort_order: 1, color: '#94a3b8', is_won: false, is_lost: false }],
  },
]

describe('planSeedInserts', () => {
  it('produces one object, its fields, and its stages for a client', () => {
    const plan = planSeedInserts('client-1', 'retail', templates)
    expect(plan.objects).toHaveLength(1)
    expect(plan.objects[0]).toMatchObject({ client_id: 'client-1', vertical_key: 'retail', key: 'order', has_pipeline: true })
    expect(plan.fieldsByObjectKey.order).toHaveLength(1)
    expect(plan.fieldsByObjectKey.order[0]).toMatchObject({ key: 'reference', is_title: true })
    expect(plan.stagesByObjectKey.order).toHaveLength(1)
    expect(plan.stagesByObjectKey.order[0]).toMatchObject({ code: 'new', client_id: 'client-1' })
  })

  it('omits stages for non-pipeline objects', () => {
    const plan = planSeedInserts('c1', 'retail', [{ ...templates[0], has_pipeline: false, stages: [] }])
    expect(plan.stagesByObjectKey.order ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/crm/engine/seedVertical.test.ts`
Expected: FAIL — cannot find module `seedVertical`.

- [ ] **Step 3: Write the implementation (pure planner + DB executor)**

```typescript
// server/utils/crm/engine/seedVertical.ts
// On vertical assign, instantiate the vertical's object templates into per-client
// crm_object_defs + crm_field_defs + crm_stages. `planSeedInserts` is the pure,
// unit-tested core; `seedVerticalFromTemplate` runs it in a transaction (idempotent).
import { transaction, queryRows } from '~~/server/utils/db'
import type { FieldType, RelationTarget } from './types'

export interface TemplateField {
  key: string
  label: string
  field_type: FieldType
  options: string[]
  relation_target: RelationTarget | null
  is_required: boolean
  is_title: boolean
  position: number
}
export interface TemplateStage {
  code: string
  name: string
  probability: number
  sort_order: number
  color: string
  is_won: boolean
  is_lost: boolean
}
export interface ObjectTemplate {
  object_key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
  fields: TemplateField[]
  stages: TemplateStage[]
}

export interface SeedPlan {
  objects: Array<{ client_id: string, vertical_key: string, key: string, label: string, label_plural: string, icon: string | null, has_pipeline: boolean, position: number }>
  fieldsByObjectKey: Record<string, TemplateField[]>
  stagesByObjectKey: Record<string, Array<TemplateStage & { client_id: string }>>
}

export function planSeedInserts(clientId: string, verticalKey: string, templates: ObjectTemplate[]): SeedPlan {
  const plan: SeedPlan = { objects: [], fieldsByObjectKey: {}, stagesByObjectKey: {} }
  for (const t of templates) {
    plan.objects.push({
      client_id: clientId, vertical_key: verticalKey, key: t.object_key,
      label: t.label, label_plural: t.label_plural, icon: t.icon ?? null,
      has_pipeline: t.has_pipeline, position: t.position,
    })
    plan.fieldsByObjectKey[t.object_key] = t.fields
    if (t.has_pipeline && t.stages.length) {
      plan.stagesByObjectKey[t.object_key] = t.stages.map(s => ({ ...s, client_id: clientId }))
    }
  }
  return plan
}

// Idempotent: object/field upserts use ON CONFLICT; stages are scoped by a
// per-object code prefix so re-seeding does not duplicate.
export async function seedVerticalFromTemplate(clientId: string, verticalKey: string): Promise<void> {
  const templates = await queryRows<any>(
    `SELECT object_key, label, label_plural, icon, has_pipeline, position, fields, stages
       FROM crm_object_templates WHERE vertical_key = $1 ORDER BY position`,
    [verticalKey],
  )
  if (!templates.length) return
  const plan = planSeedInserts(clientId, verticalKey, templates.map(t => ({
    object_key: t.object_key, label: t.label, label_plural: t.label_plural, icon: t.icon,
    has_pipeline: t.has_pipeline, position: t.position,
    fields: Array.isArray(t.fields) ? t.fields : JSON.parse(t.fields),
    stages: Array.isArray(t.stages) ? t.stages : JSON.parse(t.stages),
  })))

  await transaction(async (db) => {
    for (const o of plan.objects) {
      const res = await db.query(
        `INSERT INTO crm_object_defs (client_id, vertical_key, key, label, label_plural, icon, has_pipeline, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (client_id, key) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
         RETURNING id`,
        [o.client_id, o.vertical_key, o.key, o.label, o.label_plural, o.icon, o.has_pipeline, o.position],
      )
      const objectDefId = res.rows[0].id as string
      for (const f of plan.fieldsByObjectKey[o.key] ?? []) {
        await db.query(
          `INSERT INTO crm_field_defs (client_id, object_def_id, key, label, field_type, options, relation_target, is_required, is_title, position)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
           ON CONFLICT (object_def_id, key) DO NOTHING`,
          [o.client_id, objectDefId, f.key, f.label, f.field_type, JSON.stringify(f.options ?? []),
            f.relation_target ?? null, f.is_required, f.is_title, f.position],
        )
      }
      for (const s of plan.stagesByObjectKey[o.key] ?? []) {
        // Stage code namespaced by object key so multiple pipeline objects per client don't collide.
        const code = `${o.key}:${s.code}`
        await db.query(
          `INSERT INTO crm_stages (client_id, code, name, probability, sort_order, color, is_won, is_lost)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [s.client_id, code, s.name, s.probability, s.sort_order, s.color, s.is_won, s.is_lost],
        )
      }
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/crm/engine/seedVertical.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire seeding into `verticals/assign.post.ts`**

Modify `server/api/crm/verticals/assign.post.ts` — after the `if (b.enabled) { INSERT ... }` block, call the seeder. Replace the enable branch:

```typescript
  if (b.enabled) {
    await execute(
      `INSERT INTO crm_client_verticals (client_id, vertical_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [b.client_id, b.vertical_key],
    )
    // Instantiate the vertical's object/field/pipeline templates for this client (idempotent).
    const { seedVerticalFromTemplate } = await import('~~/server/utils/crm/engine/seedVertical')
    await seedVerticalFromTemplate(b.client_id, b.vertical_key)
  } else {
```

(Leave the `else` delete branch unchanged.)

- [ ] **Step 6: Run the engine test suite to confirm nothing broke**

Run: `pnpm exec vitest run test/crm`
Expected: PASS (existing 13 + new engine tests).

- [ ] **Step 7: Commit**

```bash
git add server/utils/crm/engine/seedVertical.ts test/crm/engine/seedVertical.test.ts server/api/crm/verticals/assign.post.ts
git commit -m "feat(crm): seedVerticalFromTemplate + wire into vertical assign (TDD)"
```

---

### Task 9: Records CRUD API (agency) with isolation + relation existence check

**Files:**
- Create: `server/api/crm/records/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `[id]/move.patch.ts`
- Create: `server/utils/crm/engine/recordWrite.ts` (shared validate+relation-check helper)

- [ ] **Step 1: Write the shared write helper**

```typescript
// server/utils/crm/engine/recordWrite.ts
// Validates record data against an object's field defs and verifies relation targets
// exist within the same client (the existence check validateRecord intentionally defers).
import { queryRows, queryOne } from '~~/server/utils/db'
import { validateRecord, type ValidatorFieldDef } from './validateRecord'
import type { EngineFieldDef } from './types'

export async function loadFieldDefs(objectDefId: string, clientId: string): Promise<EngineFieldDef[]> {
  return queryRows<EngineFieldDef>(
    `SELECT * FROM crm_field_defs WHERE object_def_id = $1 AND client_id = $2 ORDER BY position`,
    [objectDefId, clientId],
  )
}

export function titleKeys(defs: EngineFieldDef[]): string[] {
  const titles = defs.filter(d => d.is_title).map(d => d.key)
  return titles.length ? titles : defs.slice(0, 1).map(d => d.key) // fall back to first field
}

export async function validateAndCheckRelations(
  defs: EngineFieldDef[],
  clientId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const validatorDefs: ValidatorFieldDef[] = defs.map(d => ({
    key: d.key, field_type: d.field_type, options: d.options, relation_target: d.relation_target, is_required: d.is_required,
  }))
  const clean = validateRecord(validatorDefs, data) // throws on type/required/format

  // Existence-check each relation value within this client.
  for (const d of defs) {
    if (d.field_type !== 'relation' || !d.relation_target) continue
    const val = clean[d.key]
    if (val == null) continue
    const table = d.relation_target === 'person' ? 'crm_people' : 'crm_companies'
    const hit = await queryOne<{ id: string }>(
      `SELECT id FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
      [val, clientId],
    )
    if (!hit) throw createError({ statusCode: 400, statusMessage: `Related ${d.relation_target} not found for field "${d.key}"` })
  }
  return clean
}
```

- [ ] **Step 2: Write `records/index.get.ts`**

```typescript
// server/api/crm/records/index.get.ts — list records of one object (paginated, title search).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { loadFieldDefs, titleKeys } from '~~/server/utils/crm/engine/recordWrite'

const Query = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const obj = await assertObjectVisible(q.client_id, q.objectKey)
  const defs = await loadFieldDefs(obj.id, q.client_id)
  const { where, params } = buildRecordFilter(q.client_id, obj.id, { q: q.q, titleKeys: titleKeys(defs) })
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_records ${where} ORDER BY created_at DESC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_records ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size, object: obj, fields: defs }
})
```

- [ ] **Step 3: Write `records/index.post.ts`**

```typescript
// server/api/crm/records/index.post.ts — create a record (validated against field defs).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { loadFieldDefs, validateAndCheckRelations } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  client_id: z.string().uuid(),
  objectKey: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const obj = await assertObjectVisible(b.client_id, b.objectKey)
  const defs = await loadFieldDefs(obj.id, b.client_id)
  const clean = await validateAndCheckRelations(defs, b.client_id, b.data)
  const row = await queryOne(
    `INSERT INTO crm_records (client_id, object_def_id, data, stage_id, created_by)
     VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
    [b.client_id, obj.id, JSON.stringify(clean), b.stage_id ?? null, user.id],
  )
  return { item: row }
})
```

- [ ] **Step 4: Write `records/[id].get.ts`**

```typescript
// server/api/crm/records/[id].get.ts — fetch one record (client-scoped).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const row = await queryOne(
    `SELECT * FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
```

- [ ] **Step 5: Write `records/[id].patch.ts`**

```typescript
// server/api/crm/records/[id].patch.ts — update a record's data/stage (re-validated).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { loadFieldDefs, validateAndCheckRelations } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  client_id: z.string().uuid(),
  data: z.record(z.string(), z.unknown()).optional(),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const existing = await queryOne<{ object_def_id: string }>(
    `SELECT object_def_id FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, b.client_id],
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })

  const sets: string[] = []
  const params: unknown[] = []
  if (b.data !== undefined) {
    const defs = await loadFieldDefs(existing.object_def_id, b.client_id)
    const clean = await validateAndCheckRelations(defs, b.client_id, b.data)
    params.push(JSON.stringify(clean)); sets.push(`data = $${params.length}::jsonb`)
  }
  if (b.stage_id !== undefined) { params.push(b.stage_id); sets.push(`stage_id = $${params.length}`) }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(b.client_id); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_records SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  return { item: row }
})
```

- [ ] **Step 6: Write `records/[id].delete.ts`**

```typescript
// server/api/crm/records/[id].delete.ts — soft-delete a record.
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
    `UPDATE crm_records SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { ok: true }
})
```

- [ ] **Step 7: Write `records/[id]/move.patch.ts`** (pipeline stage move for config objects)

```typescript
// server/api/crm/records/[id]/move.patch.ts — move a record to a different stage (kanban).
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({ client_id: z.string().uuid(), stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  // Stage must belong to this client (config-object stages are always per-client).
  const stage = await queryOne<{ id: string }>(
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [b.stage_id, b.client_id],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const row = await queryOne(
    `UPDATE crm_records SET stage_id = $1, updated_at = NOW()
      WHERE id = $2 AND client_id = $3 AND deleted_at IS NULL RETURNING *`,
    [b.stage_id, id, b.client_id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
```

- [ ] **Step 8: Commit**

```bash
git add server/utils/crm/engine/recordWrite.ts server/api/crm/records/
git commit -m "feat(crm): records CRUD API + move, with isolation + relation existence checks"
```

---

### Task 10: Portal mirror (records read/write + read-only defs)

**Files:**
- Create: `server/api/client-portal/crm/object-defs/index.get.ts`
- Create: `server/api/client-portal/crm/records/index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `[id]/move.patch.ts`

- [ ] **Step 1: Write `client-portal/crm/object-defs/index.get.ts`** (read-only; clients can't define)

```typescript
// server/api/client-portal/crm/object-defs/index.get.ts — config objects visible to this client.
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { resolveClientObjects } from '~~/server/utils/crm/engine/resolveObjects'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  return { items: await resolveClientObjects(client.clientId) }
})
```

- [ ] **Step 2: Write `client-portal/crm/records/index.get.ts`**

```typescript
// server/api/client-portal/crm/records/index.get.ts — session-scoped record list.
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows, queryCount } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { buildRecordFilter } from '~~/server/utils/crm/engine/recordFilter'
import { loadFieldDefs, titleKeys } from '~~/server/utils/crm/engine/recordWrite'

const Query = z.object({
  objectKey: z.string().min(1),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const obj = await assertObjectVisible(client.clientId, q.objectKey)
  const defs = await loadFieldDefs(obj.id, client.clientId)
  const { where, params } = buildRecordFilter(client.clientId, obj.id, { q: q.q, titleKeys: titleKeys(defs) })
  const offset = (q.page - 1) * q.page_size
  const items = await queryRows(
    `SELECT * FROM crm_records ${where} ORDER BY created_at DESC LIMIT ${q.page_size} OFFSET ${offset}`,
    params,
  )
  const total = await queryCount(`SELECT COUNT(*)::text AS count FROM crm_records ${where}`, params)
  return { items, total, page: q.page, page_size: q.page_size, object: obj, fields: defs }
})
```

- [ ] **Step 3: Write `client-portal/crm/records/index.post.ts`**

```typescript
// server/api/client-portal/crm/records/index.post.ts — create a record (client-scoped).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { assertObjectVisible } from '~~/server/utils/crm/engine/resolveObjects'
import { loadFieldDefs, validateAndCheckRelations } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  objectKey: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const obj = await assertObjectVisible(client.clientId, b.objectKey)
  const defs = await loadFieldDefs(obj.id, client.clientId)
  const clean = await validateAndCheckRelations(defs, client.clientId, b.data)
  const row = await queryOne(
    `INSERT INTO crm_records (client_id, object_def_id, data, stage_id)
     VALUES ($1,$2,$3::jsonb,$4) RETURNING *`,
    [client.clientId, obj.id, JSON.stringify(clean), b.stage_id ?? null],
  )
  return { item: row }
})
```

- [ ] **Step 4: Write `client-portal/crm/records/[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`, `[id]/move.patch.ts`**

These mirror the agency `records/[id].*` handlers verbatim except: replace `requireAuth`/`requireWriteAccess` with `const client = await requireClientAuth(event)`, drop the `client_id` from Query/Body, and use `client.clientId` everywhere a `client_id` was read.

`[id].get.ts`:
```typescript
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const row = await queryOne(
    `SELECT * FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
```

`[id].patch.ts`:
```typescript
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'
import { loadFieldDefs, validateAndCheckRelations } from '~~/server/utils/crm/engine/recordWrite'

const Body = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  stage_id: z.string().uuid().nullable().optional(),
})

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  const existing = await queryOne<{ object_def_id: string }>(
    `SELECT object_def_id FROM crm_records WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  const sets: string[] = []
  const params: unknown[] = []
  if (b.data !== undefined) {
    const defs = await loadFieldDefs(existing.object_def_id, client.clientId)
    const clean = await validateAndCheckRelations(defs, client.clientId, b.data)
    params.push(JSON.stringify(clean)); sets.push(`data = $${params.length}::jsonb`)
  }
  if (b.stage_id !== undefined) { params.push(b.stage_id); sets.push(`stage_id = $${params.length}`) }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  sets.push('updated_at = NOW()')
  params.push(id); const idIdx = params.length
  params.push(client.clientId); const clientIdx = params.length
  const row = await queryOne(
    `UPDATE crm_records SET ${sets.join(', ')} WHERE id = $${idIdx} AND client_id = $${clientIdx} AND deleted_at IS NULL RETURNING *`,
    params,
  )
  return { item: row }
})
```

`[id].delete.ts`:
```typescript
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const n = await execute(
    `UPDATE crm_records SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client.clientId],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { ok: true }
})
```

`[id]/move.patch.ts`:
```typescript
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryOne } from '~~/server/utils/db'

const Body = z.object({ stage_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  const client = await requireClientAuth(event)
  const id = getRouterParam(event, 'id')
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const stage = await queryOne<{ id: string }>(
    `SELECT id FROM crm_stages WHERE id = $1 AND client_id = $2`,
    [parsed.data.stage_id, client.clientId],
  )
  if (!stage) throw createError({ statusCode: 400, statusMessage: 'Invalid stage' })
  const row = await queryOne(
    `UPDATE crm_records SET stage_id = $1, updated_at = NOW() WHERE id = $2 AND client_id = $3 AND deleted_at IS NULL RETURNING *`,
    [parsed.data.stage_id, id, client.clientId],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Record not found' })
  return { item: row }
})
```

- [ ] **Step 5: Commit**

```bash
git add server/api/client-portal/crm/object-defs/ server/api/client-portal/crm/records/
git commit -m "feat(crm): client-portal mirror — records CRUD + read-only object defs"
```

---

### Task 11: Live isolation smoke test (manual, dev DB)

**Files:** none (verification task)

- [ ] **Step 1: Start the dev server cleanly**

Run: `pnpm dev` (note the port — use a free one, e.g. `PORT=3100 pnpm dev` if 3000 is taken by a parallel session).
Expected: server boots without EMFILE.

- [ ] **Step 2: Confirm definition endpoints reject without auth**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3100/api/crm/object-defs -H 'content-type: application/json' -d '{}'`
Expected: `401`.

- [ ] **Step 3: Confirm records endpoint rejects an unknown object key**

(With a valid dev session cookie if available; otherwise this returns 401 first — acceptable. The full path is exercised by the UI in B4.)
Run: `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3100/api/crm/records?client_id=<uuid>&objectKey=does_not_exist"`
Expected: `401` (no session) or `404` (with session) — never `500`.

- [ ] **Step 4: No commit** (verification only). Record findings in the PR description.

---

## SLICE B3 — Config designer UI (agency-only)

### Task 12: Field-control mapping + composables

**Files:**
- Create: `app/utils/crmFieldControls.ts`
- Create: `app/composables/useCrmObjectDefs.ts`, `app/composables/useCrmFieldDefs.ts`
- Modify: `app/types/crm.ts` (append engine types)

- [ ] **Step 1: Append engine types to `app/types/crm.ts`**

```typescript
// --- Custom-objects engine (Phase B) ---
export interface CrmObjectDef {
  id: string
  client_id: string
  vertical_key: string
  key: string
  label: string
  label_plural: string
  icon: string | null
  has_pipeline: boolean
  position: number
}

export interface CrmFieldDef {
  id: string
  client_id: string
  object_def_id: string
  key: string
  label: string
  field_type: string
  options: string[]
  relation_target: 'person' | 'company' | null
  is_required: boolean
  is_title: boolean
  position: number
}

export interface CrmRecord {
  id: string
  client_id: string
  object_def_id: string
  data: Record<string, unknown>
  stage_id: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Write the field-control mapping**

```typescript
// app/utils/crmFieldControls.ts
// Maps a field_type to the Nuxt UI control used to render/edit it. Shared by RecordForm
// (input) and RecordsTable (display formatting) so they never drift.

export type CrmControl = 'input' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date' | 'tags' | 'relation' | 'rating'

export function controlForFieldType(t: string): CrmControl {
  switch (t) {
    case 'long_text': return 'textarea'
    case 'number':
    case 'currency': return 'number'
    case 'rating': return 'rating'
    case 'dropdown':
    case 'status': return 'select'
    case 'checkbox': return 'checkbox'
    case 'date': return 'date'
    case 'tags': return 'tags'
    case 'relation': return 'relation'
    default: return 'input' // text, email, phone, link, location
  }
}

export function formatCell(t: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (t === 'currency') return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(v))
  if (t === 'checkbox') return v ? 'Yes' : 'No'
  if (t === 'tags' && Array.isArray(v)) return v.join(', ')
  return String(v)
}
```

- [ ] **Step 3: Write `useCrmObjectDefs.ts`**

```typescript
// app/composables/useCrmObjectDefs.ts
import type { CrmObjectDef } from '~/types/crm'

export function useCrmObjectDefs(clientId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const { data, refresh } = useFetch<{ items: CrmObjectDef[] }>(`${base}/object-defs`, {
    query, watch: [query], immediate: false, default: () => ({ items: [] }),
  })
  watch(clientId, (v) => { if (v) refresh() }, { immediate: true })

  async function create(body: Partial<CrmObjectDef>) {
    await $fetch(`${base}/object-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(id: string, body: Partial<CrmObjectDef>) {
    await $fetch(`${base}/object-defs/${id}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/object-defs/${id}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { objects: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
```

- [ ] **Step 4: Write `useCrmFieldDefs.ts`**

```typescript
// app/composables/useCrmFieldDefs.ts
import type { CrmFieldDef } from '~/types/crm'

export function useCrmFieldDefs(clientId: Ref<string | null>, objectDefId: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const query = computed(() => ({ client_id: clientId.value ?? '' }))
  const url = computed(() => `${base}/object-defs/${objectDefId.value}/field-defs`)
  const { data, refresh } = useFetch<{ items: CrmFieldDef[] }>(url, {
    query, watch: [query, objectDefId], immediate: false, default: () => ({ items: [] }),
  })
  watch([clientId, objectDefId], ([c, o]) => { if (c && o) refresh() }, { immediate: true })

  async function create(body: Partial<CrmFieldDef>) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs`, { method: 'POST', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function update(fid: string, body: Partial<CrmFieldDef>) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'PATCH', body: { ...body, client_id: clientId.value } })
    await refresh()
  }
  async function remove(fid: string) {
    await $fetch(`${base}/object-defs/${objectDefId.value}/field-defs/${fid}`, { method: 'DELETE', query: { client_id: clientId.value } })
    await refresh()
  }
  return { fields: computed(() => data.value?.items ?? []), refresh, create, update, remove }
}
```

- [ ] **Step 5: Commit**

```bash
git add app/utils/crmFieldControls.ts app/composables/useCrmObjectDefs.ts app/composables/useCrmFieldDefs.ts app/types/crm.ts
git commit -m "feat(crm): engine types + field-control map + object/field-def composables"
```

---

### Task 13: Designer UI components (ObjectDefManager + FieldDefManager)

**Files:**
- Create: `app/components/crm/ObjectDefManager.vue`, `app/components/crm/FieldDefManager.vue`

> **Before writing these forms, invoke the `frontend-design` skill** (mandatory per CLAUDE.md) and apply its typography/hierarchy/spacing principles. Wrap every field in `UFormField`; use `USelectMenu`/`USelect` (never raw `<select>`), `UInput`, `UCheckbox`, `UButton`. No empty `USelectMenu` values.

- [ ] **Step 1: Write `FieldDefManager.vue`** (models the shipped `CustomFieldsManager.vue` pattern, extended)

```vue
<script setup lang="ts">
import { controlForFieldType } from '~/utils/crmFieldControls'
const props = defineProps<{ clientId: string, objectDefId: string }>()
const clientId = toRef(props, 'clientId')
const objectDefId = toRef(props, 'objectDefId')
const { fields, create, update, remove } = useCrmFieldDefs(clientId, objectDefId)
const toast = useToast()

const TYPES = ['text', 'long_text', 'number', 'currency', 'date', 'status', 'dropdown', 'checkbox', 'rating', 'link', 'email', 'phone', 'location', 'tags', 'relation']
const draft = reactive({ key: '', label: '', field_type: 'text', options: '', relation_target: 'person', is_required: false, is_title: false })
const saving = ref(false)
const needsOptions = computed(() => draft.field_type === 'dropdown' || draft.field_type === 'status')
const isRelation = computed(() => draft.field_type === 'relation')

async function add() {
  if (!draft.key.trim() || !draft.label.trim()) return
  if (!/^[a-z0-9_]+$/.test(draft.key)) {
    toast.add({ title: 'Invalid key', description: 'Use lowercase letters, numbers and underscores only.', color: 'error' })
    return
  }
  saving.value = true
  try {
    await create({
      key: draft.key,
      label: draft.label,
      field_type: draft.field_type,
      options: needsOptions.value && draft.options ? draft.options.split(',').map(s => s.trim()).filter(Boolean) : [],
      relation_target: isRelation.value ? (draft.relation_target as 'person' | 'company') : null,
      is_required: draft.is_required,
      is_title: draft.is_title,
    })
    Object.assign(draft, { key: '', label: '', field_type: 'text', options: '', relation_target: 'person', is_required: false, is_title: false })
  } catch (e: any) {
    toast.add({ title: 'Could not add field', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
async function onRemove(id: string) {
  try { await remove(id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-4">
    <ul class="divide-y divide-default rounded-lg border border-default">
      <li v-for="f in fields" :key="f.id" class="flex items-center justify-between px-3 py-2">
        <span>
          <span class="font-medium">{{ f.label }}</span>
          <span class="text-xs text-muted ml-1">({{ f.field_type }}<template v-if="f.relation_target"> → {{ f.relation_target }}</template> · {{ f.key }})</span>
          <UBadge v-if="f.is_title" size="xs" class="ml-2" color="primary" variant="subtle">title</UBadge>
          <UBadge v-if="f.is_required" size="xs" class="ml-1" color="warning" variant="subtle">required</UBadge>
        </span>
        <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="onRemove(f.id)" />
      </li>
      <li v-if="!fields.length" class="px-3 py-3 text-sm text-muted">No fields yet.</li>
    </ul>

    <div class="border-t border-default pt-4 grid grid-cols-2 gap-4">
      <UFormField label="Key"><UInput v-model="draft.key" placeholder="sku" /></UFormField>
      <UFormField label="Label"><UInput v-model="draft.label" placeholder="SKU" /></UFormField>
      <UFormField label="Type"><USelectMenu v-model="draft.field_type" :items="TYPES" /></UFormField>
      <UFormField v-if="needsOptions" label="Options (comma-separated)"><UInput v-model="draft.options" placeholder="a,b,c" /></UFormField>
      <UFormField v-if="isRelation" label="Relates to"><USelectMenu v-model="draft.relation_target" :items="['person', 'company']" /></UFormField>
      <div class="flex items-center gap-4 col-span-2">
        <UCheckbox v-model="draft.is_title" label="Title field" />
        <UCheckbox v-model="draft.is_required" label="Required" />
        <UButton class="ml-auto" :loading="saving" :disabled="!draft.key || !draft.label" @click="add">Add field</UButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Write `ObjectDefManager.vue`** (lists objects, create object, embeds FieldDefManager per object)

```vue
<script setup lang="ts">
const props = defineProps<{ clientId: string, verticalKey: string }>()
const clientId = toRef(props, 'clientId')
const { objects, create, remove } = useCrmObjectDefs(clientId)
const toast = useToast()

const verticalObjects = computed(() => objects.value.filter(o => o.vertical_key === props.verticalKey))
const draft = reactive({ key: '', label: '', label_plural: '', icon: 'i-lucide-box', has_pipeline: false })
const saving = ref(false)
const expanded = ref<string | null>(null)

async function add() {
  if (!draft.key.trim() || !draft.label.trim()) return
  if (!/^[a-z0-9_]+$/.test(draft.key)) {
    toast.add({ title: 'Invalid key', description: 'lowercase/numbers/underscores only', color: 'error' })
    return
  }
  saving.value = true
  try {
    await create({
      key: draft.key, label: draft.label,
      label_plural: draft.label_plural || draft.label + 's',
      icon: draft.icon, has_pipeline: draft.has_pipeline,
      vertical_key: props.verticalKey,
    } as any)
    Object.assign(draft, { key: '', label: '', label_plural: '', icon: 'i-lucide-box', has_pipeline: false })
  } catch (e: any) {
    toast.add({ title: 'Could not add object', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-5">
    <div v-for="o in verticalObjects" :key="o.id" class="rounded-lg border border-default">
      <div class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-2">
          <UIcon :name="o.icon || 'i-lucide-box'" class="size-4 text-muted" />
          <span class="font-medium">{{ o.label_plural }}</span>
          <span class="text-xs text-muted">({{ o.key }})</span>
          <UBadge v-if="o.has_pipeline" size="xs" variant="subtle" color="primary">pipeline</UBadge>
        </div>
        <div class="flex items-center gap-1">
          <UButton size="xs" variant="ghost" :icon="expanded === o.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" @click="expanded = expanded === o.id ? null : o.id" />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(o.id)" />
        </div>
      </div>
      <div v-if="expanded === o.id" class="border-t border-default p-4">
        <CrmFieldDefManager :client-id="clientId" :object-def-id="o.id" />
      </div>
    </div>
    <p v-if="!verticalObjects.length" class="text-sm text-muted">No objects defined for this vertical yet.</p>

    <div class="border-t border-default pt-4 grid grid-cols-2 gap-4">
      <UFormField label="Key"><UInput v-model="draft.key" placeholder="product" /></UFormField>
      <UFormField label="Label"><UInput v-model="draft.label" placeholder="Product" /></UFormField>
      <UFormField label="Plural"><UInput v-model="draft.label_plural" placeholder="Products" /></UFormField>
      <UFormField label="Icon (lucide)"><UInput v-model="draft.icon" placeholder="i-lucide-package" /></UFormField>
      <div class="flex items-center gap-4 col-span-2">
        <UCheckbox v-model="draft.has_pipeline" label="Has pipeline" />
        <UButton class="ml-auto" :loading="saving" :disabled="!draft.key || !draft.label" @click="add">Add object</UButton>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Manual check — components compile**

Run: `pnpm exec nuxt prepare` then `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i 'crm/ObjectDef\|crm/FieldDef' || echo "no new errors in these files"`
Expected: no new errors referencing the two new components.

- [ ] **Step 4: Commit**

```bash
git add app/components/crm/ObjectDefManager.vue app/components/crm/FieldDefManager.vue
git commit -m "feat(crm): config designer UI — ObjectDefManager + FieldDefManager"
```

---

## SLICE B4 — Generic record UI + Retail proof

### Task 14: `useCrmRecords` composable + RecordForm

**Files:**
- Create: `app/composables/useCrmRecords.ts`, `app/components/crm/RecordForm.vue`

- [ ] **Step 1: Write `useCrmRecords.ts`**

```typescript
// app/composables/useCrmRecords.ts
import type { CrmRecord, CrmFieldDef, CrmObjectDef, CrmListResponse } from '~/types/crm'

interface RecordsResponse extends CrmListResponse<CrmRecord> {
  object: CrmObjectDef
  fields: CrmFieldDef[]
}

export function useCrmRecords(clientId: Ref<string | null>, objectKey: Ref<string | null>) {
  const base = inject<string>('crmApiBase', '/api/crm')
  const isPortal = base.includes('client-portal')
  const search = ref('')
  const page = ref(1)
  const query = computed(() => {
    const p: Record<string, string> = { objectKey: objectKey.value ?? '', page: String(page.value), page_size: '50' }
    if (!isPortal && clientId.value) p.client_id = clientId.value
    if (search.value.trim()) p.q = search.value.trim()
    return p
  })
  const { data, pending, refresh } = useFetch<RecordsResponse>(`${base}/records`, {
    query, watch: [query], immediate: false,
    default: () => ({ items: [], total: 0, page: 1, page_size: 50, object: null as any, fields: [] }),
  })
  watch([clientId, objectKey], ([c, o]) => { if ((isPortal || c) && o) refresh() }, { immediate: true })

  function withClient(body: Record<string, unknown>) {
    return isPortal ? body : { ...body, client_id: clientId.value }
  }
  async function create(data: Record<string, unknown>, stage_id?: string | null) {
    await $fetch(`${base}/records`, { method: 'POST', body: withClient({ objectKey: objectKey.value, data, stage_id }) })
    await refresh()
  }
  async function update(id: string, data: Record<string, unknown>, stage_id?: string | null) {
    await $fetch(`${base}/records/${id}`, { method: 'PATCH', body: withClient({ data, ...(stage_id !== undefined ? { stage_id } : {}) }) })
    await refresh()
  }
  async function remove(id: string) {
    await $fetch(`${base}/records/${id}`, { method: 'DELETE', query: isPortal ? {} : { client_id: clientId.value } })
    await refresh()
  }
  async function move(id: string, stage_id: string) {
    await $fetch(`${base}/records/${id}/move`, { method: 'PATCH', body: withClient({ stage_id }) })
    await refresh()
  }
  return { data, pending, refresh, search, page, create, update, remove, move }
}
```

- [ ] **Step 2: Write `RecordForm.vue`** (renders inputs from field defs)

> Invoke the `frontend-design` skill before finalizing this form. Date fields MUST use the `UPopover`+`UCalendar` pattern (see `app/components/workflow/TaskCreateDialog.vue` for the canonical `toCalendarDate()` helper) — never `<UInput type="date">`.

```vue
<script setup lang="ts">
import { controlForFieldType } from '~/utils/crmFieldControls'
import type { CrmFieldDef } from '~/types/crm'
const props = defineProps<{ fields: CrmFieldDef[], modelValue: Record<string, unknown>, clientId: string }>()
const emit = defineEmits<{ 'update:modelValue': [Record<string, unknown>] }>()

const local = reactive<Record<string, unknown>>({ ...props.modelValue })
watch(local, () => emit('update:modelValue', { ...local }), { deep: true })

// Relation pickers: load people/companies for this client on demand.
const base = inject<string>('crmApiBase', '/api/crm')
const isPortal = base.includes('client-portal')
function relationOptions(target: 'person' | 'company') {
  const url = target === 'person' ? `${base}/people` : `${base}/companies`
  const q = isPortal ? {} : { client_id: props.clientId, page_size: '200' }
  return useFetch<{ items: any[] }>(url, { query: q, default: () => ({ items: [] }) })
}
</script>

<template>
  <div class="grid grid-cols-2 gap-4">
    <UFormField v-for="f in fields" :key="f.id" :label="f.label" :required="f.is_required">
      <UTextarea v-if="controlForFieldType(f.field_type) === 'textarea'" v-model="local[f.key] as string" :rows="4" />
      <UInput v-else-if="controlForFieldType(f.field_type) === 'number'" v-model.number="local[f.key] as number" type="number" />
      <UCheckbox v-else-if="controlForFieldType(f.field_type) === 'checkbox'" v-model="local[f.key] as boolean" />
      <USelectMenu v-else-if="controlForFieldType(f.field_type) === 'select'" v-model="local[f.key] as string" :items="f.options" />
      <CrmRelationPicker v-else-if="controlForFieldType(f.field_type) === 'relation'" v-model="local[f.key] as string" :target="f.relation_target!" :client-id="clientId" />
      <UInput v-else v-model="local[f.key] as string" />
    </UFormField>
  </div>
</template>
```

> Note: `CrmRelationPicker` is a small wrapper added in the next step to keep this form declarative. If time-constrained, inline a `USelectMenu` bound to `relationOptions(...).data.items` mapped to `{label: name, value: id}` instead.

- [ ] **Step 3: Write `app/components/crm/RelationPicker.vue`**

```vue
<script setup lang="ts">
const props = defineProps<{ modelValue: string | null, target: 'person' | 'company', clientId: string }>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()
const base = inject<string>('crmApiBase', '/api/crm')
const isPortal = base.includes('client-portal')
const url = computed(() => props.target === 'person' ? `${base}/people` : `${base}/companies`)
const query = computed(() => isPortal ? { page_size: '200' } : { client_id: props.clientId, page_size: '200' })
const { data } = useFetch<{ items: any[] }>(url, { query, default: () => ({ items: [] }) })
const options = computed(() => (data.value?.items ?? []).map((r: any) => ({
  label: props.target === 'person' ? [r.first_name, r.last_name].filter(Boolean).join(' ') : r.name,
  value: r.id,
})))
const model = computed({
  get: () => props.modelValue ?? undefined,
  set: v => emit('update:modelValue', (v as string) ?? null),
})
</script>

<template>
  <USelectMenu v-model="model" :items="options" value-key="value" placeholder="Select…" />
</template>
```

- [ ] **Step 4: Commit**

```bash
git add app/composables/useCrmRecords.ts app/components/crm/RecordForm.vue app/components/crm/RelationPicker.vue
git commit -m "feat(crm): useCrmRecords + RecordForm + RelationPicker"
```

---

### Task 15: RecordsTable + RecordSlideover + RecordPipelineBoard

**Files:**
- Create: `app/components/crm/RecordsTable.vue`, `app/components/crm/RecordSlideover.vue`, `app/components/crm/RecordPipelineBoard.vue`

- [ ] **Step 1: Write `RecordSlideover.vue`** (create/edit a record)

```vue
<script setup lang="ts">
import type { CrmFieldDef } from '~/types/crm'
const props = defineProps<{ open: boolean, fields: CrmFieldDef[], clientId: string, record?: Record<string, unknown> | null }>()
const emit = defineEmits<{ 'update:open': [boolean], save: [Record<string, unknown>] }>()
const form = ref<Record<string, unknown>>({ ...(props.record ?? {}) })
watch(() => props.record, r => { form.value = { ...(r ?? {}) } })
</script>

<template>
  <USlideover :open="open" :title="record ? 'Edit record' : 'New record'" @update:open="emit('update:open', $event)">
    <template #body>
      <CrmRecordForm v-model="form" :fields="fields" :client-id="clientId" />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" @click="emit('update:open', false)">Cancel</UButton>
        <UButton @click="emit('save', form)">Save</UButton>
      </div>
    </template>
  </USlideover>
</template>
```

- [ ] **Step 2: Write `RecordsTable.vue`** (list + new/edit/delete; uses UTable v4 accessorKey)

```vue
<script setup lang="ts">
import { formatCell } from '~/utils/crmFieldControls'
import type { CrmFieldDef } from '~/types/crm'
const props = defineProps<{ clientId: string, objectKey: string }>()
const clientId = toRef(props, 'clientId')
const objectKey = toRef(props, 'objectKey')
const { data, pending, search, create, update, remove } = useCrmRecords(clientId, objectKey)
const toast = useToast()

const fields = computed<CrmFieldDef[]>(() => data.value?.fields ?? [])
const columns = computed(() => [
  ...fields.value.slice(0, 5).map(f => ({ accessorKey: f.key, header: f.label })),
  { accessorKey: 'actions', header: '' },
])
const rows = computed(() => (data.value?.items ?? []).map(r => ({ ...r.data, __id: r.id, __raw: r })))

const slideoverOpen = ref(false)
const editing = ref<Record<string, unknown> | null>(null)
const editingId = ref<string | null>(null)
function openNew() { editing.value = {}; editingId.value = null; slideoverOpen.value = true }
function openEdit(row: any) { editing.value = { ...row.__raw.data }; editingId.value = row.__id; slideoverOpen.value = true }
async function onSave(form: Record<string, unknown>) {
  try {
    if (editingId.value) await update(editingId.value, form)
    else await create(form)
    slideoverOpen.value = false
  } catch (e: any) { toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
async function onDelete(row: any) {
  try { await remove(row.__id) }
  catch (e: any) { toast.add({ title: 'Delete failed', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between gap-3">
      <UInput v-model="search" placeholder="Search…" icon="i-lucide-search" class="w-64" />
      <UButton icon="i-lucide-plus" @click="openNew">New</UButton>
    </div>
    <UTable :data="rows" :columns="columns" :loading="pending">
      <template v-for="f in fields.slice(0, 5)" :key="f.key" #[`${f.key}-cell`]="{ row }">
        {{ formatCell(f.field_type, row.original[f.key]) }}
      </template>
      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-1">
          <UButton size="xs" variant="ghost" icon="i-lucide-pencil" @click="openEdit(row.original)" />
          <UButton size="xs" variant="ghost" color="error" icon="i-lucide-trash-2" @click="onDelete(row.original)" />
        </div>
      </template>
    </UTable>
    <CrmRecordSlideover v-model:open="slideoverOpen" :fields="fields" :client-id="clientId" :record="editing" @save="onSave" />
  </div>
</template>
```

- [ ] **Step 3: Write `RecordPipelineBoard.vue`** (kanban for pipeline objects — models `PipelineBoard.vue`)

```vue
<script setup lang="ts">
import type { CrmStage } from '~/types/crm'
const props = defineProps<{ clientId: string, objectKey: string }>()
const clientId = toRef(props, 'clientId')
const objectKey = toRef(props, 'objectKey')
const base = inject<string>('crmApiBase', '/api/crm')
const isPortal = base.includes('client-portal')
const { data, move, refresh } = useCrmRecords(clientId, objectKey)

// Stages for this client (config-object stages are per-client, code-prefixed objectKey:).
const stageQuery = computed(() => isPortal ? {} : { client_id: clientId.value })
const { data: stagesData } = useFetch<{ items?: CrmStage[] } | CrmStage[]>(`${base}/stages`, { query: stageQuery, default: () => ({ items: [] }) })
const stages = computed<CrmStage[]>(() => {
  const all = Array.isArray(stagesData.value) ? stagesData.value : (stagesData.value?.items ?? [])
  return all.filter(s => s.code.startsWith(`${objectKey.value}:`)).sort((a, b) => a.sort_order - b.sort_order)
})
const recordsByStage = computed(() => {
  const map: Record<string, any[]> = {}
  for (const s of stages.value) map[s.id] = []
  for (const r of data.value?.items ?? []) { if (r.stage_id && map[r.stage_id]) map[r.stage_id].push(r) }
  return map
})
async function onDrop(recordId: string, stageId: string) { await move(recordId, stageId); await refresh() }
function titleOf(r: any) {
  const titleField = (data.value?.fields ?? []).find(f => f.is_title)
  return titleField ? String(r.data[titleField.key] ?? '—') : (r.id as string).slice(0, 8)
}
</script>

<template>
  <div class="flex gap-3 overflow-x-auto pb-3">
    <div v-for="s in stages" :key="s.id" class="min-w-64 flex-1 rounded-lg border border-default bg-elevated/30"
         @dragover.prevent @drop="(e) => onDrop(e.dataTransfer!.getData('id'), s.id)">
      <div class="px-3 py-2 border-b border-default flex items-center gap-2">
        <span class="size-2 rounded-full" :style="{ background: s.color }" />
        <span class="font-medium text-sm">{{ s.name }}</span>
        <span class="text-xs text-muted ml-auto">{{ recordsByStage[s.id]?.length || 0 }}</span>
      </div>
      <div class="p-2 space-y-2 min-h-24">
        <div v-for="r in recordsByStage[s.id]" :key="r.id" draggable="true"
             class="rounded-md border border-default bg-default p-2 text-sm cursor-grab"
             @dragstart="(e) => e.dataTransfer!.setData('id', r.id)">
          {{ titleOf(r) }}
        </div>
      </div>
    </div>
    <p v-if="!stages.length" class="text-sm text-muted p-4">No pipeline stages for this object.</p>
  </div>
</template>
```

- [ ] **Step 4: Commit**

```bash
git add app/components/crm/RecordsTable.vue app/components/crm/RecordSlideover.vue app/components/crm/RecordPipelineBoard.vue
git commit -m "feat(crm): generic record UI — table, slideover, pipeline board"
```

---

### Task 16: Wire designer + dynamic object tabs into agency + portal pages

**Files:**
- Modify: `app/pages/agency/crm/index.vue`
- Modify: `app/pages/portal/crm.vue`

- [ ] **Step 1: Add a "Custom Objects" designer tab + dynamic object tabs to `app/pages/agency/crm/index.vue`**

In `<script setup>`, after the existing `tabItems`, add object-def loading and a combined tab list:
```typescript
import type { CrmObjectDef } from '~/types/crm'
const { objects } = useCrmObjectDefs(clientId)
// enabled verticals for the active client (to drive the designer)
const { data: verticalsData } = await useFetch<{ enabled: string[] }>('/api/crm/verticals', {
  query: computed(() => ({ client_id: clientId.value ?? '' })), watch: [clientId], default: () => ({ enabled: ['generic'] }),
})
const configVerticals = computed(() => (verticalsData.value?.enabled ?? []).filter(v => v !== 'generic'))

const allTabs = computed(() => [
  ...tabItems,
  ...objects.value.map(o => ({ label: o.label_plural, value: `obj:${o.key}`, icon: o.icon || 'i-lucide-box' })),
  { label: 'Custom Objects', value: 'designer', icon: 'i-lucide-settings-2' },
])
const activeObject = computed<CrmObjectDef | null>(() => {
  if (!tab.value.startsWith('obj:')) return null
  return objects.value.find(o => `obj:${o.key}` === tab.value) ?? null
})
```
Change `const tab = ref<...>('people')` to `const tab = ref<string>('people')` and replace `:items="tabItems"` with `:items="allTabs"`.

In `<template>`, after the existing `CrmPipelineBoard` line, add:
```vue
      <template v-else-if="tab === 'designer'">
        <div v-if="!configVerticals.length" class="text-sm text-muted">
          Assign a config vertical to this client to define custom objects.
        </div>
        <div v-for="vk in configVerticals" :key="vk" class="space-y-2">
          <h3 class="text-sm font-semibold capitalize">{{ vk }}</h3>
          <CrmObjectDefManager :client-id="clientId" :vertical-key="vk" />
        </div>
      </template>
      <template v-else-if="activeObject">
        <CrmRecordPipelineBoard v-if="activeObject.has_pipeline" :client-id="clientId" :object-key="activeObject.key" />
        <CrmRecordsTable v-else :client-id="clientId" :object-key="activeObject.key" />
      </template>
```

- [ ] **Step 2: Surface config objects in `app/pages/portal/crm.vue`**

Mirror the same dynamic-tab approach, but: omit the "Custom Objects" designer tab (portal can't define), use `provide('crmApiBase', '/api/client-portal/crm')` (already present), and drive tabs from `useCrmObjectDefs` (which calls the portal object-defs endpoint via the injected base). Add object tabs + the same `activeObject` record-surface block. (No `client_id` prop needed in portal — but the components accept `clientId`; pass the portal client id if the page already has it, else pass an empty string since portal endpoints ignore it.)

```typescript
// in portal/crm.vue <script setup>
const portalClientId = ref('') // portal endpoints derive client from session; components accept it but ignore via isPortal
const { objects } = useCrmObjectDefs(portalClientId)
```
Render object tabs exactly like agency, using `CrmRecordsTable` / `CrmRecordPipelineBoard` with `:client-id="portalClientId"`.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec nuxt prepare && NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tail -20`
Expected: no NEW errors referencing CRM engine files (pre-existing ~60 errors from `index.d.ts` are acceptable).

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/crm/index.vue app/pages/portal/crm.vue
git commit -m "feat(crm): wire designer + dynamic config-object tabs into agency + portal CRM"
```

---

### Task 17: End-to-end Retail proof (manual UAT)

**Files:** none (verification)

- [ ] **Step 1: Run the engine + crm test suite**

Run: `pnpm exec vitest run test/crm`
Expected: all PASS (existing 13 + new engine tests: validateRecord 6, recordFilter 3, resolveObjects 3, seedVertical 2, schemas 3).

- [ ] **Step 2: Assign Retail to a test client and confirm seeding**

With the dev server running and an admin session, in `/agency/crm`: pick a client, then (via the verticals UI or a curl POST to `/api/crm/verticals/assign` with `{client_id, vertical_key:'retail', enabled:true}`), enable Retail.
Verify in DB:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "SELECT key, label_plural, has_pipeline FROM crm_object_defs WHERE client_id='<uuid>' ORDER BY position;"
psql "$DATABASE_URL" -c "SELECT code,name FROM crm_stages WHERE client_id='<uuid>' AND code LIKE 'order:%' ORDER BY sort_order;"
```
Expected: `product`/`order` object defs; `order:new/paid/fulfilled/cancelled` stages.

- [ ] **Step 2b: Browser eyeball (if Chrome extension available)**

In `/agency/crm` for that client: confirm new **Products** and **Orders** tabs appear. Create a Product (name/sku/price/category/stock). Create an Order, pick a Customer via the relation picker (a person must exist for the client), set a total, drag it across the order pipeline. Confirm it persists on refresh.

- [ ] **Step 3: Two-axis isolation check**

For a SECOND client without Retail enabled: confirm `/api/crm/records?client_id=<client2>&objectKey=product` returns `404` (object not visible), and that client2's `/agency/crm` shows no Products/Orders tabs.

- [ ] **Step 4: No commit** — record UAT results in the PR description; open follow-up issues for any gaps.

---

## Self-Review

**Spec coverage:**
- §4 data model (4 tables) → Task 1 ✓ (note: `crm_pipeline_templates` renamed `crm_object_templates`, documented inline)
- §5 API (defs agency-only, records agency+portal, portal mirror, isolation gate) → Tasks 5, 6, 9, 10 ✓
- §6 server utils (validateRecord, buildRecordFilter, resolveClientObjects, seedVerticalFromTemplate) → Tasks 3, 4, 7, 8 ✓
- §7 UI (designer, generic record surfaces, field_type→control, provide/inject, frontend-design skill) → Tasks 12–16 ✓
- §8 Retail proof → Task 1 seed + Task 17 UAT ✓
- §9 risks (GIN index, relation validate-on-write, isolation gate+tests, field_type→control single map, mig 140) → Tasks 1, 9, 7, 12 ✓
- §10 slices B1–B4 → mapped to Tasks 1–6 / 7–11 / 12–13 / 14–17 ✓
- §11 success criteria → Task 17 UAT steps ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every code step has full code. (Task 16 step 2 describes portal edits parallel to agency step 1; full agency code is given and the portal delta is explicit.)

**Type consistency:** `field_type` list identical across migration CHECK, `FIELD_TYPES`, `FieldDefCreate` Zod, `controlForFieldType`. `ValidatorFieldDef` (validateRecord) vs `EngineFieldDef` (types.ts) bridged explicitly in `recordWrite.ts`. `assertObjectVisible`/`resolveClientObjects`/`filterVisibleObjects` names consistent. `useCrmRecords`/`RecordsTable`/`RecordPipelineBoard` props (`clientId`, `objectKey`) consistent. `crm_object_templates` used consistently after the rename note.

**Two deviations from spec, both documented inline:** (1) `crm_pipeline_templates` → `crm_object_templates` (seeds whole objects, not just pipelines); (2) config-object stages are stored in `crm_stages` with object-key-prefixed codes (`order:new`) rather than a separate stage table, reusing the shipped pipeline infrastructure.
