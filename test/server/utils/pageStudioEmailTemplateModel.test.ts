import { beforeEach, describe, expect, it, vi } from 'vitest'
import { starterEmailTemplate } from '../../../shared/pageStudio/emailTemplates'
import { MockLanguageModelV3 } from 'ai/test'
import { createEmailTemplateModelResolver, listEmailTemplateModels } from '../../../server/utils/pageStudio/emailTemplateModel'

const mocks = vi.hoisted(() => ({ gateway: vi.fn(), generate: vi.fn(), catalog: vi.fn(), features: vi.fn() }))
vi.mock('~~/server/utils/claudeClient', () => ({ resolveGatewayTextModel: mocks.gateway }))
vi.mock('~~/server/utils/ai/modelRegistry', () => ({ listAiModelCatalogOptions: mocks.catalog, listAiModelMap: mocks.features }))
vi.mock('ai', () => ({ generateText: mocks.generate }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.catalog.mockReturnValue([{ provider: 'groq', modelId: 'text-model', status: 'production', pricing: null, warnings: [] }])
  mocks.features.mockReturnValue([{ provider: 'groq', modelId: 'text-model', modality: 'text' }])
  mocks.gateway.mockReturnValue({ modelId: 'text-model' })
  mocks.generate.mockResolvedValue({ text: '{"proposal":"raw"}', finishReason: 'stop' })
})
const input = () => ({ prompt: 'Improve this draft', audience: 'team' as const, template: starterEmailTemplate('team'), siteName: 'Business', formName: 'Contact', formKey: 'contact:enquiry', fieldReferencesAvailable: true, fields: [{ id: 'name', name: 'Name', type: 'text' }] })

describe('email proposal Gateway model adapter', () => {
  it('lists only eligible configured selections without invoking or charging models', async () => {
    expect(await listEmailTemplateModels(['groq/text-model', 'groq/text-model', 'other/model'])).toEqual([{ id: 'groq/text-model', label: 'groq/text-model' }])
    mocks.gateway.mockReturnValue(null)
    expect(await listEmailTemplateModels(['groq/text-model'])).toEqual([])
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it.each(['disabled', 'unknown', 'deprecated', 'audio', 'direct'])('refuses %s models without provider execution', async (scenario) => {
    if (scenario === 'unknown') mocks.catalog.mockReturnValue([])
    if (scenario === 'deprecated') mocks.catalog.mockReturnValue([{ provider: 'groq', modelId: 'text-model', status: 'deprecated' }])
    if (scenario === 'audio') mocks.features.mockReturnValue([{ provider: 'groq', modelId: 'text-model', modality: 'audio' }])
    if (scenario === 'direct') mocks.gateway.mockReturnValue(null)
    const resolve = createEmailTemplateModelResolver(scenario === 'disabled' ? [] : ['groq/text-model'])
    expect(await resolve('groq/text-model')).toBeNull()
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('uses one bounded Gateway generation without tools, fallback or SDK retries', async () => {
    const model = await createEmailTemplateModelResolver(['groq/text-model'])('groq/text-model')
    expect(model?.id).toBe('groq/text-model')
    expect(await model!.invoke(input())).toBe('{"proposal":"raw"}')
    expect(mocks.generate).toHaveBeenCalledTimes(1)
    const options = mocks.generate.mock.calls[0]![0]
    expect(options).toMatchObject({ maxRetries: 0, maxOutputTokens: 8000, experimental_telemetry: { isEnabled: false } })
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
    expect(options.tools).toBeUndefined()
    expect(options.system).toContain('site.name')
    expect(options.system).toContain('form.name')
    expect(JSON.parse(options.prompt)).toEqual(input())
  })

  it('rechecks Gateway configuration at invocation and never falls back or repairs', async () => {
    const model = await createEmailTemplateModelResolver(['groq/text-model'])('groq/text-model')
    mocks.gateway.mockReturnValue(null)
    await expect(model!.invoke(input())).rejects.toThrow()
    expect(mocks.generate).not.toHaveBeenCalled()
    mocks.gateway.mockReturnValue({ modelId: 'text-model' })
    mocks.generate.mockRejectedValue(new Error('provider failed'))
    await expect(model!.invoke(input())).rejects.toThrow()
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it.each(['length', 'content-filter', 'tool-calls'])('rejects incomplete provider completion %s', async (finishReason) => {
    mocks.generate.mockResolvedValue({ text: '{}', finishReason })
    const model = await createEmailTemplateModelResolver(['groq/text-model'])('groq/text-model')
    await expect(model!.invoke(input())).rejects.toThrow()
    expect(mocks.generate).toHaveBeenCalledTimes(1)
  })

  it('actually makes only one SDK attempt for a retryable provider error', async () => {
    const actual = await vi.importActual<typeof import('ai')>('ai')
    const sdkModel = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new actual.APICallError({ message: 'Unavailable', url: 'https://gateway.ai.cloudflare.com/example', requestBodyValues: {}, statusCode: 503, isRetryable: true })
      }
    })
    mocks.gateway.mockReturnValue(sdkModel)
    mocks.generate.mockImplementation(actual.generateText)
    const model = await createEmailTemplateModelResolver(['groq/text-model'])('groq/text-model')
    await expect(model!.invoke(input())).rejects.toThrow('Unavailable')
    expect(sdkModel.doGenerateCalls).toHaveLength(1)
  })
})
