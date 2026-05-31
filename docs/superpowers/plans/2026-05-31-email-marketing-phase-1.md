# Email Marketing — Phase 1: Data + Lists + Subscribers + Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation and admin UI for the email marketing module — global subscribers, named lists, many-to-many membership, CSV import, and "add to list" from existing leads/clients — at `/agency/email`.

**Architecture:** Own the data in Neon Postgres (migration 132). Pure, unit-tested helpers for email normalization, CSV parsing, and CSV→subscriber mapping live in `server/utils/email-marketing/`. DB operations sit behind a thin `db.ts` module. Nitro endpoints under `server/api/email/` follow the existing leads-endpoint shape (`defineEventHandler` + Zod + `requireAuth`/`requireWriteAccess`). The admin UI is a tabbed page using Nuxt UI v4.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`server/utils/db.ts`), Zod, Vitest, Nuxt UI v4.

**Spec:** `docs/superpowers/specs/2026-05-31-email-marketing-module-design.md`

**Scope note:** This is Phase 1 of a 5-phase milestone. Campaigns, the sending engine, Resend webhooks/tracking, public subscribe/unsubscribe pages, and the suppression list are explicitly OUT of scope here — they arrive in Phases 2–4.

---

## File Structure

**Created:**
- `server/database/migrations/132-email-marketing-core.sql` — `email_subscribers`, `email_lists`, `subscriber_lists`.
- `server/utils/email-marketing/types.ts` — shared TS types.
- `server/utils/email-marketing/email.ts` — `normalizeEmail`, `isValidEmail` (pure).
- `server/utils/email-marketing/csv.ts` — `parseCsv` (pure).
- `server/utils/email-marketing/importParse.ts` — `parseSubscriberCsv` (pure).
- `server/utils/email-marketing/db.ts` — list + subscriber DB operations.
- `server/api/email/lists/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`
- `server/api/email/subscribers/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`
- `server/api/email/subscribers/import.post.ts`
- `server/api/email/subscribers/add-to-list.post.ts`
- `app/pages/agency/email/index.vue` — tabbed shell.
- `app/components/email/ListsPanel.vue` → `EmailListsPanel`
- `app/components/email/SubscribersPanel.vue` → `EmailSubscribersPanel`
- `app/components/email/ListFormModal.vue` → `EmailListFormModal`
- `app/components/email/SubscriberFormModal.vue` → `EmailSubscriberFormModal`
- `app/components/email/ImportModal.vue` → `EmailImportModal`
- `test/utils/emailMarketingEmail.test.ts`
- `test/utils/emailMarketingCsv.test.ts`
- `test/utils/emailMarketingImportParse.test.ts`

**Modified:**
- `app/layouts/agency.vue` — add nav entry.

---

## Task 1: Migration 132 — core schema

**Files:**
- Create: `server/database/migrations/132-email-marketing-core.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 132: email marketing core — subscribers, lists, membership (Phase 1)
-- Agency-first: client_id is nullable (NULL = agency-wide scope). Designed for
-- future per-client scoping. Campaigns / events / suppression land in later phases.

CREATE EXTENSION IF NOT EXISTS citext;

-- Global subscriber records, deduped by email (case-insensitive via citext).
CREATE TABLE IF NOT EXISTS email_subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      CITEXT NOT NULL UNIQUE,
  name       TEXT,
  attribs    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status     TEXT NOT NULL DEFAULT 'enabled'
             CHECK (status IN ('enabled','disabled','blocklisted')),
  client_id  UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Named lists. double_optin toggles the confirmation flow (used in Phase 4).
CREATE TABLE IF NOT EXISTS email_lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  description  TEXT,
  client_id    UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  double_optin BOOLEAN NOT NULL DEFAULT false,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at  TIMESTAMPTZ
);

-- Many-to-many membership with per-list subscription state.
CREATE TABLE IF NOT EXISTS subscriber_lists (
  subscriber_id   UUID NOT NULL REFERENCES email_subscribers(id) ON DELETE CASCADE,
  list_id         UUID NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'unconfirmed'
                  CHECK (status IN ('unconfirmed','confirmed','unsubscribed')),
  source          TEXT NOT NULL DEFAULT 'manual'
                  CHECK (source IN ('import','form','manual','leads','clients')),
  subscribed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  PRIMARY KEY (subscriber_id, list_id)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_client ON email_subscribers(client_id);
CREATE INDEX IF NOT EXISTS idx_email_lists_client ON email_lists(client_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_subscriber_lists_list ON subscriber_lists(list_id, status);
```

- [ ] **Step 2: Run the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/132-email-marketing-core.sql
```
Expected: `CREATE EXTENSION` / `CREATE TABLE` / `CREATE INDEX` notices, no errors.

- [ ] **Step 3: Verify the tables exist**

Run:
```bash
psql "$DATABASE_URL" -c "\d email_subscribers" -c "\d email_lists" -c "\d subscriber_lists"
```
Expected: all three tables print with the columns above; `email` is type `citext` with a unique index.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/132-email-marketing-core.sql
git commit -m "feat(email): migration 132 — subscribers, lists, membership"
```

---

## Task 2: Shared types

**Files:**
- Create: `server/utils/email-marketing/types.ts`

- [ ] **Step 1: Write the types**

```ts
// server/utils/email-marketing/types.ts
// Shared types for the email marketing module (Phase 1).

export type SubscriberStatus = 'enabled' | 'disabled' | 'blocklisted'
export type MembershipStatus = 'unconfirmed' | 'confirmed' | 'unsubscribed'
export type MembershipSource = 'import' | 'form' | 'manual' | 'leads' | 'clients'

export interface EmailSubscriber {
  id: string
  email: string
  name: string | null
  attribs: Record<string, any>
  status: SubscriberStatus
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface EmailList {
  id: string
  name: string
  description: string | null
  client_id: string | null
  double_optin: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

// Minimal shape used when upserting a subscriber (from manual add or import).
export interface SubscriberInput {
  email: string
  name?: string | null
  attribs?: Record<string, any>
}
```

- [ ] **Step 2: Commit**

```bash
git add server/utils/email-marketing/types.ts
git commit -m "feat(email): shared types for email marketing module"
```

