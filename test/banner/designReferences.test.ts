import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesignReference, resolveDesignReferences, validateDesignReferenceFile, loadDesignClientStyleGuide } from '../../server/utils/banner/designReferences'
import handler from '../../server/api/agency/banner-studio/ai/references.post'

const mock = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), upload: vi.fn(), imageUpload: vi.fn(), read: vi.fn(), remove: vi.fn(), ai: vi.fn(), record: vi.fn(), profile: vi.fn(), write: vi.fn(), scope: vi.fn(), validate: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: mock.query, execute: mock.execute }))
vi.mock('~~/server/utils/storage', () => ({ readStoredObject: mock.read, uploadFile: mock.upload, deleteFile: mock.remove }))
vi.mock('~~/server/utils/bannerStorage', () => ({ createBannerAssetStorageKey: () => 'banner-assets/user/random/reference.png', bannerAssetDeliveryUrl: async (id: string) => `https://app.example.com/api/public/banner-assets/${id}`, uploadBannerAsset: mock.imageUpload }))
vi.mock('~~/server/utils/banner/assetDelivery', () => ({ resolveBannerAssetDelivery: () => ({ nativeUpload: { bucket: {} }, signingSecret: 'test-private-signing-secret' }) }))
vi.mock('~~/server/utils/banner/assetUploadValidation', () => ({ validateBannerAssetUpload: mock.validate }))
vi.mock('~~/server/utils/appUrl', () => ({ getAppUrl: () => 'https://app.example.com' }))
vi.mock('~~/server/utils/ai/invocationLedger', () => ({ recordAiInvocation: mock.record }))
vi.mock('~~/server/utils/video-generation/clientProfile', () => ({ loadVideoClientProfile: mock.profile }))
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: mock.write }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireSocialClientScope: mock.scope }))
vi.mock('h3', async original => ({ ...await original<typeof import('h3')>(), readMultipartFormData: async (event: { form: unknown }) => event.form, getHeader: (event: { length?: string }) => event.length }))

const projectId = '11111111-1111-4111-8111-111111111111'
const clientId = '22222222-2222-4222-8222-222222222222'
const referenceId = '33333333-3333-4333-8333-333333333333'
const userId = '44444444-4444-4444-8444-444444444444'
const objects = new Map<string, Uint8Array>()
const event = () => ({ context: { cloudflare: { env: { AI: { run: mock.ai } } } } })
const file = (name = 'reference.png', text = 'image-bytes') => ({ filename: name, type: 'image/png', data: Buffer.from(text) })
const create = (upload = file(), requestEvent = event()) => createDesignReference(requestEvent as never, { projectId, clientId, userId, file: upload })
const putManifest = (id = referenceId, overrides = {}) => {
  objects.set(`banner-design-references/${projectId}/${id}.json`, Buffer.from(JSON.stringify({ version: 1, id, projectId, clientId, name: 'Guide', kind: 'guide', description: 'Clean editorial style', guideText: 'Use generous spacing', ...overrides })))
}

beforeEach(() => {
  vi.resetAllMocks()
  objects.clear()
  mock.execute.mockResolvedValue(undefined)
  mock.remove.mockResolvedValue(undefined)
  mock.write.mockResolvedValue({ id: userId })
  mock.query.mockResolvedValue({ client_id: clientId, url: 'https://assets.example.com/reference.png' })
  mock.ai.mockResolvedValue({ description: 'A restrained blue layout with generous margins and a large headline.', analysisModel: '@cf/llava-hf/llava-1.5-7b-hf' })
  mock.validate.mockImplementation(upload => ({ buffer: upload.data, fileName: upload.filename, mimeType: 'image/png', size: upload.data.byteLength }))
  mock.upload.mockImplementation(async (bytes, key) => {
    objects.set(key, bytes)
    return { key, size: bytes.length }
  })
  mock.imageUpload.mockImplementation(async (bytes, _name, _type, _user, key) => {
    objects.set(key, bytes)
    return { key, size: bytes.length }
  })
  mock.read.mockImplementation(async (key) => {
    const bytes = objects.get(key)
    return bytes ? { size: bytes.byteLength, body: new Blob([bytes]).stream() } : null
  })
})

