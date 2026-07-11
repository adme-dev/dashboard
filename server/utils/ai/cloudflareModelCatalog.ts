import { listAiModelCatalogOptions, providerForModel } from '~~/server/utils/ai/modelRegistry'
import {
  modelProviderMatches,
  supportedProvidersForFeature,
  type AiModelAssignmentRow,
  type RuntimeModelProvider,
} from '~~/server/utils/ai/modelAssignments'

export type CloudflareCatalogSource = 'cloudflare_hosted' | 'third_party' | 'local_registry' | 'unknown'
export type CloudflareCatalogStatus = 'production' | 'preview' | 'deprecated' | 'unknown'
export type RecommendationLevel = 'recommended' | 'compatible' | 'incompatible'

export interface CloudflareCatalogModel {
  id: string
  label: string
  modelId: string
  provider: RuntimeModelProvider
  providerLabel: string
  task: string
  taskLabel: string
  modality: 'text' | 'vision' | 'audio' | 'video' | 'image' | 'multimodal' | 'unknown'
  author: string | null
  capabilities: string[]
  source: CloudflareCatalogSource
  status: CloudflareCatalogStatus
  description: string | null
  raw: Record<string, unknown>
}

export interface RecommendedCloudflareCatalogModel extends CloudflareCatalogModel {
  assignable: boolean
  recommendation: {
    level: RecommendationLevel
    score: number
    reasons: string[]
    blockers: string[]
  }
}

export interface CloudflareModelCatalogResult {
  available: boolean
  configured: boolean
  credentialSource: {
    accountId: 'CLOUDFLARE_ACCOUNT_ID' | 'R2_ACCOUNT_ID' | null
    token: 'CLOUDFLARE_API_TOKEN' | 'CF_API_TOKEN' | 'CLOUDFLARE_API_KEY' | null
  }
  source: 'cloudflare_api' | 'local_registry'
  reason: string | null
  fetchedAt: string
  models: CloudflareCatalogModel[]
}

interface CacheEntry {
  key: string
  expiresAt: number
  result: CloudflareModelCatalogResult
}

const CACHE_TTL_MS = 1000 * 60 * 30
let cache: CacheEntry | null = null

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return text(object.name) || text(object.label) || text(object.id) || text(object.slug)
  }
  return ''
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resultArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  const object = payload as Record<string, unknown>
  if (Array.isArray(object.result)) return object.result
  if (object.result && typeof object.result === 'object') {
    const result = object.result as Record<string, unknown>
    if (Array.isArray(result.models)) return result.models
    if (Array.isArray(result.items)) return result.items
    if (Array.isArray(result.data)) return result.data
  }
  if (Array.isArray(object.models)) return object.models
  if (Array.isArray(object.items)) return object.items
  return []
}

function normalizeCapabilities(value: unknown): string[] {
  return Array.from(new Set(arrayFrom(value)
    .map((item) => slug(text(item)))
    .filter(Boolean)))
}

function normalizeStatus(raw: Record<string, unknown>): CloudflareCatalogStatus {
  const status = slug(text(raw.status) || text(raw.lifecycle) || text(raw.stage))
  if (status.includes('deprecated')) return 'deprecated'
  if (status.includes('preview') || status.includes('beta') || status.includes('experimental')) return 'preview'
  if (status.includes('production') || status.includes('stable') || status === 'ga') return 'production'
  return 'unknown'
}

function normalizeProvider(rawProvider: string, modelId: string): RuntimeModelProvider {
  const provider = slug(rawProvider)
  if (modelId.startsWith('@cf/')) return 'workers_ai'
  if (provider.includes('cloudflare') || provider.includes('workers')) return 'workers_ai'
  if (provider.includes('groq')) return 'groq'
  if (provider.includes('anthropic') || modelId.includes('claude')) return 'anthropic'
  if (provider.includes('minimax')) return 'minimax'
  return 'aigateway'
}

function normalizeSource(raw: Record<string, unknown>, modelId: string): CloudflareCatalogSource {
  const haystack = [
    text(raw.source),
    text(raw.hosted),
    text(raw.type),
    ...arrayFrom(raw.tags).map(text),
  ].join(' ').toLowerCase()
  if (modelId.startsWith('@cf/') || haystack.includes('cloudflare-hosted') || haystack.includes('workers ai')) return 'cloudflare_hosted'
  if (haystack.includes('third-party') || haystack.includes('provider')) return 'third_party'
  return modelId.startsWith('@cf/') ? 'cloudflare_hosted' : 'unknown'
}