---

## Task 3: Email normalization + validation (TDD)

**Files:**
- Create: `server/utils/email-marketing/email.ts`
- Test: `test/utils/emailMarketingEmail.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/emailMarketingEmail.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Paul@ADME.net.au ')).toBe('paul@adme.net.au')
  })
})

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('paul@adme.net.au')).toBe(true)
    expect(isValidEmail('a.b+tag@sub.example.com')).toBe(true)
  })
  it('rejects malformed or empty addresses', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('not-an-email')).toBe(false)
    expect(isValidEmail('missing@domain')).toBe(false)
    expect(isValidEmail('two@@at.com')).toBe(false)
    expect(isValidEmail('spaces in@email.com')).toBe(false)
  })
  it('rejects addresses over 254 chars', () => {
    expect(isValidEmail('a'.repeat(250) + '@x.com')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/emailMarketingEmail.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/email-marketing/email`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/email-marketing/email.ts
// Pure email normalization + validation for subscriber records.

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

// Pragmatic single-pass validator: exactly one @, non-empty local part,
// a dotted domain, no whitespace. Not RFC-5322-exhaustive by design — it
// matches what real signup/import data needs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(raw: string): boolean {
  const e = normalizeEmail(raw)
  if (e.length === 0 || e.length > 254) return false
  return EMAIL_RE.test(e)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/emailMarketingEmail.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/email-marketing/email.ts test/utils/emailMarketingEmail.test.ts
