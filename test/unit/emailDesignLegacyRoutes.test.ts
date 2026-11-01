import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: async () => ({ id: 'actor' })
}))
vi.mock('~~/server/utils/email-marketing/access', () => ({
  assertEmailClientAccess: async () => {},
  assertEmailClientIdInScope: () => {},
  resolveEmailClientScope: async () => 'all'
}))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({
  createEmailRenderer: () => ({})
}))
vi.mock('~~/server/utils/email-marketing/templates', () => ({
  getTemplate: async () => ({ id: 'template', client_id: null }),
  updateTemplate: mocks.update,
  deleteTemplate: mocks.remove
}))
vi.stubGlobal('defineEventHandler', (f: unknown) => f)
vi.stubGlobal('createError', createError)
vi.stubGlobal('getRouterParam', () => 'template')
vi.stubGlobal('readBody', async () => ({ name: 'Renamed' }))
const patch = (await import('../../server/utils/email-marketing/templateUpdateHandler'))
  .default
const remove = (await import('../../server/utils/email-marketing/templateDeleteHandler'))
  .default
const event = { context: {} } as Parameters<typeof patch>[0]
describe('existing template routes with versioned history', () => {
  beforeEach(() => vi.resetAllMocks())
  it('keeps ordinary legacy updates working', async () => {
    mocks.update.mockResolvedValue({ id: 'template' })
    expect(await patch(event)).toEqual({ template: { id: 'template' } })
  })
  it('returns 409 for stale legacy content writes', async () => {
    mocks.update.mockRejectedValue({
      code: '55000',
      constraint: 'email_design_revision_required',
      detail: 'private source'
    })
    await expect(patch(event)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'email_design_revision_required'
    })
  })
  it('returns 409 when deletion would erase a referenced template', async () => {
    mocks.remove.mockRejectedValue({
      code: '23503',
      constraint: 'email_design_documents_template_id_fkey'
    })
    await expect(remove(event)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('keeps ordinary unversioned deletion working', async () => {
    mocks.remove.mockResolvedValue(true)
    expect(await remove(event)).toEqual({ ok: true })
  })
})
