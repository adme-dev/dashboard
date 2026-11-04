import { beforeEach, describe, expect, it, vi } from 'vitest'
import { structuredDesign } from '../fixtures/email-design/structured'
import { testEmailRenderer } from '../fixtures/emailRenderer'
import { updateTemplate } from '../../server/utils/email-marketing/templates'

const db = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: db.read, queryOne: db.write, queryRowsFresh: vi.fn(), execute: vi.fn() }))
const scope = '10000000-0000-4000-8000-000000000001'
const row = () => ({ id: '20000000-0000-4000-8000-000000000001', client_id: scope, name: 'Original', folder_name: 'Original folder', template_kind: 'template', design_document_id: '30000000-0000-4000-8000-000000000001', revision_schema_version: 1, head_revision_id: '40000000-0000-4000-8000-000000000001', subject: 'Saved subject', preview_text: 'Saved preview', body_source: structuredDesign().blocks, body_html: '<p>Exact saved output</p>' })
const forbiddenRenderer = { ...testEmailRenderer, renderDocument: async () => {
  throw new Error('render invoked')
} }
beforeEach(() => {
  vi.resetAllMocks()
  db.read.mockResolvedValue(row())
})
describe('existing canonical published template label owner', () => {
  it('updates only explicit library labels and timestamp with the original client CAS, preserving saved output', async () => {
    db.write.mockImplementation(async (sql: string, params: unknown[]) => {
      const set = sql.split(/SET/i)[1].split(/WHERE/i)[0]
      expect(set).toContain('name = $1')
      expect(set).toContain('folder_name = $2')
      expect(set).toContain('updated_at = NOW()')
      expect(set).not.toMatch(/body_|subject|preview|revision|client_id|template_kind/)
      expect(sql).toContain('client_id IS NOT DISTINCT FROM')
      expect(params).toEqual(['Renamed', 'Seasonal', row().id, scope])
      return { ...row(), name: 'Renamed', folder_name: 'Seasonal' }
    })
    expect(await updateTemplate(row().id, { name: 'Renamed', folder_name: ' Seasonal ' }, forbiddenRenderer, scope)).toEqual({ ...row(), name: 'Renamed', folder_name: 'Seasonal' })
  })
  it('preserves omitted labels while clearing an explicit folder and retaining CAS failure', async () => {
    db.write.mockImplementation(async (sql: string, params: unknown[]) => {
      expect(sql.split(/SET/i)[1].split(/WHERE/i)[0]).not.toMatch(/\bname\s*=/)
      expect(params).toEqual([null, row().id, scope])
      return null // The owner moved out of the original authorized scope.
    })
    expect(await updateTemplate(row().id, { folder_name: null }, forbiddenRenderer)).toBeNull()
  })
  it('rejects stale caller client scope before any label write', async () => {
    expect(await updateTemplate(row().id, { name: 'Wrong scope' }, forbiddenRenderer, null)).toBeNull()
    expect(db.write).not.toHaveBeenCalled()
  })
  it.each([{ name: 'Mixed', subject: 'Changed' }, { name: 'Mixed', client_id: scope }, { name: 'Mixed', body_source: structuredDesign().blocks }, { name: 'Mixed', template_kind: 'draft' as const }])('does not use the labels branch for mixed content/scope/kind patch %j', async (patch) => {
    await expect(updateTemplate(row().id, patch, forbiddenRenderer, scope)).rejects.toThrow('render invoked')
    expect(db.write).not.toHaveBeenCalled()
  })
  it.each([{ template_kind: 'draft', revision_schema_version: 1 }, { template_kind: 'template', revision_schema_version: 0 }, { template_kind: 'template', design_document_id: null }])('preserves the existing rendering path for draft/legacy owner %j', async (identity) => {
    db.read.mockResolvedValue({ ...row(), ...identity })
    await expect(updateTemplate(row().id, { name: 'Old path' }, forbiddenRenderer, scope)).rejects.toThrow('render invoked')
  })
})
