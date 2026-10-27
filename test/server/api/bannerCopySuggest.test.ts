import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), brand: vi.fn(), assignment: vi.fn(), edge: vi.fn(), groq: vi.fn(), scope: vi.fn(), query: vi.fn(), access: vi.fn(), allAccess: vi.fn() }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async (event: { body: unknown }) => event.body)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: mocks.auth, requireWriteAccess: mocks.auth }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mocks.query }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: mocks.scope, requireSocialClientAccess: mocks.access, hasAllSocialClientAccess: mocks.allAccess }))
vi.mock('~~/server/utils/banner/brandKits', () => ({ brandContextForRequest: mocks.brand }))
vi.mock('~~/server/utils/edgeAi', () => ({ edgeGenerate: mocks.edge }))
vi.mock('~~/server/utils/groqClient', () => ({ generateGroqInsight: mocks.groq, GROQ_MODELS: { LLAMA_8B: 'llama' } }))
vi.mock('~~/server/utils/ai/modelAssignments', () => ({ resolveAiModelAssignment: mocks.assignment, groqModelIdFromAssignment: (id: string) => id }))
const handler = (await import('../../../server/api/agency/banner-studio/ai/copy-suggest.post')).default
const sourceRevision = '2026-10-27T00:00:00.000Z'
const projectId = '11111111-1111-4111-8111-111111111111'
const savedProject = () => ({ id: projectId, client_id: 'client', created_by: 'u', updated_at: sourceRevision, canvas_data: { a4: { layers: [{ id: 1, type: 'text', text: 'WE’VE MOVED.' }] } } })
const request = (extra = {}) => ({ body: { text: 'WE’VE MOVED.', projectId, sourceRevision, selection: { formatKey: 'a4', layerId: 1 }, instruction: 'Make it warmer', ...extra } })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ id: 'u' })
  mocks.brand.mockResolvedValue('')
  mocks.query.mockResolvedValue(savedProject())
  mocks.assignment.mockResolvedValue({ provider: 'groq', modelId: 'llama', source: 'catalogue' })
  mocks.groq.mockResolvedValue('[{"text":"WELCOME TO OUR NEW HOME.","tone":"inviting"}]')
})
describe('Copy suggestion catalogue and facts', () => {
  it('uses owned saved text, explicit instruction and existing catalogue; reports actual provider', async () => {
    const result = await handler(request() as never)
    expect(result).toMatchObject({ suggestions: [{ text: 'WELCOME TO OUR NEW HOME.' }], evidence: { provider: 'groq', model: 'llama', fallback: false } })
    expect(mocks.groq.mock.calls[0][0]).toContain('Make it warmer')
    expect(result).toHaveProperty('sourceRevision', sourceRevision)
    expect(mocks.query).toHaveBeenCalledTimes(2)
    expect(mocks.access).toHaveBeenCalledWith(expect.anything(), 'client')
    expect(mocks.assignment).toHaveBeenCalledWith(expect.objectContaining({ featureKey: 'banner_copy_suggest' }))
  })
  it('fails honestly on provider outage and unsupported catalogue assignments', async () => {
    mocks.groq.mockRejectedValue(new Error('private provider'))
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 503 })
    mocks.assignment.mockResolvedValue({ ignoredReason: 'Unsupported provider', provider: 'groq', modelId: 'llama' })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('rejects inaccessible projects and stale/deleted selections before inference', async () => {
    mocks.query.mockResolvedValueOnce(null)
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 404 })
    for (const extra of [{ text: 'Different text' }, { selection: { layerId: 9, formatKey: 'a4' } }]) {
      await expect(handler(request(extra) as never)).rejects.toMatchObject({ statusCode: 409 })
    }
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('protects commercial blocks and drops invented commercial claims', async () => {
    await expect(handler(request({ projectId: undefined, selection: undefined, sourceRevision: undefined, text: '$500 off any new Subaru' }) as never)).rejects.toMatchObject({ statusCode: 400 })
    mocks.groq.mockResolvedValue('[{"text":"Save $900 today"}]')
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('does not generate replacements for saved text feed bindings', async () => {
    mocks.query.mockResolvedValue({ ...savedProject(), canvas_data: { a4: { layers: [{ id: 1, type: 'text', text: 'WE’VE MOVED.', feedBindings: [{ feedId: 'f', property: 'text', column: 'heading' }] }] } } })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it.each([undefined, '', 'not-a-revision'])('requires an explicit valid saved revision (%s) before provider work', async (revision) => {
    await expect(handler(request({ sourceRevision: revision }) as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mocks.brand).not.toHaveBeenCalled()
    expect(mocks.assignment).not.toHaveBeenCalled()
    expect(mocks.edge).not.toHaveBeenCalled()
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('rejects a stale saved revision even when the selected text is unchanged', async () => {
    mocks.query.mockResolvedValue({ ...savedProject(), updated_at: '2026-10-27T00:01:00.000Z' })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.brand).not.toHaveBeenCalled()
    expect(mocks.assignment).not.toHaveBeenCalled()
    expect(mocks.edge).not.toHaveBeenCalled()
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it.each(['revision', 'deleted', 'client', 'creator', 'selection', 'protected'])('rejects saved %s changes during inference', async (change) => {
    let release!: (result: string) => void
    let started!: () => void
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    mocks.groq.mockImplementation(() => new Promise<string>((resolve) => {
      release = resolve
      started()
    }))
    const pending = handler(request() as never)
    await running
    const changed = savedProject()
    if (change === 'revision') changed.updated_at = '2026-10-27T00:01:00.000Z'
    if (change === 'client') changed.client_id = 'other-client'
    if (change === 'creator') changed.created_by = 'other-user'
    if (change === 'selection') changed.canvas_data.a4.layers = []
    if (change === 'protected') Object.assign(changed.canvas_data.a4.layers[0]!, { copyLocked: true })
    mocks.query.mockResolvedValue(change === 'deleted' ? null : changed)
    release('[{"text":"WELCOME TO OUR NEW HOME.","tone":"inviting"}]')
    await expect(pending).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.groq).toHaveBeenCalledTimes(1)
  })
  it('rejects client access before inference and rechecks it after inference', async () => {
    mocks.access.mockRejectedValueOnce({ statusCode: 403 })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.groq).not.toHaveBeenCalled()
    mocks.access.mockResolvedValueOnce({ id: 'u' }).mockRejectedValueOnce({ statusCode: 403 })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('limits unassigned projects to their creator or an all-client administrator', async () => {
    mocks.query.mockResolvedValue({ ...savedProject(), client_id: null, created_by: 'other' })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.groq).not.toHaveBeenCalled()
    mocks.query.mockResolvedValue({ ...savedProject(), client_id: null })
    await expect(handler(request() as never)).resolves.toHaveProperty('sourceRevision', sourceRevision)
    mocks.query.mockResolvedValue({ ...savedProject(), client_id: null, created_by: 'other' })
    mocks.allAccess.mockReturnValue(true)
    await expect(handler(request() as never)).resolves.toHaveProperty('sourceRevision', sourceRevision)
  })

  it.each(['success', 'failure'])('rejects a stale Workers AI %s without calling fallback', async (mode) => {
    mocks.assignment.mockResolvedValue({ provider: 'workers_ai', modelId: 'edge-model', fallbackModelId: 'llama' })
    mocks.edge.mockImplementation(async () => {
      mocks.query.mockResolvedValue({ ...savedProject(), updated_at: '2026-10-27T00:01:00.000Z' })
      if (mode === 'failure') throw new Error('private provider')
      return '[{"text":"WELCOME HOME."}]'
    })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.groq).not.toHaveBeenCalled()
  })
  it('rechecks revision after fallback and reports the actual provider on unchanged success', async () => {
    mocks.assignment.mockResolvedValue({ provider: 'workers_ai', modelId: 'edge-model', fallbackModelId: 'llama' })
    mocks.edge.mockResolvedValue(null)
    const result = await handler(request() as never)
    expect(result).toMatchObject({ sourceRevision, evidence: { provider: 'groq', model: 'llama', fallback: true } })
    expect(mocks.query).toHaveBeenCalledTimes(3)
    mocks.groq.mockImplementation(async () => {
      mocks.query.mockResolvedValue({ ...savedProject(), updated_at: '2026-10-27T00:01:00.000Z' })
      return '[{"text":"WELCOME HOME."}]'
    })
    await expect(handler(request() as never)).rejects.toMatchObject({ statusCode: 409 })
  })
  it('accepts Date database revisions representing the requested saved instant', async () => {
    mocks.query.mockResolvedValue({ ...savedProject(), updated_at: new Date(sourceRevision) })
    await expect(handler(request() as never)).resolves.toHaveProperty('sourceRevision', sourceRevision)
  })
})
