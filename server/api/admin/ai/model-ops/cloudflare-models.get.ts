import { requireRole } from '~~/server/utils/auth'
import { listAiModelAssignments } from '~~/server/utils/ai/modelAssignments'
import {
  listCloudflareModelCatalog,
  recommendCloudflareModelsForFeature,
} from '~~/server/utils/ai/cloudflareModelCatalog'

function eventQuery(event: any) {
  const url = event?.node?.req?.url || ''
  const params = new URL(url, 'http://localhost').searchParams
  return {
    featureKey: params.get('featureKey') || '',
    search: (params.get('search') || '').trim().toLowerCase(),
    provider: (params.get('provider') || '').trim(),
    task: (params.get('task') || '').trim(),
    capability: (params.get('capability') || '').trim(),
    forceRefresh: params.get('refresh') === '1' || params.get('forceRefresh') === 'true',
  }
}

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const query = eventQuery(event)
  const cfEnv = (event.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env ?? null
  const [{ rows }, catalog] = await Promise.all([
    listAiModelAssignments(),
    listCloudflareModelCatalog({ env: cfEnv, forceRefresh: query.forceRefresh }),
  ])
  const feature = rows.find(row => row.featureKey === query.featureKey) ?? rows[0]
  const recommended = feature
    ? recommendCloudflareModelsForFeature(feature, catalog.models)
    : catalog.models.map(model => ({
      ...model,
      assignable: false,
      recommendation: {
        level: 'incompatible' as const,
        score: 0,
        reasons: [],
        blockers: ['Select a model-mapped feature first.'],
      },
    }))

  const models = recommended.filter((model) => {
    if (query.search) {
      const haystack = [model.label, model.modelId, model.providerLabel, model.author, model.taskLabel, model.capabilities.join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(query.search)) return false
    }
    if (query.provider && model.provider !== query.provider) return false
    if (query.task && model.task !== query.task) return false
    if (query.capability && !model.capabilities.includes(query.capability)) return false
    return true
  })

  return {
    available: catalog.available,
    configured: catalog.configured,
    credentialSource: catalog.credentialSource,
    source: catalog.source,
    reason: catalog.reason,
    fetchedAt: catalog.fetchedAt,
    feature: feature ? {
      featureKey: feature.featureKey,
      label: feature.label,
      modality: feature.modality,
      riskTier: feature.riskTier,
      runtimeSupportedProviders: feature.runtimeSupportedProviders,
    } : null,
    summary: {
      totalModels: catalog.models.length,
      filteredModels: models.length,
      assignableModels: models.filter(model => model.assignable).length,
      recommendedModels: models.filter(model => model.recommendation.level === 'recommended').length,
      providers: Array.from(new Set(catalog.models.map(model => model.provider))).sort(),
      tasks: Array.from(new Set(catalog.models.map(model => model.task))).sort(),
      capabilities: Array.from(new Set(catalog.models.flatMap(model => model.capabilities))).sort(),
    },
    models,
  }
})