git commit -m "feat(email): email normalize + validate helpers"
```

---

## Task 4: Shared CSV parser (TDD)

**Files:**
- Create: `server/utils/email-marketing/csv.ts`
- Test: `test/utils/emailMarketingCsv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/emailMarketingCsv.test.ts
import { describe, it, expect } from 'vitest'
import { parseCsv } from '~~/server/utils/email-marketing/csv'

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    expect(parseCsv('email,name\na@x.com,Alice\nb@y.com,Bob')).toEqual([
      ['email', 'name'],
      ['a@x.com', 'Alice'],
      ['b@y.com', 'Bob'],
    ])
  })
  it('handles quoted fields with commas and escaped quotes', () => {
    expect(parseCsv('email,note\na@x.com,"Hello, ""world"""')).toEqual([
      ['email', 'note'],
      ['a@x.com', 'Hello, "world"'],
    ])
  })
  it('handles CRLF line endings and skips blank trailing lines', () => {
    expect(parseCsv('email\r\na@x.com\r\n\r\n')).toEqual([
      ['email'],
      ['a@x.com'],
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/emailMarketingCsv.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/email-marketing/csv.ts
// Minimal CSV parser. Handles quoted fields, escaped quotes ("" -> "), and
// CRLF/LF line endings. Ported from the leads importer so both stay consistent.
// For pathological input we'd reach for papaparse, but that adds ~50KB to the bundle.

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
        inQuotes = false
        i++
        continue
      }
      cell += ch
      i++
      continue
    }
    if (ch === '"') { inQuotes = true; i++; continue }
    if (ch === ',') { row.push(cell); cell = ''; i++; continue }
    if (ch === '\r') { i++; continue }
    if (ch === '\n') {
      row.push(cell)
      if (row.length > 1 || row[0].trim() !== '') rows.push(row)
      row = []
      cell = ''
      i++
      continue
    }
    cell += ch
    i++
  }
  row.push(cell)
  if (row.length > 1 || row[0].trim() !== '') rows.push(row)
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/emailMarketingCsv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/email-marketing/csv.ts test/utils/emailMarketingCsv.test.ts
git commit -m "feat(email): shared CSV parser"
```

---

## Task 5: CSV → subscriber mapping (TDD)

**Files:**
- Create: `server/utils/email-marketing/importParse.ts`
- Test: `test/utils/emailMarketingImportParse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/emailMarketingImportParse.test.ts
import { describe, it, expect } from 'vitest'
import { parseSubscriberCsv } from '~~/server/utils/email-marketing/importParse'

describe('parseSubscriberCsv', () => {
  it('auto-detects email + name columns and maps the rest to attribs', () => {
    const csv = 'Email,Full Name,Company\na@x.com,Alice,Acme\nb@y.com,Bob,Globex'
    const r = parseSubscriberCsv(csv)
    expect(r.total).toBe(2)
    expect(r.errors).toEqual([])
    expect(r.subscribers).toEqual([
      { email: 'a@x.com', name: 'Alice', attribs: { company: 'Acme' } },
      { email: 'b@y.com', name: 'Bob', attribs: { company: 'Globex' } },
    ])
  })

  it('records an error for rows with invalid/blank email and skips them', () => {
    const csv = 'email,name\nbad-email,Nope\nc@z.com,Cara'
    const r = parseSubscriberCsv(csv)
    expect(r.subscribers).toEqual([{ email: 'c@z.com', name: 'Cara', attribs: {} }])
    expect(r.errors).toEqual([{ row: 2, message: 'invalid_email' }])
  })

  it('dedupes repeated emails within the file (first wins)', () => {
    const csv = 'email,name\nd@z.com,First\nD@z.com,Second'
    const r = parseSubscriberCsv(csv)
    expect(r.subscribers).toEqual([{ email: 'd@z.com', name: 'First', attribs: {} }])
    expect(r.errors).toEqual([{ row: 2, message: 'duplicate_in_file' }])
  })

  it('honors an explicit column mapping and "ignore"', () => {
    const csv = 'Contact,Person,Junk\ne@z.com,Eve,xxx'
    const r = parseSubscriberCsv(csv, { Contact: 'email', Person: 'name', Junk: 'ignore' })
    expect(r.subscribers).toEqual([{ email: 'e@z.com', name: 'Eve', attribs: {} }])
  })

  it('errors when no email column can be resolved', () => {
    const r = parseSubscriberCsv('name,company\nAlice,Acme')
    expect(r.subscribers).toEqual([])
    expect(r.errors).toEqual([{ row: 0, message: 'no_email_column' }])
  })

  it('errors on an empty CSV', () => {
    const r = parseSubscriberCsv('email')
    expect(r.errors).toEqual([{ row: 0, message: 'empty_csv' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/emailMarketingImportParse.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/email-marketing/importParse.ts
// Pure mapping of raw CSV text into validated SubscriberInput records.
// Auto-detects email/name columns; everything else becomes an attrib.
// columnMapping (header verbatim -> role) overrides auto-detection:
//   role is 'email' | 'name' | 'ignore' | any custom attrib key.

import { parseCsv } from './csv'
import { normalizeEmail, isValidEmail } from './email'
import type { SubscriberInput } from './types'

const EMAIL_HEADERS = new Set(['email', 'email address', 'e-mail', 'email_address'])
const NAME_HEADERS = new Set(['name', 'full name', 'full_name', 'first name', 'first_name'])

export interface CsvImportParse {
  subscribers: SubscriberInput[]
  errors: Array<{ row: number; message: string }>
  total: number
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
}

export function parseSubscriberCsv(
  csvText: string,
  columnMapping?: Record<string, string>,
): CsvImportParse {
  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return { subscribers: [], errors: [{ row: 0, message: 'empty_csv' }], total: 0 }
  }

  const headers = rows[0].map(h => h.trim())
  // Resolve each column to a role: 'email' | 'name' | 'ignore' | 'attr:<key>'
  const roles = headers.map(h => {
    const lower = h.toLowerCase()
    if (columnMapping && columnMapping[h]) {
      const m = columnMapping[h]
      if (m === 'email' || m === 'name' || m === 'ignore') return m
      return `attr:${normalizeKey(m)}`
    }
    if (EMAIL_HEADERS.has(lower)) return 'email'
    if (NAME_HEADERS.has(lower)) return 'name'
    const k = normalizeKey(h)
    return k ? `attr:${k}` : 'ignore'
  })

  const emailIdx = roles.indexOf('email')
  if (emailIdx === -1) {
    return { subscribers: [], errors: [{ row: 0, message: 'no_email_column' }], total: 0 }
  }

  const subscribers: SubscriberInput[] = []
  const errors: Array<{ row: number; message: string }> = []
  const seen = new Set<string>()
  const dataRows = rows.slice(1)

  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r]
    const rowNum = r + 1 // 1-indexed data row (header excluded)
    if (cols.every(c => !c.trim())) continue

    const rawEmail = (cols[emailIdx] ?? '').trim()
    if (!isValidEmail(rawEmail)) {
      errors.push({ row: rowNum, message: 'invalid_email' })
      continue
    }
    const email = normalizeEmail(rawEmail)
    if (seen.has(email)) {
      errors.push({ row: rowNum, message: 'duplicate_in_file' })
      continue
    }
    seen.add(email)

    let name: string | null = null
    const attribs: Record<string, any> = {}
    roles.forEach((role, idx) => {
      const val = (cols[idx] ?? '').trim()
      if (!val) return
      if (role === 'name') { name = val; return }
      if (role === 'email' || role === 'ignore') return
      if (role.startsWith('attr:')) attribs[role.slice(5)] = val
    })

    subscribers.push({ email, name, attribs })
  }

  return { subscribers, errors, total: subscribers.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/emailMarketingImportParse.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/email-marketing/importParse.ts test/utils/emailMarketingImportParse.test.ts
git commit -m "feat(email): CSV -> subscriber mapping with validation + dedup"
```

---

## Task 6: DB layer — lists + subscribers

**Files:**
- Create: `server/utils/email-marketing/db.ts`

- [ ] **Step 1: Write the DB module**

```ts
// server/utils/email-marketing/db.ts
// Thin DB layer for the email marketing module. All SQL lives here so the
// endpoints stay declarative. Uses the shared db.ts helpers.

import { queryRows, queryOne, queryCount, execute } from '~~/server/utils/db'
import type { EmailList, EmailSubscriber, MembershipSource, SubscriberInput } from './types'

// ---------- Lists ----------

export interface ListWithCount extends EmailList {
  subscriber_count: number
}

export async function listLists(opts: { includeArchived?: boolean } = {}): Promise<ListWithCount[]> {
  const where = opts.includeArchived ? '' : 'WHERE l.archived_at IS NULL'
  return queryRows<ListWithCount>(`
    SELECT l.*,
           COALESCE(c.cnt, 0)::int AS subscriber_count
    FROM email_lists l
    LEFT JOIN (
      SELECT list_id, COUNT(*) AS cnt
      FROM subscriber_lists
      WHERE status <> 'unsubscribed'
      GROUP BY list_id
    ) c ON c.list_id = l.id
    ${where}
    ORDER BY l.created_at DESC
  `)
}

export async function getList(id: string): Promise<EmailList | null> {
  return queryOne<EmailList>('SELECT * FROM email_lists WHERE id = $1', [id])
}

export async function createList(input: {
  name: string
  description?: string | null
  client_id?: string | null
  double_optin?: boolean
  created_by: string
}): Promise<EmailList> {
  const row = await queryOne<EmailList>(`
    INSERT INTO email_lists (name, description, client_id, double_optin, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    input.name,
    input.description ?? null,
    input.client_id ?? null,
    input.double_optin ?? false,
    input.created_by,
  ])
  return row as EmailList
}

export async function updateList(id: string, patch: {
  name?: string
  description?: string | null
  double_optin?: boolean
}): Promise<EmailList | null> {
  const sets: string[] = []
  const params: any[] = []
  const push = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  if (patch.name !== undefined) push('name', patch.name)
  if (patch.description !== undefined) push('description', patch.description)
  if (patch.double_optin !== undefined) push('double_optin', patch.double_optin)
  if (!sets.length) return getList(id)
  sets.push('updated_at = NOW()')
  params.push(id)
  return queryOne<EmailList>(
    `UPDATE email_lists SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
}

export async function archiveList(id: string): Promise<void> {
  await execute('UPDATE email_lists SET archived_at = NOW(), updated_at = NOW() WHERE id = $1', [id])
}

// ---------- Subscribers ----------

// Upsert by email. On conflict, fill in a missing name and merge attribs
// (new keys win), but never downgrade status. Returns the subscriber id.
export async function upsertSubscriber(input: SubscriberInput & {
  client_id?: string | null
  created_by?: string | null
}): Promise<string> {
  const row = await queryOne<{ id: string }>(`
    INSERT INTO email_subscribers (email, name, attribs, client_id, created_by)
    VALUES ($1, $2, $3::jsonb, $4, $5)
    ON CONFLICT (email) DO UPDATE SET
      name = COALESCE(email_subscribers.name, EXCLUDED.name),
      attribs = email_subscribers.attribs || EXCLUDED.attribs,
      updated_at = NOW()
    RETURNING id
  `, [
    input.email,
    input.name ?? null,
    JSON.stringify(input.attribs ?? {}),
    input.client_id ?? null,
    input.created_by ?? null,
  ])
  return (row as { id: string }).id
}

// Add a subscriber to a list. Initial membership status depends on the list's
// double_optin flag: single-opt-in lists confirm immediately. Re-adding a
// previously-unsubscribed member reactivates them as unconfirmed.
export async function addToList(
  subscriberId: string,
  listId: string,
  source: MembershipSource,
): Promise<void> {
  const list = await getList(listId)
  if (!list) return
  const initialStatus = list.double_optin ? 'unconfirmed' : 'confirmed'
  await execute(`
    INSERT INTO subscriber_lists (subscriber_id, list_id, status, source)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (subscriber_id, list_id) DO UPDATE SET
      status = CASE WHEN subscriber_lists.status = 'unsubscribed'
                    THEN 'unconfirmed' ELSE subscriber_lists.status END,
      unsubscribed_at = NULL
  `, [subscriberId, listId, initialStatus, source])
}

export async function removeFromList(subscriberId: string, listId: string): Promise<void> {
  await execute(`
    UPDATE subscriber_lists
    SET status = 'unsubscribed', unsubscribed_at = NOW()
    WHERE subscriber_id = $1 AND list_id = $2
  `, [subscriberId, listId])
}

export interface ListSubscribersResult {
  items: EmailSubscriber[]
  total: number
  page: number
  page_size: number
}

export async function listSubscribers(opts: {
  listId?: string
  q?: string
  status?: string
  page: number
  pageSize: number
}): Promise<ListSubscribersResult> {
  const conds: string[] = []
  const params: any[] = []
  const push = (cond: string, val: any) => { params.push(val); conds.push(cond.replace('?', '$' + params.length)) }

  const join = opts.listId ? 'JOIN subscriber_lists sl ON sl.subscriber_id = s.id' : ''
  if (opts.listId) push('sl.list_id = ?', opts.listId)
  if (opts.status) push('s.status = ?', opts.status)
  if (opts.q) {
    // Two distinct placeholders (email + name). Use params.push()'s returned
    // length as each index — never reuse a $N, per the SQL-indexing gotcha.
    const safe = opts.q.replace(/[%_]/g, c => '\\' + c)
    const a = params.push(`%${safe}%`)
    const b = params.push(`%${safe}%`)
    conds.push(`(s.email ILIKE $${a} OR s.name ILIKE $${b})`)
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const offset = (opts.page - 1) * opts.pageSize

  const items = await queryRows<EmailSubscriber>(`
    SELECT DISTINCT s.* FROM email_subscribers s ${join} ${where}
    ORDER BY s.created_at DESC
    LIMIT ${opts.pageSize} OFFSET ${offset}
  `, params)
  const total = await queryCount(
    `SELECT COUNT(DISTINCT s.id)::text AS count FROM email_subscribers s ${join} ${where}`,
    params,
  )
  return { items, total, page: opts.page, page_size: opts.pageSize }
}

export async function getSubscriber(id: string): Promise<EmailSubscriber | null> {
  return queryOne<EmailSubscriber>('SELECT * FROM email_subscribers WHERE id = $1', [id])
}

export async function updateSubscriber(id: string, patch: {
  name?: string | null
  status?: string
  attribs?: Record<string, any>
}): Promise<EmailSubscriber | null> {
  const sets: string[] = []
  const params: any[] = []
  const push = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('?', '$' + params.length)) }
  if (patch.name !== undefined) push('name = ?', patch.name)
  if (patch.status !== undefined) push('status = ?', patch.status)
  if (patch.attribs !== undefined) push('attribs = ?::jsonb', JSON.stringify(patch.attribs))
  if (!sets.length) return getSubscriber(id)
  sets.push('updated_at = NOW()')
  params.push(id)
  return queryOne<EmailSubscriber>(
    `UPDATE email_subscribers SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  )
}

export async function deleteSubscriber(id: string): Promise<void> {
  await execute('DELETE FROM email_subscribers WHERE id = $1', [id])
}
```

- [ ] **Step 2: Typecheck the module**

Run: `pnpm exec vue-tsc --noEmit -p .nuxt/tsconfig.server.json 2>&1 | grep "email-marketing/db.ts" || echo "no new errors in db.ts"`
Expected: `no new errors in db.ts` (the codebase has ~60 pre-existing errors elsewhere — only check this file is clean).

- [ ] **Step 3: Commit**

```bash
git add server/utils/email-marketing/db.ts
git commit -m "feat(email): DB layer for lists + subscribers"
```

---

## Task 7: Lists API endpoints

**Files:**
- Create: `server/api/email/lists/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: Write `index.get.ts`**

```ts
// server/api/email/lists/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listLists } from '~~/server/utils/email-marketing/db'

const Query = z.object({ include_archived: z.coerce.boolean().optional() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const items = await listLists({ includeArchived: q.include_archived })
  return { items }
})
```

- [ ] **Step 2: Write `index.post.ts`**

```ts
// server/api/email/lists/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createList } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  client_id: z.string().uuid().optional().nullable(),
  double_optin: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const list = await createList({ ...parsed.data, created_by: user.id })
  return { list }
})
```

- [ ] **Step 3: Write `[id].patch.ts`**

```ts
// server/api/email/lists/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { updateList } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  double_optin: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const list = await updateList(id, parsed.data)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { list }
})
```

- [ ] **Step 4: Write `[id].delete.ts`**

```ts
// server/api/email/lists/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { archiveList } from '~~/server/utils/email-marketing/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await archiveList(id)
  return { ok: true }
})
```

- [ ] **Step 5: Manual verification (dev server running)**

Run (replace cookie with a logged-in session if your dev auth requires it; local dev bypass may apply):
```bash
# create
curl -sX POST localhost:3000/api/email/lists -H 'content-type: application/json' \
  -d '{"name":"Newsletter","description":"Monthly update"}' | tee /tmp/list.json
# list
curl -s localhost:3000/api/email/lists | head -c 400; echo
```
Expected: POST returns `{"list":{...,"name":"Newsletter"}}`; GET returns an `items` array containing it with `subscriber_count: 0`.

- [ ] **Step 6: Commit**

```bash
git add server/api/email/lists
git commit -m "feat(email): lists API (CRUD + archive)"
```

---

## Task 8: Subscribers API endpoints (CRUD)

**Files:**
- Create: `server/api/email/subscribers/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`

- [ ] **Step 1: Write `index.get.ts`**

```ts
// server/api/email/subscribers/index.get.ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { listSubscribers } from '~~/server/utils/email-marketing/db'

const Query = z.object({
  list_id: z.string().uuid().optional(),
  status: z.enum(['enabled', 'disabled', 'blocklisted']).optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  return listSubscribers({
    listId: q.list_id,
    status: q.status,
    q: q.q,
    page: q.page,
    pageSize: q.page_size,
  })
})
```

- [ ] **Step 2: Write `index.post.ts`** (manual add, optional list membership)

```ts
// server/api/email/subscribers/index.post.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { upsertSubscriber, addToList } from '~~/server/utils/email-marketing/db'
import { normalizeEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  email: z.string().min(1),
  name: z.string().max(200).optional().nullable(),
  attribs: z.record(z.any()).optional(),
  client_id: z.string().uuid().optional().nullable(),
  list_ids: z.array(z.string().uuid()).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data
  if (!isValidEmail(input.email)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_email' })
  }
  const id = await upsertSubscriber({
    email: normalizeEmail(input.email),
    name: input.name ?? null,
    attribs: input.attribs ?? {},
    client_id: input.client_id ?? null,
    created_by: user.id,
  })
  for (const listId of input.list_ids ?? []) {
    await addToList(id, listId, 'manual')
  }
  return { ok: true, subscriber_id: id }
})
```

- [ ] **Step 3: Write `[id].patch.ts`**

```ts
// server/api/email/subscribers/[id].patch.ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { updateSubscriber } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  name: z.string().max(200).optional().nullable(),
  status: z.enum(['enabled', 'disabled', 'blocklisted']).optional(),
  attribs: z.record(z.any()).optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const sub = await updateSubscriber(id, parsed.data)
  if (!sub) throw createError({ statusCode: 404, statusMessage: 'not_found' })
  return { subscriber: sub }
})
```

- [ ] **Step 4: Write `[id].delete.ts`**

```ts
// server/api/email/subscribers/[id].delete.ts
import { requireWriteAccess } from '~~/server/utils/auth'
import { deleteSubscriber } from '~~/server/utils/email-marketing/db'

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  await deleteSubscriber(id)
  return { ok: true }
})
```

- [ ] **Step 5: Manual verification**

```bash
LIST_ID=$(grep -o '"id":"[^"]*"' /tmp/list.json | head -1 | cut -d'"' -f4)
curl -sX POST localhost:3000/api/email/subscribers -H 'content-type: application/json' \
  -d "{\"email\":\"alice@example.com\",\"name\":\"Alice\",\"list_ids\":[\"$LIST_ID\"]}"; echo
