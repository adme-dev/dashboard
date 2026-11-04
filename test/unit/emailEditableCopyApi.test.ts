/* eslint-disable @typescript-eslint/no-explicit-any -- Compact mocked API fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import handler from '../../server/api/email/templates/[id]/editable-copy.post'
import { importRequestTemplateId } from '../../server/utils/email-marketing/templateImportSave'
import { sanitizeImportedEmailDocument } from '../../server/utils/email-marketing/importedEmailDocument'

// The real route and the real receipt-bound import owner run against an
// in-memory persistence port that mirrors createTemplate's contract: render,
// fresh authority, then one fenced insert (ON CONFLICT returns the existing row).
const mocks = vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))
  class TemplateSourceFenceError extends Error {}
  return { read: vi.fn(), write: vi.fn(), access: vi.fn(), scope: vi.fn(), render: vi.fn(), rows: new Map<string, any>(), renderGate: { wait: async () => {} }, TemplateSourceFenceError, inserts: 0 }
})
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.read, requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/email-marketing/access', () => ({ assertEmailClientAccess: mocks.access, resolveEmailWriteClientId: mocks.scope }))
vi.mock('~~/server/utils/email-marketing/render', () => ({ renderTemplateDocument: mocks.render }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({}) }))
vi.mock('~~/server/utils/email-marketing/templates', () => ({
  TemplateSourceFenceError: mocks.TemplateSourceFenceError,
  getTemplate: async (id: string) => structuredClone(mocks.rows.get(id) ?? null),
  createTemplate: async (input: any, _renderer: unknown, options: any = {}) => {
    await mocks.renderGate.wait()
    if (options.authorize) await options.authorize()
    if (mocks.rows.has(input.id)) return structuredClone(mocks.rows.get(input.id))
    const fence = options.sourceFence
    const source = fence && mocks.rows.get(fence.templateId)
    if (fence && (!source || JSON.stringify(source.body_source) !== JSON.stringify(fence.bodySource) || (source.client_id ?? null) !== fence.clientId
      || (source.subject ?? null) !== fence.subject || (source.preview_text ?? null) !== fence.previewText || (source.folder_name ?? null) !== fence.folderName))
      throw new mocks.TemplateSourceFenceError('fenced')
    mocks.inserts++
    const row = { ...structuredClone(input), template_kind: input.template_kind ?? 'template' }
    mocks.rows.set(input.id, row)
    return structuredClone(row)
  }
}))

const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '33333333-3333-4333-8333-333333333333'
const KEY = '22222222-2222-4222-8222-222222222222'
const { html } = sanitizeImportedEmailDocument('<!doctype html><html><body><table width="600"><tr><td><img src="https://cdn.example.com/hero.png" width="600" alt="Hero"></td></tr><tr><td>Plain copy</td></tr></table></body></html>')
const importedSource = { root: { type: 'EmailLayout', data: { props: { contentWidth: 600, sourceProvenance: { provider: 'OEM', notes: 'kept', originalSha256: 'a'.repeat(64) } }, childrenIds: ['imported'] } }, imported: { type: 'Html', data: { props: { contents: html, documentMode: 'email' } } } }
const sourceRow = () => ({ id: 'source-id', name: 'Ford October', subject: 'Subject', preview_text: 'Preview', body_source: structuredClone(importedSource), body_html: '<html>original</html>', client_id: CLIENT, folder_name: 'Imports', template_kind: 'draft', created_by: 'author' })
const digest = (row: any) => createHash('sha256').update(JSON.stringify({ id: row.id, client_id: row.client_id ?? null, subject: row.subject ?? null, preview_text: row.preview_text ?? null, folder_name: row.folder_name ?? null, body_source: row.body_source ?? null })).digest('hex')
let body: any
const event = { context: {} } as any
const save = (overrides: Record<string, unknown> = {}) => ({ save: true, request_key: KEY, name: 'Ford October (editable)', source_digest: digest(sourceRow()), ...overrides })
const receiptId = () => importRequestTemplateId('writer', KEY, 'editable-copy')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.rows.clear()
  mocks.rows.set('source-id', sourceRow())
  mocks.inserts = 0
  mocks.renderGate.wait = async () => {}
  vi.stubGlobal('readBody', async () => body)
  vi.stubGlobal('getRouterParam', () => 'source-id')
  mocks.read.mockResolvedValue({ id: 'reader' })
  mocks.write.mockResolvedValue({ id: 'writer' })
  mocks.access.mockResolvedValue(undefined)
  mocks.scope.mockImplementation(async (_event, _user, client) => client)
  mocks.render.mockResolvedValue('<html>copy</html>')
  body = { save: false }
})

describe('editable copy API', () => {
  it('previews the copy and the stored original, binding every copied field, without writing', async () => {
    const result = await handler(event) as any
    expect(result).toMatchObject({ html: '<html>copy</html>', original_html: '<html>original</html>', source_id: 'source-id', source_digest: digest(sourceRow()) })
    expect(result.report).toMatchObject({ native: 2, protected: 0 })
    expect(mocks.write).not.toHaveBeenCalled()
    expect(mocks.access).toHaveBeenCalledWith(event, { id: 'reader' }, CLIENT)
    expect(mocks.inserts).toBe(0)
  })

  it('saves a NEW fenced draft with a typed receipt in its own namespace, leaving the original untouched', async () => {
    body = save()
    expect(await handler(event)).toMatchObject({ template: { id: await receiptId(), client_id: CLIENT, template_kind: 'draft' } })
    const copy = mocks.rows.get(await receiptId())
    expect(copy).toMatchObject({ name: 'Ford October (editable)', subject: 'Subject', preview_text: 'Preview', client_id: CLIENT, folder_name: 'Imports', created_by: 'writer' })
    expect(copy.body_source.root.data.props.importReceipt).toMatchObject({ operation: 'editable-copy', binding: { operation: 'editable-copy', version: 1, writer: 'writer', requestKey: KEY, sourceTemplateId: 'source-id', sourceDigest: digest(sourceRow()), name: 'Ford October (editable)', clientId: CLIENT } })
    expect(copy.body_source.imported).toBeUndefined()
    expect(mocks.rows.get('source-id')).toEqual(sourceRow())
    // Ordinary imports keep their own unchanged identity namespace.
    expect(await importRequestTemplateId('writer', KEY)).not.toBe(await receiptId())
  })

  it('replays only the exact typed command; a changed name, digest or source under the same key is a conflict', async () => {
    body = save()
    await handler(event)
    expect(await handler(event)).toMatchObject({ template: { id: await receiptId() }, replayed: true })
    for (const changed of [{ name: 'Another name' }, { source_digest: 'b'.repeat(64) }]) {
      body = save(changed)
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { outcome: 'conflict' } })
    }
    vi.stubGlobal('getRouterParam', () => 'other-source')
    body = save()
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { outcome: 'conflict' } })
    expect(mocks.inserts).toBe(1)
  })

  it('never treats authorable provenance as a receipt', async () => {
    // An impostor at the request identity with matching provenance but no typed receipt.
    mocks.rows.set(await receiptId(), { id: await receiptId(), name: 'Old', created_by: 'writer', client_id: CLIENT, template_kind: 'draft', body_source: { root: { type: 'EmailLayout', data: { props: { sourceProvenance: { importForm: 'editable-copy', notes: 'Editable copy converted from template source-id.' } } } } } })
    body = save()
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { outcome: 'conflict' } })
    expect(mocks.inserts).toBe(0)
  })

  it('recovers a committed copy after a lost reply even when the original is later deleted or moved', async () => {
    body = save()
    await handler(event)
    mocks.rows.delete('source-id')
    expect(await handler(event)).toMatchObject({ template: { id: await receiptId() }, replayed: true })
    mocks.rows.set('source-id', { ...sourceRow(), client_id: OTHER, body_source: { changed: true } })
    expect(await handler(event)).toMatchObject({ replayed: true })
    // Recovery still requires current access to the copy's own scope.
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.inserts).toBe(1)
  })

  it('reports a stale source without claiming that nothing was committed', async () => {
    body = save()
    mocks.rows.delete('source-id')
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 404, data: { outcome: 'stale' } })
    for (const change of [{ client_id: OTHER }, { subject: 'Edited subject' }, { folder_name: 'Moved' }, { preview_text: null }]) {
      mocks.rows.set('source-id', { ...sourceRow(), ...change })
      await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { outcome: 'stale' } })
    }
    expect(mocks.inserts).toBe(0)
  })

  it('fences the insert: a source change or access loss while rendering creates nothing', async () => {
    body = save()
    mocks.renderGate.wait = async () => {
      mocks.rows.set('source-id', { ...sourceRow(), client_id: OTHER })
    }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 409, data: { outcome: 'stale' } })
    mocks.rows.set('source-id', sourceRow())
    mocks.renderGate.wait = async () => {
      mocks.write.mockRejectedValueOnce(Object.assign(new Error('revoked'), { statusCode: 403 }))
    }
    const failure = await handler(event).catch((error: any) => error)
    expect(failure).toMatchObject({ statusCode: 403 })
    expect(failure.data?.outcome).toBeUndefined()
    expect(mocks.inserts).toBe(0)
  })

  it('a delayed writer can still commit after a retry saw a changed source, and that retry then recovers it', async () => {
    body = save()
    let release!: () => void
    const paused = new Promise<void>((resolve) => {
      release = resolve
    })
    let reached!: () => void
    const atInsert = new Promise<void>((resolve) => {
      reached = resolve
    })
    mocks.renderGate.wait = async () => {
      reached()
      await paused
    }
    const first = handler(event)
    await atInsert
    // Retry B while A is paused before its fenced insert: the source changed.
    mocks.renderGate.wait = async () => {}
    mocks.rows.set('source-id', { ...sourceRow(), subject: 'Edited' })
    const retry = await handler(event).catch((error: any) => error)
    expect(retry).toMatchObject({ statusCode: 409, data: { outcome: 'stale' } })
    // The source is restored (e.g. Undo); A's exact reviewed predicate passes.
    mocks.rows.set('source-id', sourceRow())
    release()
    expect(await first).toMatchObject({ template: { id: await receiptId() } })
    expect(await handler(event)).toMatchObject({ template: { id: await receiptId() }, replayed: true })
    expect(mocks.inserts).toBe(1)
  })

  it('replays against the write-once binding even after the copy moves client, while requiring access to its current scope', async () => {
    body = save()
    await handler(event)
    const copy = mocks.rows.get(await receiptId())
    mocks.rows.set(await receiptId(), { ...copy, client_id: OTHER })
    expect(await handler(event)).toMatchObject({ replayed: true })
    expect(mocks.access).toHaveBeenLastCalledWith(event, { id: 'writer' }, OTHER)
  })

  it('rejects malformed requests, non-imported sources and denied access before writing', async () => {
    body = { save: true, name: 'Copy', source_digest: digest(sourceRow()) }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    body = { save: false, client_id: CLIENT }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    mocks.rows.set('source-id', { ...sourceRow(), body_source: { root: { type: 'EmailLayout', data: { childrenIds: [] } } } })
    body = { save: false }
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 422 })
    mocks.rows.set('source-id', sourceRow())
    mocks.access.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.scope.mockResolvedValueOnce(OTHER)
    body = save()
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    mocks.write.mockRejectedValueOnce(Object.assign(new Error('read only'), { statusCode: 403 }))
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.inserts).toBe(0)
  })
})
