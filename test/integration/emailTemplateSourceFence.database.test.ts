/* eslint-disable @typescript-eslint/no-explicit-any -- Opt-in local PostgreSQL fixture. */
// Opt-in: FIGFLOW_FENCE_PG_SOCKET=<dir>:<port> against a disposable local
// cluster. Executes the real createTemplate SQL (only the db helper is
// redirected); each run uses and drops its own schema. Skipped otherwise.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

const target = process.env.FIGFLOW_FENCE_PG_SOCKET
const db = vi.hoisted(() => ({ client: null as any }))
vi.mock('~~/server/utils/db', () => {
  const one = async (sql: string, params: unknown[] = []) => (await db.client.query(sql, params)).rows[0] ?? null
  return { queryOne: one, queryOneFresh: one, queryRowsFresh: async (sql: string, params: unknown[] = []) => (await db.client.query(sql, params)).rows, execute: async (sql: string, params: unknown[] = []) => db.client.query(sql, params) }
})
vi.mock('../../server/utils/email-marketing/render', () => ({ renderTemplateDocument: async () => '<html>rendered</html>' }))

const schema = `fence_${crypto.randomUUID().replace(/-/g, '')}`
const SOURCE = '0f2c7a4e-1d1b-4c55-9a0b-7d3f6c2e9a10'
const CLIENT = '6b1d2f8e-4a3c-4e5f-8a9b-0c1d2e3f4a5b'
const body = { root: { type: 'EmailLayout', data: { props: { contentWidth: 600 }, childrenIds: ['imported'] } }, imported: { type: 'Html', data: { props: { contents: '<p>x</p>', documentMode: 'email' } } } }
const fence = (overrides: Record<string, unknown> = {}) => ({ templateId: SOURCE, bodySource: body, clientId: CLIENT, subject: 'Subject', previewText: null, folderName: 'Imports', ...overrides })