function modalityForTask(task: string): CloudflareCatalogModel['modality'] {
  if (task.includes('image')) return task.includes('text') ? 'image' : 'vision'
  if (task.includes('video')) return 'video'
  if (task.includes('audio') || task.includes('speech') || task.includes('transcription')) return 'audio'
  if (task.includes('embedding')) return 'text'
  if (task.includes('multimodal') || task.includes('vision_language')) return 'multimodal'
  if (task.includes('text') || task.includes('chat') || task.includes('generation')) return 'text'
  return 'unknown'
}

function localCatalogModels(): CloudflareCatalogModel[] {
  return listAiModelCatalogOptions().map((model) => {
    const provider = providerForModel(model.modelId) as RuntimeModelProvider
    const isWorkersAi = provider === 'workers_ai'
    return {
      id: model.modelId,
      label: model.modelId,
      modelId: model.modelId,
      provider,
      providerLabel: isWorkersAi ? 'Cloudflare Workers AI' : provider,
      task: 'text_generation',
      taskLabel: 'Text generation',
      modality: model.modelId.includes('whisper') || model.modelId.includes('melotts') ? 'audio' : 'text',
      author: null,
      capabilities: [],
      source: isWorkersAi ? 'cloudflare_hosted' : 'local_registry',
      status: model.status,
      description: null,
      raw: {},
    }
  })
}

export function normalizeCloudflareModelCatalog(payload: unknown): CloudflareCatalogModel[] {
  return resultArray(payload)
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const raw = item as Record<string, unknown>
      const id = text(raw.id) || text(raw.name) || text(raw.slug) || text(raw.model)
      if (!id) return null
      const modelId = text(raw.model) || id
      const label = text(raw.label) || text(raw.display_name) || text(raw.name) || modelId
      const taskLabel = text(raw.task) || text(raw.task_type) || text(raw.category) || 'Unknown'
      const task = slug(taskLabel) || 'unknown'
      const providerLabel = text(raw.provider) || text(raw.host) || (modelId.startsWith('@cf/') ? 'Cloudflare' : 'AI Gateway')
      const provider = normalizeProvider(providerLabel, modelId)
      return {
        id,
        label,
        modelId,
        provider,
        providerLabel,
        task,
        taskLabel,
        modality: modalityForTask(task),
        author: text(raw.author) || null,
        capabilities: normalizeCapabilities(raw.capabilities ?? raw.features),
        source: normalizeSource(raw, modelId),
        status: normalizeStatus(raw),
        description: text(raw.description) || null,
        raw,
      } satisfies CloudflareCatalogModel
    })
    .filter((model): model is CloudflareCatalogModel => Boolean(model))
    .sort((a, b) => a.provider.localeCompare(b.provider) || a.label.localeCompare(b.label))
}

export function recommendCloudflareModelsForFeature(
  feature: AiModelAssignmentRow,
  models: CloudflareCatalogModel[]
): RecommendedCloudflareCatalogModel[] {
  const supportedProviders = supportedProvidersForFeature(feature.featureKey) ?? feature.runtimeSupportedProviders
  return models.map((model) => {
    const blockers: string[] = []
    const reasons: string[] = []
    let score = 0

    if (!supportedProviders.includes(model.provider)) {
      blockers.push(`Provider ${model.provider} is not wired for this feature runtime.`)
    } else {
      score += 50
      reasons.push('Runtime provider is supported for this feature.')
    }

    const modalityCompatible = feature.modality === model.modality
      || (feature.modality === 'text' && model.modality === 'unknown')
      || (feature.modality === 'multimodal' && ['text', 'vision', 'multimodal', 'unknown'].includes(model.modality))
      || (feature.modality === 'vision' && ['vision', 'multimodal', 'image'].includes(model.modality))

    if (!modalityCompatible) {
      blockers.push(`Model modality ${model.modality} does not match feature modality ${feature.modality}.`)
    } else {
      score += 20
      reasons.push('Model task matches the feature modality.')
    }

    if (model.status === 'deprecated') blockers.push('Model is deprecated.')
    if (model.status === 'production') {
      score += 10
      reasons.push('Model is marked production or stable.')
    }
    if (feature.riskTier === 'high' && model.capabilities.includes('reasoning')) {
      score += 8
      reasons.push('Reasoning capability fits a high-risk surface.')
    }
    if (feature.featureKey.includes('tool_loop') && model.capabilities.includes('function_calling')) {
      score += 8
      reasons.push('Function calling fits tool-loop workflows.')
    }
    if (model.source === 'cloudflare_hosted') {
      score += 4
      reasons.push('Cloudflare-hosted model keeps the route cloud-first.')
    }
    if (model.modelId === feature.assignedModelId) {
      score += 6
      reasons.push('This is the currently assigned model.')
    }

    const assignable = blockers.length === 0
    return {
      ...model,
      assignable,
      recommendation: {
        level: assignable ? (score >= 80 ? 'recommended' : 'compatible') : 'incompatible',
        score: assignable ? score : 0,
        reasons,
        blockers,
      },
    } satisfies RecommendedCloudflareCatalogModel
  }).sort((a, b) => {
    if (a.assignable !== b.assignable) return a.assignable ? -1 : 1
    return b.recommendation.score - a.recommendation.score || a.label.localeCompare(b.label)
  })
}

