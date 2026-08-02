import { checkAgencyWorkflowReadiness } from '~~/server/utils/agencyWorkflows/client'
import { requireRole } from '~~/server/utils/auth'

function runtimeEnv(event: Parameters<typeof requireRole>[0]): Record<string, unknown> {
  return (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
}

function flag(env: Record<string, unknown>, name: string): boolean {
  const value = env[name]
  return (typeof value === 'string' ? value : process.env[name]) === 'true'
}

function configured(env: Record<string, unknown>, name: string): boolean {
  const value = env[name]
  const candidate = typeof value === 'string' ? value : process.env[name]
  return typeof candidate === 'string' && candidate.trim().length > 0
}

function hasMethods(input: unknown, methods: string[]): boolean {
  if (!input || typeof input !== 'object') return false
  const candidate = input as Record<string, unknown>
  return methods.every(method => typeof candidate[method] === 'function')
}

export default defineEventHandler(async (event) => {
  await requireRole(event, ['owner', 'admin'])
  const env = runtimeEnv(event)
  const workflow = await checkAgencyWorkflowReadiness(event)
  const featureEnabled = flag(env, 'SITE_INTELLIGENCE_ENABLED')
  const aiEnabled = flag(env, 'SITE_INTELLIGENCE_AI_ENABLED')
  const workflowService = workflow.ok === true
  const browserRenderingApi = workflow.worker?.capabilities?.browserRenderingApiConfigured === true
  const r2 = hasMethods(env.SITE_INTELLIGENCE_BUCKET, ['put', 'get', 'delete'])
  const queue = hasMethods(env.JOBS_QUEUE, ['send'])
  const workersAi = hasMethods(env.AI, ['run'])
  const vectorize = hasMethods(env.SITE_INTELLIGENCE_VECTORIZE, ['upsert', 'query', 'deleteByIds'])
  const nearbyMarketEnabled = flag(env, 'NEARBY_MARKET_DISCOVERY_ENABLED')
  const browserKeyConfigured = configured(env, 'NUXT_PUBLIC_GOOGLE_MAPS_BROWSER_API_KEY')
  const mapIdConfigured = configured(env, 'NUXT_PUBLIC_GOOGLE_MAPS_MAP_ID')
  const serverKeyConfigured = configured(env, 'GOOGLE_PLACES_SERVER_API_KEY')
  const checks = {
    featureEnabled,
    workflowService,
    browserRenderingApi,
    r2,
    queue,
    aiEnabled,
    workersAi,
    vectorize
  }

  return {
    ready: featureEnabled
      && workflowService
      && browserRenderingApi
      && r2
      && queue
      && (!aiEnabled || (workersAi && vectorize)),
    checks,
    nearbyMarket: {
      enabled: nearbyMarketEnabled,
      browserKeyConfigured,
      mapIdConfigured,
      serverKeyConfigured,
      placesReady: nearbyMarketEnabled
        && browserKeyConfigured
        && mapIdConfigured
        && serverKeyConfigured
    }
  }
})