curl -s "localhost:3000/api/email/subscribers?list_id=$LIST_ID" | head -c 400; echo
```
Expected: POST returns `{"ok":true,"subscriber_id":"..."}`; GET returns the subscriber in `items` with `total: 1`.

- [ ] **Step 6: Commit**

```bash
git add server/api/email/subscribers/index.get.ts server/api/email/subscribers/index.post.ts server/api/email/subscribers/[id].patch.ts server/api/email/subscribers/[id].delete.ts
git commit -m "feat(email): subscribers API (CRUD + membership on add)"
```

---

## Task 9: CSV import endpoint

**Files:**
- Create: `server/api/email/subscribers/import.post.ts`

- [ ] **Step 1: Write the import endpoint**

```ts
// server/api/email/subscribers/import.post.ts
// Bulk-import subscribers from raw CSV text, upsert them, and add them to a
// target list. Reuses the pure parseSubscriberCsv mapping (unit-tested).

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { parseSubscriberCsv } from '~~/server/utils/email-marketing/importParse'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'

const Body = z.object({
  list_id: z.string().uuid(),
  csv: z.string().min(1),
  client_id: z.string().uuid().optional().nullable(),
  column_mapping: z.record(z.string()).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const input = parsed.data

  const list = await getList(input.list_id)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })

  const { subscribers, errors } = parseSubscriberCsv(input.csv, input.column_mapping)
  if (!subscribers.length && errors.length === 1 && errors[0].row === 0) {
    // Structural error (empty_csv / no_email_column) — surface as 400.
    throw createError({ statusCode: 400, statusMessage: errors[0].message })
  }

  let imported = 0
  for (const s of subscribers) {
    const id = await upsertSubscriber({
      email: s.email,
      name: s.name ?? null,
      attribs: s.attribs ?? {},
      client_id: input.client_id ?? null,
      created_by: user.id,
    })
    await addToList(id, input.list_id, 'import')
    imported++
  }

  return { imported, skipped: errors.length, errors }
})
```

- [ ] **Step 2: Manual verification**

```bash
LIST_ID=$(grep -o '"id":"[^"]*"' /tmp/list.json | head -1 | cut -d'"' -f4)
curl -sX POST localhost:3000/api/email/subscribers/import -H 'content-type: application/json' \
  -d "{\"list_id\":\"$LIST_ID\",\"csv\":\"email,name,company\\nbob@example.com,Bob,Acme\\nbad,Nope\"}"; echo