export async function listCloudflareModelCatalog(options: {
  fetcher?: typeof fetch
  forceRefresh?: boolean
  env?: Record<string, unknown> | null
} = {}): Promise<CloudflareModelCatalogResult> {
  const env = options.env ?? {}
  const envValue = (key: string) => {
    const bindingValue = env[key]
    return typeof bindingValue === 'string' && bindingValue.trim() ? bindingValue.trim() : process.env[key]?.trim()
  }
  const accountIdSource: CloudflareModelCatalogResult['credentialSource']['accountId'] = envValue('CLOUDFLARE_ACCOUNT_ID') ? 'CLOUDFLARE_ACCOUNT_ID' : envValue('R2_ACCOUNT_ID') ? 'R2_ACCOUNT_ID' : null
  const tokenSource: CloudflareModelCatalogResult['credentialSource']['token'] = envValue('CLOUDFLARE_API_TOKEN')
    ? 'CLOUDFLARE_API_TOKEN'
    : envValue('CF_API_TOKEN')
      ? 'CF_API_TOKEN'
      : envValue('CLOUDFLARE_API_KEY')
        ? 'CLOUDFLARE_API_KEY'
        : null
  const accountId = accountIdSource ? envValue(accountIdSource) : ''
  const token = tokenSource ? envValue(tokenSource) : ''
  const credentialSource = { accountId: accountIdSource, token: tokenSource }
  const cacheKey = `${accountId || 'missing-account'}:${token ? tokenSource : 'missing-token'}`
  if (!options.forceRefresh && cache && cache.key === cacheKey && cache.expiresAt > Date.now()) return cache.result

  const fetchedAt = new Date().toISOString()
  if (!accountId || !token) {
    const result = {
      available: false,
      configured: false,
      credentialSource,
      source: 'local_registry' as const,
      reason: 'Set CLOUDFLARE_ACCOUNT_ID or R2_ACCOUNT_ID, plus CLOUDFLARE_API_TOKEN, CF_API_TOKEN, or CLOUDFLARE_API_KEY to sync the Cloudflare model catalog.',
      fetchedAt,
      models: localCatalogModels(),
    }
    cache = { key: cacheKey, expiresAt: Date.now() + CACHE_TTL_MS, result }
    return result
  }

  try {
    const response = await (options.fetcher ?? fetch)(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search?per_page=250`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!response.ok) throw new Error(`Cloudflare model catalog request failed with ${response.status}`)
    const payload = await response.json()
    const result = {
      available: true,
      configured: true,
      credentialSource,
      source: 'cloudflare_api' as const,
      reason: null,
      fetchedAt,
      models: normalizeCloudflareModelCatalog(payload),
    }
    cache = { key: cacheKey, expiresAt: Date.now() + CACHE_TTL_MS, result }
    return result
  } catch (error) {
    const result = {
      available: false,
      configured: true,
      credentialSource,
      source: 'local_registry' as const,
      reason: error instanceof Error ? error.message : String(error),
      fetchedAt,
      models: localCatalogModels(),
    }
    cache = { key: cacheKey, expiresAt: Date.now() + 1000 * 60 * 5, result }
    return result
  }
}

export async function cloudflareModelIsCatalogued(modelId: string, options: { env?: Record<string, unknown> | null } = {}) {
  if (listAiModelCatalogOptions().some((model) => model.modelId === modelId)) return true
  const catalog = await listCloudflareModelCatalog(options)
  return catalog.models.some((model) => model.modelId === modelId || model.id === modelId)
}

export async function cloudflareModelProviderMatches(provider: string, modelId: string, options: { env?: Record<string, unknown> | null } = {}) {
  if (modelProviderMatches(provider, modelId)) return true
  const catalog = await listCloudflareModelCatalog(options)
  return catalog.models.some((model) => (model.modelId === modelId || model.id === modelId) && model.provider === provider)
}
