import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canDeleteBannerTemplate } from '../../shared/bannerTemplatePermissions'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
  writeAccess: vi.fn(),
  creativeAccess: vi.fn(),
  id: '44444444-4444-4444-8444-444444444444' as string | undefined
}))
vi.mock('~~/server/utils/db', () => ({ transaction: mocks.transaction }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.writeAccess, requireRole: mocks.creativeAccess }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getRouterParam', () => mocks.id)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (options: { statusCode: number, statusMessage: string }) => Object.assign(new Error(options.statusMessage), options))

const { default: deleteNative } = await import('../../server/api/agency/banner-studio/templates/[id].delete')
const { default: deleteHtml } = await import('../../server/api/agency/banner-studio/custom-templates/[id].delete')
const creator = { id: 'creator', role: 'creative' }
const ownTemplate = { createdBy: 'creator', isSystem: false }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query.mockReset()
  mocks.writeAccess.mockReset().mockResolvedValue(creator)
  mocks.creativeAccess.mockReset().mockResolvedValue(creator)
  mocks.transaction.mockReset().mockImplementation(async callback => callback({ query: mocks.query }))
  mocks.id = '44444444-4444-4444-8444-444444444444'
})

describe('template deletion permissions shared with the gallery', () => {
  it('allows creative owners to delete their own saved templates only', () => {
    expect(canDeleteBannerTemplate(creator, ownTemplate)).toBe(true)
    expect(canDeleteBannerTemplate(creator, { ...ownTemplate, createdBy: 'someone-else' })).toBe(false)
    expect(canDeleteBannerTemplate(creator, { ...ownTemplate, isSystem: true })).toBe(false)
    expect(canDeleteBannerTemplate(creator, { createdBy: null })).toBe(false)
  })

  it.each(['owner', 'admin'])('allows %s to delete system and other creators’ templates', (role) => {
    expect(canDeleteBannerTemplate({ id: 'administrator', role }, { createdBy: 'someone-else', isSystem: true })).toBe(true)
  })

  it('honours dynamic creative and administration groups without granting unrelated roles', () => {
    expect(canDeleteBannerTemplate({ id: 'creator', role: 'custom', permissionGroups: ['CREATIVE'] }, ownTemplate)).toBe(true)
    expect(canDeleteBannerTemplate({ id: 'admin', role: 'custom', permissionGroups: ['CREATIVE', 'ADMIN'] }, { isSystem: true })).toBe(true)
    expect(canDeleteBannerTemplate({ id: 'creator', role: 'finance' }, ownTemplate)).toBe(false)
    expect(canDeleteBannerTemplate({ id: 'creator', role: 'custom', permissionGroups: ['ADMIN'] }, ownTemplate)).toBe(false)
  })

  it('denies read-only users even when ownership or permission groups match', () => {
    for (const role of ['viewer', 'guest']) {
      expect(canDeleteBannerTemplate({ id: 'creator', role, permissionGroups: ['CREATIVE', 'ADMIN'] }, ownTemplate)).toBe(false)
    }
    expect(canDeleteBannerTemplate({ id: 'creator', role: 'admin', isCustomReadOnly: true }, ownTemplate)).toBe(false)
    expect(canDeleteBannerTemplate(null, ownTemplate)).toBe(false)
  })
})

describe.each([
  ['native', deleteNative, 'banner_templates'],
  ['HTML', deleteHtml, 'banner_custom_templates']
] as const)('%s template deletion endpoint', (_label, handler, table) => {
  it('requires write and creative access before reading or deleting anything', async () => {
    mocks.writeAccess.mockRejectedValueOnce(Object.assign(new Error('read-only'), { statusCode: 403 }))
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.creativeAccess).not.toHaveBeenCalled()
    expect(mocks.transaction).not.toHaveBeenCalled()

    mocks.creativeAccess.mockRejectedValueOnce(Object.assign(new Error('not creative'), { statusCode: 403 }))
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it.each([undefined, 'not-an-id', '123\' OR TRUE --'])('rejects invalid template ID %s', async (id) => {
    mocks.id = id
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('checks current ownership under the row lock and denies another creator', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ createdBy: 'someone-else', isSystem: false }] })
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls[0]?.[0]).toContain(`FROM ${table} WHERE id = $1 FOR UPDATE`)
  })

  it('does not let a creator remove a system template', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ ...ownTemplate, isSystem: true }] })
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('returns not found for a missing or previously deleted template', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [] })
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.query).toHaveBeenCalledTimes(1)
  })

  it('lets administrators delete an unused system template in the same transaction', async () => {
    mocks.writeAccess.mockResolvedValueOnce({ id: 'admin', role: 'admin' })
    mocks.query.mockResolvedValueOnce({ rows: [{ createdBy: null, isSystem: true }] }).mockResolvedValue({ rows: [] })
    await expect(handler({} as never)).resolves.toMatchObject({ success: true })
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.query.mock.calls.at(-1)).toEqual([`DELETE FROM ${table} WHERE id = $1`, [mocks.id]])
  })
})

describe('HTML template reference protection', () => {
  it('returns a conflict without cascading any dependent banners', async () => {
    mocks.query.mockResolvedValueOnce({ rows: [ownTemplate] }).mockResolvedValueOnce({ rows: [{ id: 'existing-banner' }] })
    await expect(deleteHtml({} as never)).rejects.toMatchObject({ statusCode: 409, statusMessage: expect.stringContaining('existing banners') })
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(mocks.query.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    expect(mocks.query.mock.calls[1]).toEqual(['SELECT id FROM banner_custom_instances WHERE template_id = $1 LIMIT 1', [mocks.id]])
    expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(false)
  })

  it('waits for the parent row lock before checking FK references', async () => {
    let releaseLock!: (value: { rows: typeof ownTemplate[] }) => void
    mocks.query.mockImplementationOnce(() => new Promise((resolve) => {
      releaseLock = resolve
    })).mockResolvedValue({ rows: [] })
    const deletion = deleteHtml({} as never)
    await vi.waitFor(() => expect(mocks.query).toHaveBeenCalledTimes(1))
    expect(mocks.query.mock.calls[0]?.[0]).toContain('FOR UPDATE')
    releaseLock({ rows: [ownTemplate] })
    await expect(deletion).resolves.toMatchObject({ success: true })
    expect(mocks.query.mock.calls.map(([sql]) => sql.trim().split(' ')[0])).toEqual(['SELECT', 'SELECT', 'DELETE'])
  })
})