```
Expected: `{"imported":1,"skipped":1,"errors":[{"row":2,"message":"invalid_email"}]}`.

- [ ] **Step 3: Commit**

```bash
git add server/api/email/subscribers/import.post.ts
git commit -m "feat(email): CSV import endpoint"
```

---

## Task 10: Add-to-list from existing leads / clients

**Files:**
- Create: `server/api/email/subscribers/add-to-list.post.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// server/api/email/subscribers/add-to-list.post.ts
// Add existing records to a list: raw subscriber ids, or pull emails from
// the leads table (leads.field_data->>'email') / agency_clients contacts.

import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { upsertSubscriber, addToList, getList } from '~~/server/utils/email-marketing/db'
import { normalizeEmail, isValidEmail } from '~~/server/utils/email-marketing/email'

const Body = z.object({
  list_id: z.string().uuid(),
  subscriber_ids: z.array(z.string().uuid()).optional(),
  lead_ids: z.array(z.string().uuid()).optional(),
  client_ids: z.array(z.string().uuid()).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_body', data: parsed.error.issues })
  }
  const { list_id, subscriber_ids = [], lead_ids = [], client_ids = [] } = parsed.data

  const list = await getList(list_id)
  if (!list) throw createError({ statusCode: 404, statusMessage: 'list_not_found' })

  let added = 0

  // 1. Existing subscribers — straight membership add.
  for (const sid of subscriber_ids) {
    await addToList(sid, list_id, 'manual')
    added++
  }

  // 2. Leads — extract email + a display name from field_data.
  if (lead_ids.length) {
    const leads = await queryRows<{ id: string; client_id: string | null; field_data: any }>(
      `SELECT id, client_id, field_data FROM leads WHERE id = ANY($1::uuid[])`,
      [lead_ids],
    )
    for (const lead of leads) {
      const fd = lead.field_data || {}
      const email = fd.email || fd.email_address
      if (!email || !isValidEmail(email)) continue
      const name = fd.full_name || fd.name ||
        [fd.first_name, fd.last_name].filter(Boolean).join(' ') || null
      const id = await upsertSubscriber({
        email: normalizeEmail(email),
        name,
        attribs: {},
        client_id: lead.client_id,
        created_by: user.id,
      })
      await addToList(id, list_id, 'leads')
      added++
    }
  }

  // 3. Clients — pull cached primary contact email from xero_contacts_cache.
  if (client_ids.length) {
    const contacts = await queryRows<{ client_id: string; name: string | null; email: string | null }>(
      `SELECT ac.id AS client_id, ac.name, x.email_address AS email
       FROM agency_clients ac
       LEFT JOIN xero_contacts_cache x ON x.contact_id = ac.xero_contact_id
       WHERE ac.id = ANY($1::uuid[])`,
      [client_ids],
    )
    for (const c of contacts) {
      if (!c.email || !isValidEmail(c.email)) continue
      const id = await upsertSubscriber({
        email: normalizeEmail(c.email),
        name: c.name,
        attribs: {},
        client_id: c.client_id,
        created_by: user.id,
      })
      await addToList(id, list_id, 'clients')
      added++
    }
  }

  return { added }
})
```

> **Note for executor:** confirm the column names `xero_contacts_cache.contact_id` and `.email_address` against the live schema before relying on them — run `psql "$DATABASE_URL" -c "\d xero_contacts_cache"`. If they differ, adjust the SELECT. The leads `field_data` email keys (`email`/`email_address`) match `server/api/leads/import-csv.post.ts`.

- [ ] **Step 2: Verify the xero_contacts_cache columns**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "\d xero_contacts_cache"
```
Expected: confirm a contact-id column and an email column exist; adjust the SQL in Step 1 to the real names if needed.