describe('project scoped design references', () => {
  it('analyzes the uploaded R2 bytes using the existing vision service and inserts a client-scoped asset', async () => {
    const reference = await create()
    expect(reference).toMatchObject({ kind: 'image', name: 'reference.png', description: 'A restrained blue layout with generous margins and a large headline.' })
    expect(mock.ai).toHaveBeenCalledWith('@cf/llava-hf/llava-1.5-7b-hf', expect.objectContaining({ image: Array.from(Buffer.from('image-bytes')) }))
    expect(mock.read).toHaveBeenCalledWith('banner-assets/user/random/reference.png', expect.anything())
    expect(mock.execute).toHaveBeenCalledWith(expect.stringContaining('client_id'), expect.arrayContaining([clientId, userId]))
    expect(mock.record).toHaveBeenCalledWith(expect.objectContaining({ featureKey: 'banner_design_reference_vision', status: 'success', clientId }))
    const manifest = JSON.parse(Buffer.from(objects.get(`banner-design-references/${projectId}/${reference.id}.json`)!).toString())
    expect(manifest).toMatchObject({ clientId, projectId, assetId: reference.id })
    expect(reference).not.toHaveProperty('guideText')
  })
  it('stores TXT/Markdown privately without running vision and resolves its bounded plain-text content', async () => {
    const reference = await create(file('style.md', '# Voice\nUse clear, direct language.'))
    expect(reference).toMatchObject({ kind: 'guide', name: 'style.md' })
    expect(reference).not.toHaveProperty('url')
    expect(mock.ai).not.toHaveBeenCalled()
    expect(mock.execute).not.toHaveBeenCalled()
    const result = await resolveDesignReferences(event() as never, projectId, clientId, [reference.id])
    expect(result.guideText).toBe('# Voice\nUse clear, direct language.')
    expect(result.assetUrls).toEqual([])
  })
  it.each(['empty', 'error'])('fails and removes new image storage when visual analysis returns %s', async (failure) => {
    if (failure === 'empty') mock.ai.mockResolvedValue({ description: '' })
    else mock.ai.mockRejectedValue(new Error('provider failed'))
    await expect(create()).rejects.toMatchObject({ statusCode: 502 })
    expect(mock.execute).not.toHaveBeenCalled()
    expect(mock.upload).not.toHaveBeenCalled()
    expect(mock.remove).toHaveBeenCalledWith('banner-assets/user/random/reference.png', expect.anything())
  })
  it('does not upload an image when no vision binding is available', async () => {
    await expect(create(file(), { context: {} } as never)).rejects.toMatchObject({ statusCode: 503 })
    expect(mock.imageUpload).not.toHaveBeenCalled()
  })
  it('compensates only its own new asset if private metadata persistence fails', async () => {
    mock.upload.mockRejectedValue(new Error('R2 unavailable'))
    await expect(create()).rejects.toThrow('R2 unavailable')
    expect(mock.execute.mock.calls[1][0]).toContain('DELETE FROM banner_assets WHERE id = $1 AND client_id')
    expect(mock.execute.mock.calls[1][1][1]).toBe(clientId)
  })
  it('rejects a reference manifest with foreign client or project binding', async () => {
    putManifest(referenceId, { clientId: userId })
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 403 })
    putManifest(referenceId, { projectId: userId })
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rechecks image asset ownership with a fresh scoped query', async () => {
    putManifest(referenceId, { kind: 'image', guideText: undefined, assetId: referenceId })
    mock.query.mockResolvedValue(null)
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 403 })
    expect(mock.query).toHaveBeenCalledWith(expect.stringContaining('client_id IS NOT DISTINCT FROM $2'), [referenceId, clientId])
  })
  it('bounds attached image count and combined guide text', async () => {
    const ids = Array.from({ length: 4 }, (_, i) => `${i + 5}3333333-3333-4333-8333-333333333333`)
    for (const id of ids) putManifest(id, { kind: 'image', assetId: id, guideText: undefined })
    await expect(resolveDesignReferences(event() as never, projectId, clientId, ids)).rejects.toMatchObject({ statusCode: 400 })
    for (const id of ids.slice(0, 2)) putManifest(id, { guideText: 'x'.repeat(7000) })
    await expect(resolveDesignReferences(event() as never, projectId, clientId, ids.slice(0, 2))).rejects.toMatchObject({ statusCode: 400 })
  })
  it('rejects missing, malformed, oversized and duplicate reference IDs', async () => {
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 404 })
    objects.set(`banner-design-references/${projectId}/${referenceId}.json`, Buffer.from('not-json'))
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 400 })
    objects.set(`banner-design-references/${projectId}/${referenceId}.json`, Buffer.alloc(80001))
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId])).rejects.toMatchObject({ statusCode: 404 })
    await expect(resolveDesignReferences(event() as never, projectId, clientId, ['../foreign'])).rejects.toThrow()
    await expect(resolveDesignReferences(event() as never, projectId, clientId, [referenceId, referenceId])).rejects.toThrow()
  })
  it('uses actual image signature validation before any storage or vision call', async () => {
    const actual = await vi.importActual<typeof import('../../server/utils/banner/assetUploadValidation')>('../../server/utils/banner/assetUploadValidation')
    mock.validate.mockImplementation(actual.validateBannerAssetUpload)
    await expect(create(file('fake.png', '<html>not an image</html>'))).rejects.toMatchObject({ statusCode: 400 })
    expect(mock.imageUpload).not.toHaveBeenCalled()
    expect(mock.ai).not.toHaveBeenCalled()
  })
  it('fails closed if the uploaded image cannot be reread from R2', async () => {
    mock.read.mockResolvedValue(null)
    await expect(create()).rejects.toMatchObject({ statusCode: 502 })
    expect(mock.ai).not.toHaveBeenCalled()
    expect(mock.execute).not.toHaveBeenCalled()
  })
  it('rejects unsupported documents, oversized bytes, malformed UTF8 and executable guide contents', () => {
    for (const name of ['style.pdf', 'page.html', 'image.svg', 'video.mp4']) expect(() => validateDesignReferenceFile(file(name))).toThrow('not supported')
    expect(() => validateDesignReferenceFile({ ...file(), data: Buffer.alloc(5 * 1024 * 1024 + 1) })).toThrow('5 MB')
    expect(() => validateDesignReferenceFile({ ...file('guide.txt'), data: Buffer.from([0xff, 0xfe]) })).toThrow('UTF-8')
    expect(() => validateDesignReferenceFile(file('guide.md', '<script>alert(1)</script>'))).toThrow('executable HTML')
    expect(() => validateDesignReferenceFile(file('guide.md', 'x'.repeat(12001)))).toThrow('12,000')
    mock.validate.mockImplementation(() => {
      throw new Error('magic mismatch')
    })
    expect(() => validateDesignReferenceFile(file())).toThrow('bytes')
  })
  it('loads the optional style guide only through the same-client profile loader', async () => {
    mock.profile.mockResolvedValue({ styleGuide: 'Brand blue and spacious typography.' })
    expect(await loadDesignClientStyleGuide(clientId)).toBe('Brand blue and spacious typography.')
    expect(mock.profile).toHaveBeenCalledWith(clientId)
    expect(await loadDesignClientStyleGuide(null)).toBe('')
  })
  it('authorizes multipart uploads against the persisted project rather than a supplied client', async () => {
    const request = { ...event(), form: [{ name: 'projectId', data: Buffer.from(projectId) }, { name: 'file', ...file('guide.md', 'Keep it simple') }] }
    const response = await handler(request as never)
    expect(response.reference.kind).toBe('guide')
    expect(mock.scope).toHaveBeenCalledWith(request, clientId)
    mock.scope.mockRejectedValue(Object.assign(new Error('No client access'), { statusCode: 403 }))
    mock.upload.mockClear()
    await expect(handler(request as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mock.upload).not.toHaveBeenCalled()
    request.form.push({ name: 'clientId', data: Buffer.from(clientId) })
    await expect(handler(request as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
