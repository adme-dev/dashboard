import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/agency/banner-studio/effects/presets.post'

const mocks = vi.hoisted(() => ({ write: vi.fn(), project: vi.fn(), scope: vi.fn(), references: vi.fn(), insert: vi.fn() }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readBody: async (event: { body: unknown }) => event.body }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/banner/effectScope', () => ({ requireBannerEffectProject: mocks.project }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: mocks.scope }))
vi.mock('~~/server/utils/banner/designReferences', () => ({ resolveDesignReferences: mocks.references }))
vi.mock('~~/server/utils/db', () => ({ queryOne: mocks.insert }))
const id = '11111111-1111-4111-8111-111111111111'
const client = '22222222-2222-4222-8222-222222222222'
const recipe = { style: { color: '#ffffff' }, prompt: 'Chrome', modelId: 'aigateway/recraft-offer-card', referenceIds: [], referenceProjectId: null }
const request = (overrides = {}) => ({ body: { projectId: id, name: 'Chrome', scope: 'client', recipe, ...overrides } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue({ id: 'author' })
  mocks.project.mockResolvedValue({ id, client_id: client })
  mocks.insert.mockResolvedValue({ id: 'saved' })
})
describe('Effect preset write authority', () => {
  it('derives ownership from the authorized project and records author', async () => {
    await handler(request() as never)
    expect(mocks.insert).toHaveBeenCalledWith(expect.stringContaining('created_by'), ['Chrome', client, JSON.stringify(recipe), 'author'])
  })
  it('denies viewers before project reads', async () => {
    mocks.write.mockRejectedValue({ statusCode: 403 })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.project).not.toHaveBeenCalled()
  })
  it('requires agency authority for shared presets', async () => {
    mocks.scope.mockRejectedValue({ statusCode: 403 })
    await expect(handler(request({ scope: 'agency' }) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
  it('rejects foreign-client references before loading private manifests', async () => {
    mocks.project.mockResolvedValueOnce({ id, client_id: client }).mockResolvedValueOnce({ id, client_id: id })
    await expect(handler(request({ recipe: { ...recipe, referenceIds: [id], referenceProjectId: id } }) as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.references).not.toHaveBeenCalled()
  })
  it('rejects unsafe styles and forged ownership', async () => {
    await expect(handler(request({ clientId: id }) as never)).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler(request({ recipe: { ...recipe, style: { visualFilter: 'url(https://evil.test)' } } }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