- [ ] **Step 3: Manual verification**

```bash
LIST_ID=$(grep -o '"id":"[^"]*"' /tmp/list.json | head -1 | cut -d'"' -f4)
LEAD_ID=$(psql "$DATABASE_URL" -tAc "SELECT id FROM leads WHERE field_data ? 'email' LIMIT 1")
curl -sX POST localhost:3000/api/email/subscribers/add-to-list -H 'content-type: application/json' \
  -d "{\"list_id\":\"$LIST_ID\",\"lead_ids\":[\"$LEAD_ID\"]}"; echo
```
Expected: `{"added":1}` (or `{"added":0}` if that lead has no valid email).

- [ ] **Step 4: Commit**

```bash
git add server/api/email/subscribers/add-to-list.post.ts
git commit -m "feat(email): add-to-list from existing subscribers/leads/clients"
```

---

## Task 11: Admin page shell + nav entry

**Files:**
- Create: `app/pages/agency/email/index.vue`
- Modify: `app/layouts/agency.vue` (add nav entry after the Leads group, ~line 126)

- [ ] **Step 1: Write the page shell**

```vue
<!-- app/pages/agency/email/index.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Email Marketing — XeroFlow Agency' })

const tab = ref<'lists' | 'subscribers'>('lists')
const tabs = [
  { value: 'lists', label: 'Lists', icon: 'i-lucide-list' },
  { value: 'subscribers', label: 'Subscribers', icon: 'i-lucide-users' },
]
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default">
      <h1 class="text-xl font-semibold">Email Marketing</h1>
      <p class="text-sm text-muted">
        Build lists, import subscribers, and (soon) send campaigns.
      </p>
    </header>

    <div class="px-6 pt-4">
      <UTabs v-model="tab" :items="tabs" />
    </div>

    <div class="flex-1 overflow-auto px-6 py-4">
      <EmailListsPanel v-if="tab === 'lists'" />
      <EmailSubscribersPanel v-else />
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add the nav entry**

In `app/layouts/agency.vue`, immediately after the Leads entry (`{ label: 'Lead Inbox', icon: 'i-lucide-mail-question', to: '/agency/leads', onSelect: close },`), add:

```js
    { label: 'Email Marketing', icon: 'i-lucide-mail', to: '/agency/email', onSelect: close },
```

- [ ] **Step 3: Verify the page loads**

Run: start the dev server (`pnpm dev`) if not running, then visit `http://localhost:3000/agency/email`.
Expected: the page renders with two tabs (Lists / Subscribers). Components will error until the next tasks add them — that's fine; verify the shell + nav link appear.

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/email/index.vue app/layouts/agency.vue
git commit -m "feat(email): /agency/email shell page + nav entry"
```

---

## Task 12: Lists panel + create/edit modal

**Files:**
- Create: `app/components/email/ListsPanel.vue`, `app/components/email/ListFormModal.vue`

- [ ] **Step 1: Write the list form modal**

```vue
<!-- app/components/email/ListFormModal.vue -->
<script setup lang="ts">
const props = defineProps<{ list?: { id: string; name: string; description: string | null; double_optin: boolean } | null }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const saving = ref(false)
const form = reactive({ name: '', description: '', double_optin: false })