describe.skipIf(!target)('createTemplate source fence (real PostgreSQL)', () => {
  beforeAll(async () => {
    const [host, port] = target!.split(':')
    db.client = new pg.Client({ host, port: Number(port), user: process.env.FIGFLOW_FENCE_PG_USER ?? 'fence', database: 'postgres' })
    await db.client.connect()
    await db.client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`)
    // Columns of migrations 133 + 164 that createTemplate writes (FK omitted in this isolated fixture).
    await db.client.query(`CREATE TABLE edm_templates (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, subject text, preview_text text,
      body_source jsonb NOT NULL, body_html text, content_type text NOT NULL DEFAULT 'flyhub', client_id uuid, created_by uuid,
      template_kind text NOT NULL DEFAULT 'template', folder_name text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`)
    // Empty joins read by getTemplate when an insert conflicts on its identity.
    await db.client.query('CREATE TABLE email_design_documents (id uuid PRIMARY KEY, template_id uuid, head_revision_id uuid); CREATE TABLE email_design_revisions (id uuid PRIMARY KEY, document_id uuid, schema_version int)')
    await db.client.query(`INSERT INTO edm_templates (id, name, subject, body_source, client_id, template_kind, folder_name) VALUES ($1, 'Ford', 'Subject', $2::jsonb, $3, 'draft', 'Imports')`, [SOURCE, JSON.stringify(body), CLIENT])
  })
  afterAll(async () => {
    if (!db.client) return
    await db.client.query(`DROP SCHEMA ${schema} CASCADE`)
    await db.client.end()
  })

  it('inserts only while the reviewed source row is unchanged, atomically, and replays by identity', async () => {
    const { createTemplate, TemplateSourceFenceError } = await import('../../server/utils/email-marketing/templates')
    const input = (id: string) => ({ id, name: 'Copy', subject: 'Subject', preview_text: null, body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } }, template_kind: 'draft' as const, folder_name: 'Imports', client_id: CLIENT, created_by: '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a' })
    const renderer = {} as any
    // jsonb equality is semantic: reordered keys of the same source still match.
    const reordered = { imported: body.imported, root: body.root }
    const first = await createTemplate(input('a1111111-1111-4111-8111-111111111111'), renderer, { sourceFence: fence({ bodySource: reordered }) })
    expect(first).toMatchObject({ id: 'a1111111-1111-4111-8111-111111111111', name: 'Copy', client_id: CLIENT })
    expect((await createTemplate(input('a1111111-1111-4111-8111-111111111111'), renderer, { sourceFence: fence({ subject: 'Changed' }) })).id).toBe(first.id)
    for (const changed of [{ bodySource: { ...body, extra: true } }, { clientId: null }, { subject: 'Other' }, { previewText: 'Other' }, { folderName: null }, { templateId: 'b2222222-2222-4222-8222-222222222222' }])
      await expect(createTemplate(input(crypto.randomUUID()), renderer, { sourceFence: fence(changed) })).rejects.toBeInstanceOf(TemplateSourceFenceError)
    // The source changes during the awaited authority check: the single insert statement still refuses.
    await expect(createTemplate(input(crypto.randomUUID()), renderer, { sourceFence: fence(), authorize: async () => {
      await db.client.query('UPDATE edm_templates SET folder_name = $2 WHERE id = $1', [SOURCE, 'Moved'])
    } })).rejects.toBeInstanceOf(TemplateSourceFenceError)
    const { rows } = await db.client.query('SELECT count(*)::int AS n FROM edm_templates')
    expect(rows[0].n).toBe(2)
  })

  it('keeps the server import receipt write-once through content saves (rewrite, removal, impostor)', async () => {
    const { createTemplate, updateTemplate, getTemplate } = await import('../../server/utils/email-marketing/templates')
    const renderer = {} as any
    const receipt = { fingerprint: 'f'.repeat(64), operation: 'editable-copy', binding: { name: 'Reviewed copy', requestKey: 'k1' } }
    const withReceipt = { root: { type: 'EmailLayout', data: { props: { importReceipt: receipt }, childrenIds: [] } } }
    const copy = await createTemplate({ id: 'c3333333-3333-4333-8333-333333333333', name: 'Reviewed copy', body_source: withReceipt, template_kind: 'draft', client_id: CLIENT, created_by: '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a' }, renderer)
    const readReceipt = async (id: string) => (await getTemplate(id) as any)?.body_source?.root?.data?.props?.importReceipt ?? null
    expect(await readReceipt(copy.id)).toEqual(receipt)
    // A content save that rewrites the binding keeps the original receipt.
    const rewritten = structuredClone(withReceipt)
    rewritten.root.data.props.importReceipt = { ...receipt, binding: { name: 'DIFFERENT command', requestKey: 'k1' } }
    await updateTemplate(copy.id, { body_source: { ...rewritten, extra: { type: 'Text', data: { props: { text: 'edit' } } } } }, renderer)
    expect(await readReceipt(copy.id)).toEqual(receipt)
    expect((await getTemplate(copy.id) as any).body_source.extra).toBeTruthy()
    // Removing the receipt (or the whole props object) does not remove it.
    await updateTemplate(copy.id, { body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } } }, renderer)
    expect(await readReceipt(copy.id)).toEqual(receipt)
    // A template without a receipt cannot gain one through a content save.
    const plain = await createTemplate({ id: 'd4444444-4444-4444-8444-444444444444', name: 'Plain', body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } }, template_kind: 'draft', client_id: CLIENT, created_by: null }, renderer)
    await updateTemplate(plain.id, { body_source: withReceipt }, renderer)
    expect(await readReceipt(plain.id)).toBeNull()
    // Metadata-only saves leave it unchanged too.
    await updateTemplate(copy.id, { name: 'Renamed' }, renderer)
    expect(await readReceipt(copy.id)).toEqual(receipt)
    // Rootless or non-object content is refused before any write; the receipt stays.
    const { TemplateSourceShapeError } = await import('../../server/utils/email-marketing/templates')
    for (const malformed of [{}, [], null, 'x', { root: 'x' }, { root: [] }, { root: { data: 'x' } }, { root: { data: { props: 'x' } } }]) {
      await expect(updateTemplate(copy.id, { body_source: malformed }, renderer)).rejects.toBeInstanceOf(TemplateSourceShapeError)
      expect(await readReceipt(copy.id)).toEqual(receipt)
    }
    expect((await getTemplate(copy.id) as any).name).toBe('Renamed')
    // A row without a receipt keeps the previous behaviour for the same content.
    await updateTemplate(plain.id, { body_source: {} }, renderer)
    expect((await getTemplate(plain.id) as any).body_source).toEqual({})
  })
})
