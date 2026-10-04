import { beforeEach, describe, expect, it, vi } from 'vitest'
import handler from '../../../server/api/agency/banner-studio/ai/design-assist.post'

const mocks = vi.hoisted(() => ({ write: vi.fn(), scope: vi.fn(), project: vi.fn(), assets: vi.fn(), kit: vi.fn(), edge: vi.fn(), groq: vi.fn(), assignment: vi.fn(), references: vi.fn(), styleGuide: vi.fn() }))
vi.mock('h3', async importOriginal => ({ ...await importOriginal<typeof import('h3')>(), readBody: async (event: { body: unknown }) => event.body }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mocks.write }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: mocks.scope }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.project, queryRowsFresh: mocks.assets }))
vi.mock('~~/server/utils/banner/brandKits', () => ({ getDefaultBrandKitForClient: mocks.kit, brandContextBlock: (kit: { name: string }) => kit?.name || '' }))
vi.mock('~~/server/utils/banner/designReferences', () => ({ resolveDesignReferences: mocks.references, loadDesignClientStyleGuide: mocks.styleGuide }))
vi.mock('~~/server/utils/edgeAi', () => ({ edgeGenerate: mocks.edge }))
vi.mock('~~/server/utils/groqClient', () => ({ generateGroqInsight: mocks.groq, GROQ_MODELS: { REASONING_120B: 'openai/gpt-oss-120b', REASONING_20B: 'openai/gpt-oss-20b', LLAMA_70B: 'llama-3.3-70b-versatile', LLAMA_8B: 'llama-3.1-8b-instant' } }))
vi.mock('~~/server/utils/ai/modelAssignments', () => ({ resolveAiModelAssignment: mocks.assignment, groqModelIdFromAssignment: (value: string) => value.replace(/^groq\//, '') }))

const projectId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const url = 'https://assets.example.com/owned.png'
function canvas() {
  return { fb_sq: { layers: [{ id: 1, name: 'Artwork', type: 'image', src: url, x: 0, y: 0, w: 1080, h: 1080, zIndex: 0, opacity: 1, animIn: 'none', animInDur: 0, startTime: 0, endTime: 5 }] } }
}
const valid = JSON.stringify({ reply: 'Move the artwork.', updates: [{ formatKey: 'fb_sq', layerId: 1, changes: { x: 20 } }] })
const request = (overrides = {}) => ({ body: { projectId, prompt: 'Move the artwork', canvasData: canvas(), activeKey: 'fb_sq', model: 'auto', ...overrides } })
const call = (event = request()) => handler(event as never)

beforeEach(() => {
  vi.resetAllMocks()
  mocks.write.mockResolvedValue({ id: 'user-1' })
  mocks.scope.mockResolvedValue({ id: 'user-1' })
  mocks.project.mockResolvedValue({ name: 'Test project', client_id: clientId, canvas_data: canvas() })
  mocks.assets.mockResolvedValue([])
  mocks.kit.mockResolvedValue({ name: 'Client brand', clientId, logos: [] })
  mocks.assignment.mockResolvedValue({ provider: 'workers_ai', modelId: '@cf/meta/llama-3.1-8b-instruct', fallbackModelId: 'llama-3.3-70b-versatile', source: 'override' })
  mocks.references.mockResolvedValue({ references: [], guideText: '', assetUrls: [] })
  mocks.styleGuide.mockResolvedValue('')
  mocks.edge.mockResolvedValue(valid)
})

describe('Banner native AI proposal endpoint', () => {
  it('uses fresh project/client context, unsaved edits and tracked automatic routing', async () => {
    const event = request()
    event.body.canvasData.fb_sq.layers[0].y = 123
    const before = structuredClone(event.body)
    const result = await call(event)
    expect(mocks.project).toHaveBeenCalledWith(expect.stringContaining('FROM banner_projects'), [projectId])
    expect(mocks.scope).toHaveBeenCalledWith(event, clientId)
    expect(mocks.kit).toHaveBeenCalledWith(clientId)
    expect(mocks.edge).toHaveBeenCalledWith(event, expect.stringContaining('Client brand'), expect.objectContaining({ userId: 'user-1', clientId, featureKey: 'banner_design_assist', modelId: '@cf/meta/llama-3.1-8b-instruct' }))
    expect(JSON.parse(mocks.edge.mock.calls[0][1]).canvasData.fb_sq.layers[0].y).toBe(123)
    expect(result.canvasData.fb_sq.layers[0]).toMatchObject({ x: 20, y: 123 })
    expect(event.body).toEqual(before)
    expect(result.model).toBe('workers_ai/@cf/meta/llama-3.1-8b-instruct')
  })
  it('denies a foreign client before retrieving any brand, assets or model context', async () => {
    mocks.scope.mockRejectedValue(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.kit).not.toHaveBeenCalled()
    expect(mocks.assets).not.toHaveBeenCalled()
    expect(mocks.edge).not.toHaveBeenCalled()
  })
  it('denies read-only users before loading the project', async () => {
    mocks.write.mockRejectedValue(Object.assign(new Error('Read only'), { statusCode: 403 }))
    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.project).not.toHaveBeenCalled()
  })
  it('uses all-client access scope for agency projects', async () => {
    mocks.project.mockResolvedValue({ name: 'Agency project', client_id: null, canvas_data: canvas() })
    mocks.kit.mockResolvedValue(null)
    await call()
    expect(mocks.scope).toHaveBeenCalledWith(expect.anything(), undefined)
  })
  it('rejects an unsaved foreign URL before sending it to a provider', async () => {
    const event = request()
    event.body.canvasData.fb_sq.layers[0].src = 'https://other-client.example.com/private.png'
    await expect(call(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.edge).not.toHaveBeenCalled()
  })
  it('rejects explicitly foreign library ownership even when referenced by a saved canvas or kit', async () => {
    mocks.assets.mockResolvedValueOnce([]).mockResolvedValueOnce([{ url }])
    mocks.kit.mockResolvedValue({ name: 'Client brand', clientId, logos: [{ name: 'Old logo', url }] })
    await expect(call()).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.edge).not.toHaveBeenCalled()
    expect(mocks.assets.mock.calls[1][0]).not.toContain('LIMIT')
  })
  it('permits client-owned library assets for an unsaved proposal and follow-ups', async () => {
    const newUrl = 'https://assets.example.com/new-client-image.png'
    mocks.assets.mockResolvedValueOnce([{ name: 'New art', url: newUrl, client_id: clientId }]).mockResolvedValueOnce([])
    const event = request()
    event.body.canvasData.fb_sq.layers[0].src = newUrl
    expect((await call(event)).canvasData.fb_sq.layers[0].src).toBe(newUrl)
  })
  it('rejects malformed provider output without silently falling back or changing input', async () => {
    mocks.edge.mockResolvedValue('{"reply":"Everything is done","updates":[{"html":"bad"}]}')
    const event = request()
    const before = structuredClone(event)
    await expect(call(event)).rejects.toMatchObject({ statusCode: 502 })
    expect(event).toEqual(before)
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('fails closed when all providers are unavailable', async () => {
    mocks.edge.mockResolvedValue(null)
    mocks.groq.mockRejectedValue(new Error('provider unavailable'))
    await expect(call()).rejects.toMatchObject({ statusCode: 502 })
  })
  it('uses configured Groq auto assignments directly and reports the actual provider', async () => {
    mocks.assignment.mockResolvedValue({ provider: 'groq', modelId: 'groq/llama-3.3-70b-versatile', fallbackModelId: null, source: 'override' })
    mocks.groq.mockResolvedValue(valid)
    expect((await call()).model).toBe('groq/llama-3.3-70b-versatile')
    expect(mocks.edge).not.toHaveBeenCalled()
  })
  it('offers accessible GPT OSS fast and quality modes', async () => {
    mocks.edge.mockResolvedValue(null)
    mocks.groq.mockResolvedValue(valid)
    expect((await call(request({ model: 'fast' }))).model).toBe('groq/openai/gpt-oss-20b')
    expect(mocks.assignment).not.toHaveBeenCalled()
    expect((await call(request({ model: 'quality' }))).model).toBe('groq/openai/gpt-oss-120b')
  })
  it('falls back to GPT OSS20B when quality is unavailable and reports the model used', async () => {
    mocks.groq.mockRejectedValueOnce(new Error('model_not_found')).mockResolvedValueOnce(valid)
    const result = await call(request({ model: 'quality' }))
    expect(result.model).toBe('groq/openai/gpt-oss-20b')
    expect(mocks.groq).toHaveBeenCalledTimes(2)
  })
  it('includes scoped references and reusable client style context', async () => {
    const referenceId = '33333333-3333-4333-8333-333333333333'
    const referenceUrl = 'https://assets.example.com/reference.png'
    mocks.references.mockResolvedValue({ references: [{ id: referenceId, name: 'UI reference', kind: 'image', description: 'Lime cards', url: referenceUrl }], guideText: 'Generous spacing', assetUrls: [referenceUrl] })
    mocks.styleGuide.mockResolvedValue('DriveAgent uses lime and black')
    const event = request({ referenceIds: [referenceId] })
    const result = await call(event)
    expect(mocks.references).toHaveBeenCalledWith(event, projectId, clientId, [referenceId])
    const context = JSON.parse(mocks.edge.mock.calls[0][1])
    expect(context).toMatchObject({ clientStyleGuide: 'DriveAgent uses lime and black', guideText: 'Generous spacing' })
    expect(context.references[0].description).toBe('Lime cards')
    expect(result.context).toMatchObject({ brandKit: 'Client brand', clientStyleGuide: true })
    expect(mocks.assets.mock.calls[1][1][0]).toContain(referenceUrl)
  })
  it('rejects reference scope errors before invoking any model', async () => {
    mocks.references.mockRejectedValue(Object.assign(new Error('Wrong client'), { statusCode: 403 }))
    await expect(call()).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.edge).not.toHaveBeenCalled()
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('will not send an incompatible configured fallback to Groq', async () => {
    mocks.edge.mockResolvedValue(null)
    mocks.assignment.mockResolvedValue({ provider: 'workers_ai', modelId: '@cf/meta/llama-3.1-8b-instruct', fallbackModelId: 'anthropic/unsupported', source: 'override' })
    await expect(call()).rejects.toMatchObject({ statusCode: 503 })
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('requires explicit locked-layer permission at the request boundary', async () => {
    const event = request()
    Object.assign(event.body.canvasData.fb_sq.layers[0], { locked: true })
    await expect(call(event)).rejects.toMatchObject({ statusCode: 502 })
    Object.assign(event.body, { allowLocked: true })
    expect((await call(event)).canvasData.fb_sq.layers[0].x).toBe(20)
  })
  it('rejects unknown models, independently supplied clients and missing projects', async () => {
    await expect(call(request({ model: 'arbitrary' }))).rejects.toMatchObject({ statusCode: 400 })
    await expect(call(request({ clientId: 'foreign' }))).rejects.toMatchObject({ statusCode: 400 })
    mocks.project.mockResolvedValue(null)
    await expect(call()).rejects.toMatchObject({ statusCode: 404 })
  })
})