watch(open, (v) => {
  if (v) {
    form.name = props.list?.name ?? ''
    form.description = props.list?.description ?? ''
    form.double_optin = props.list?.double_optin ?? false
  }
})

async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name required', color: 'error' })
    return
  }
  saving.value = true
  try {
    if (props.list) {
      await $fetch(`/api/email/lists/${props.list.id}`, { method: 'PATCH', body: { ...form } })
    } else {
      await $fetch('/api/email/lists', { method: 'POST', body: { ...form } })
    }
    toast.add({ title: 'List saved', color: 'success' })
    open.value = false
    emit('saved')
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage ?? e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="props.list ? 'Edit list' : 'New list'">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput v-model="form.name" placeholder="Monthly Newsletter" class="w-full" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="form.description" :rows="3" class="w-full" />
        </UFormField>
        <UFormField label="Double opt-in" help="Require email confirmation before a subscriber is active (used by public signup forms in a later phase).">
          <UCheckbox v-model="form.double_optin" label="Require confirmation" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton color="primary" label="Save" :loading="saving" @click="save" />
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Write the lists panel**

```vue
<!-- app/components/email/ListsPanel.vue -->
<script setup lang="ts">
interface ListRow {
  id: string
  name: string
  description: string | null
  double_optin: boolean
  subscriber_count: number
  archived_at: string | null
}

const toast = useToast()
const { data, refresh, pending } = await useFetch<{ items: ListRow[] }>('/api/email/lists')

const showModal = ref(false)
const editing = ref<ListRow | null>(null)

function openCreate() { editing.value = null; showModal.value = true }
function openEdit(row: ListRow) { editing.value = row; showModal.value = true }

async function archive(row: ListRow) {
  try {
    await $fetch(`/api/email/lists/${row.id}`, { method: 'DELETE' })
    toast.add({ title: 'List archived', color: 'success' })
    refresh()
  } catch (e: any) {
    toast.add({ title: 'Archive failed', description: e?.message, color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <p class="text-sm text-muted">{{ data?.items?.length ?? 0 }} list(s)</p>
      <UButton icon="i-lucide-plus" label="New list" @click="openCreate" />
    </div>

    <div v-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-8 text-center">
      No lists yet. Create your first list to start collecting subscribers.
    </div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div v-for="row in data.items" :key="row.id" class="flex items-center justify-between px-4 py-3">
        <div>
          <p class="font-medium">{{ row.name }}</p>
          <p v-if="row.description" class="text-sm text-muted">{{ row.description }}</p>
        </div>
        <div class="flex items-center gap-3">
          <UBadge color="neutral" variant="subtle">{{ row.subscriber_count }} subscribers</UBadge>
          <UBadge v-if="row.double_optin" color="info" variant="subtle">Double opt-in</UBadge>
          <UButton icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(row)" />
          <UButton icon="i-lucide-archive" color="neutral" variant="ghost" size="sm" @click="archive(row)" />
        </div>
      </div>
    </div>

    <EmailListFormModal v-model:open="showModal" :list="editing" @saved="refresh" />
  </div>
</template>
```

- [ ] **Step 3: Verify in the browser**

Visit `/agency/email`, Lists tab. Create a list, edit it, archive it.
Expected: toasts appear, the list row shows/updates/disappears, subscriber count shows `0`.

- [ ] **Step 4: Commit**

```bash
git add app/components/email/ListsPanel.vue app/components/email/ListFormModal.vue
git commit -m "feat(email): lists panel + create/edit modal"
```

---

## Task 13: Subscribers panel + add modal + import modal

**Files:**
- Create: `app/components/email/SubscribersPanel.vue`, `app/components/email/SubscriberFormModal.vue`, `app/components/email/ImportModal.vue`

- [ ] **Step 1: Write the subscriber add modal**

```vue
<!-- app/components/email/SubscriberFormModal.vue -->
<script setup lang="ts">
const props = defineProps<{ lists: { id: string; name: string }[] }>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const saving = ref(false)
const form = reactive({ email: '', name: '', list_ids: [] as string[] })

watch(open, (v) => { if (v) { form.email = ''; form.name = ''; form.list_ids = [] } })

async function save() {
  if (!form.email.trim()) { toast.add({ title: 'Email required', color: 'error' }); return }
  saving.value = true
  try {
    await $fetch('/api/email/subscribers', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Subscriber added', color: 'success' })
    open.value = false
    emit('saved')
  } catch (e: any) {
    toast.add({ title: 'Add failed', description: e?.data?.statusMessage ?? e.message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Add subscriber">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Email" required>
          <UInput v-model="form.email" type="email" placeholder="person@example.com" class="w-full" />
        </UFormField>
        <UFormField label="Name">
          <UInput v-model="form.name" class="w-full" />
        </UFormField>
        <UFormField label="Add to lists">
          <USelectMenu
            v-model="form.list_ids"
            :items="props.lists.map(l => ({ label: l.name, value: l.id }))"
            value-key="value"
            multiple
            placeholder="Select lists"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton color="primary" label="Add" :loading="saving" @click="save" />
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 2: Write the import modal**

```vue
<!-- app/components/email/ImportModal.vue -->
<script setup lang="ts">
const props = defineProps<{ lists: { id: string; name: string }[] }>()
const emit = defineEmits<{ imported: [] }>()
const open = defineModel<boolean>('open', { required: true })

const toast = useToast()
const importing = ref(false)
const listId = ref<string | undefined>(undefined)
const csv = ref('')
const result = ref<{ imported: number; skipped: number } | null>(null)

watch(open, (v) => { if (v) { listId.value = undefined; csv.value = ''; result.value = null } })

async function run() {
  if (!listId.value) { toast.add({ title: 'Pick a target list', color: 'error' }); return }
  if (!csv.value.trim()) { toast.add({ title: 'Paste CSV first', color: 'error' }); return }
  importing.value = true
  try {
    result.value = await $fetch('/api/email/subscribers/import', {
      method: 'POST',
      body: { list_id: listId.value, csv: csv.value },
    })
    toast.add({ title: `Imported ${result.value?.imported}, skipped ${result.value?.skipped}`, color: 'success' })
    emit('imported')
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage ?? e.message, color: 'error' })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Import subscribers from CSV">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Target list" required>
          <USelectMenu
            v-model="listId"
            :items="props.lists.map(l => ({ label: l.name, value: l.id }))"
            value-key="value"
            placeholder="Select a list"
            class="w-full"
          />
        </UFormField>
        <UFormField label="CSV" help="First row must be headers. An 'email' column is required; 'name' is auto-detected; other columns become subscriber attributes.">
          <UTextarea v-model="csv" :rows="8" placeholder="email,name,company&#10;alice@example.com,Alice,Acme" class="w-full font-mono text-xs" />
        </UFormField>
        <UAlert v-if="result" color="info" variant="subtle"
          :title="`Imported ${result.imported}, skipped ${result.skipped}`" />
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton color="neutral" variant="ghost" label="Close" @click="open = false" />
        <UButton color="primary" label="Import" :loading="importing" @click="run" />
      </div>
    </template>
  </UModal>
</template>
```

- [ ] **Step 3: Write the subscribers panel**

```vue
<!-- app/components/email/SubscribersPanel.vue -->
<script setup lang="ts">
interface SubRow { id: string; email: string; name: string | null; status: string; created_at: string }

const listFilter = ref<string | undefined>(undefined)
const search = ref('')
const page = ref(1)

const { data: listsData } = await useFetch<{ items: { id: string; name: string }[] }>('/api/email/lists')
const lists = computed(() => listsData.value?.items ?? [])

const query = computed(() => ({
  list_id: listFilter.value,
  q: search.value || undefined,
  page: page.value,
  page_size: 50,
}))
const { data, refresh, pending } = await useFetch<{ items: SubRow[]; total: number }>(
  '/api/email/subscribers',
  { query },
)

const showAdd = ref(false)
const showImport = ref(false)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search email or name" class="w-64" />
        <USelectMenu
          v-model="listFilter"
          :items="[{ label: 'All lists', value: undefined }, ...lists.map(l => ({ label: l.name, value: l.id }))]"
          value-key="value"
          placeholder="All lists"
          class="w-48"
        />
      </div>
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-upload" color="neutral" variant="outline" label="Import CSV" @click="showImport = true" />
        <UButton icon="i-lucide-plus" label="Add subscriber" @click="showAdd = true" />
      </div>
    </div>

    <div v-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-8 text-center">No subscribers found.</div>

    <div v-else class="border border-default rounded-lg divide-y divide-default">
      <div v-for="row in data.items" :key="row.id" class="flex items-center justify-between px-4 py-2.5">
        <div>
          <p class="font-medium">{{ row.email }}</p>
          <p v-if="row.name" class="text-sm text-muted">{{ row.name }}</p>
        </div>
        <UBadge :color="row.status === 'enabled' ? 'success' : 'neutral'" variant="subtle">{{ row.status }}</UBadge>
      </div>
    </div>

    <p v-if="data?.total" class="text-xs text-muted">{{ data.total }} total</p>

    <EmailSubscriberFormModal v-model:open="showAdd" :lists="lists" @saved="refresh" />
    <EmailImportModal v-model:open="showImport" :lists="lists" @imported="refresh" />
  </div>
</template>
```

- [ ] **Step 4: Verify in the browser**

Visit `/agency/email`, Subscribers tab. Add a subscriber, import a small CSV, filter by list, search.
Expected: subscribers appear, import shows imported/skipped counts, list filter and search narrow results.

- [ ] **Step 5: Commit**

```bash
git add app/components/email/SubscribersPanel.vue app/components/email/SubscriberFormModal.vue app/components/email/ImportModal.vue
git commit -m "feat(email): subscribers panel + add + CSV import modals"
```

---

## Task 14: Full-suite verification

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm exec vitest run test/utils/emailMarketing*.test.ts`
Expected: all email-marketing tests PASS (3 + 3 + 6 = 12 tests).

- [ ] **Step 2: Lint the new files**

Run: `pnpm exec eslint server/utils/email-marketing server/api/email app/components/email app/pages/agency/email`
Expected: no errors. (Note from project memory: ESLint wants comma-style type-member delimiters — fix any flagged.)

- [ ] **Step 3: End-to-end smoke (manual)**

With `pnpm dev` running:
1. `/agency/email` → create a list "Smoke Test".
2. Import CSV: `email,name\nx@example.com,Xavier\nbad,Nope` → expect imported 1, skipped 1.
3. Subscribers tab, filter by "Smoke Test" → Xavier appears.
4. Add subscriber `y@example.com` to "Smoke Test" → appears.
5. Lists tab → "Smoke Test" shows `2 subscribers`.

Expected: every step behaves as described; no console errors.

- [ ] **Step 4: Final commit (if any lint fixes were made)**

```bash
git add -A
git commit -m "chore(email): phase 1 lint + verification fixes" || echo "nothing to commit"
```

---

## Out of scope (later phases — do NOT build here)

- Campaigns table, composer, sending engine, queue jobs, scheduler/watchdog cron (Phase 2)
- Resend webhook handler, `email_events`, `suppression_list`, analytics dashboard (Phase 3)
- Public subscribe/confirm/unsubscribe pages, `List-Unsubscribe` headers, double-opt-in email (Phase 4)
- Reusable templates manager, advanced segmentation, marketing-page sync (Phase 5)
- Drag-drop block builder, A/B testing (future)

## Phase 1 Definition of Done

- Migration 132 applied; three tables present.
- 12 unit tests passing for email/csv/import-parse helpers.
- Lists CRUD + archive, subscribers CRUD, CSV import, and add-from-leads/clients endpoints working and manually verified.
- `/agency/email` reachable from the agency nav with working Lists + Subscribers tabs.
