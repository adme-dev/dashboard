/* eslint-disable @typescript-eslint/no-explicit-any -- Compact mocked UI/API fixtures. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../server/api/email/templates/import.post'
import { snapshotRenderInput } from '../../shared/emailRendering/bounds'

const mocks = vi.hoisted(() => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
  vi.stubGlobal('createError', (input: any) => Object.assign(new Error(input.statusMessage), input))
  return { auth: vi.fn(), scope: vi.fn(), create: vi.fn(), render: vi.fn() }
})
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/email-marketing/access', () => ({ resolveEmailWriteClientId: mocks.scope }))
vi.mock('~~/server/utils/email-marketing/templates', () => ({ createTemplate: mocks.create }))
vi.mock('~~/server/utils/email-marketing/render/client', () => ({ createEmailRenderer: () => ({ renderDocument: mocks.render }) }))
let raw: string
const event = { context: {} } as any
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('readRawBody', async () => raw)
  mocks.auth.mockResolvedValue({ id: 'writer' })
  mocks.scope.mockResolvedValue('scoped-client')
  mocks.render.mockResolvedValue('<html>Preview</html>')
  mocks.create.mockResolvedValue({ id: 'new' })
  raw = JSON.stringify({ format: 'html', content: '<p>Hello</p>', name: 'Import' })
})
describe('import API', () => {
  it('previews without persisting and resolves client authorization', async () => {
    expect(await handler(event)).toMatchObject({ html: '<html>Preview</html>', blocks: 1 })
    expect(mocks.scope).toHaveBeenCalledWith(event, { id: 'writer' }, null)
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('previews a missing optional subject through the strict renderer boundary', async () => {
    mocks.render.mockImplementationOnce(async (_document, options) => { snapshotRenderInput(options); return '<html>Preview</html>' })
    expect(await handler(event)).toMatchObject({ html: '<html>Preview</html>' })
    expect(mocks.render).toHaveBeenCalledWith(expect.anything(), {})
  })
  it('saves only explicitly via existing create pipeline', async () => {
    raw = JSON.stringify({ ...JSON.parse(raw), save: true })
    expect(await handler(event)).toEqual({ template: { id: 'new' } })
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'scoped-client', created_by: 'writer', template_kind: 'template' }), expect.anything())
  })
  it('preserves explicit draft classification and rejects unsupported kinds', async () => {
    raw = JSON.stringify({ ...JSON.parse(raw), save: true, template_kind: 'draft', name: 'a'.repeat(200), folder_name: 'Official OEM / Geely', preview_text: 'Vehicle launch' })
    await handler(event)
    expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ template_kind: 'draft', folder_name: 'Official OEM / Geely', preview_text: 'Vehicle launch', name: 'a'.repeat(200) }), expect.anything())
    raw = JSON.stringify({ ...JSON.parse(raw), template_kind: 'approved' })
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects authentication and client scope failures before render or persistence', async () => {
    mocks.auth.mockRejectedValueOnce(new Error('unauthorized'))
    await expect(handler(event)).rejects.toThrow('unauthorized')
    mocks.scope.mockRejectedValueOnce(new Error('forbidden'))
    await expect(handler(event)).rejects.toThrow('forbidden')
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.render).not.toHaveBeenCalled()
  })
  it('rejects invalid and oversized requests', async () => {
    raw = '{}'
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 400 })
    raw = 'x'.repeat(1024 * 1024 + 1)
    await expect(handler(event)).rejects.toMatchObject({ statusCode: 413 })
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
