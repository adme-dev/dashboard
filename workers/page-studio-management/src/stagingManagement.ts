import { PageStudioStagingRequestSchema } from '../../../shared/pageStudio/staging'
import type { DomainTransaction } from './domainAttachment'
import { coordinateStaging, type StagingCoordinatorDependencies } from './stagingCoordinator'
import { cloudflareStagingProvider } from './stagingProvider'
import { StagingStoreError } from './stagingStore'

export async function probeClientStagingHost(hostname: string): Promise<boolean> {
  if (!/^preview-[a-f0-9]{32}\.xeroflow\.io$/.test(hostname)) return false
  // Manual mode is supported by workerd; never follow a preview redirect.
  const response = await fetch(`https://${hostname}/.well-known/xeroflow-staging`, { redirect: 'manual', signal: AbortSignal.timeout(10000), cache: 'no-store' })
  if (response.status !== 200 || response.redirected || !response.body) {
    await response.body?.cancel().catch(() => undefined)
    return false
  }
  const reader = response.body.getReader()
  let text = ''
  let size = 0
  const decoder = new TextDecoder('utf-8', { fatal: true })
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024) return false
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const value = JSON.parse(text)
  return value?.version === 1 && value.service === 'xeroflow-page-studio-client-staging' && value.hostname === hostname
}
export async function handleStagingManagement(input: unknown, env: Record<string, unknown>, transaction: DomainTransaction) {
  const rejected = (code: string, statusCode: number) => ({ ok: false as const, error: { code, statusCode } })
  const parsed = PageStudioStagingRequestSchema.safeParse(input)
  if (!parsed.success) return rejected('STAGING_INVALID', 400)
  const environment = env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  if (!['staging', 'production'].includes(String(environment)) || environment !== parsed.data.expectedEnvironment) return rejected('STAGING_SERVICE_UNAVAILABLE', 503)
  const service = env.PAGE_STUDIO_CLIENT_STAGING as { buildSnapshot?: StagingCoordinatorDependencies['build'], verifySnapshot?: StagingCoordinatorDependencies['verify'] } | undefined
  if (parsed.data.operation === 'update' && (typeof service?.buildSnapshot !== 'function' || typeof service?.verifySnapshot !== 'function')) return rejected('STAGING_SERVICE_UNAVAILABLE', 503)
  try {
    const value = await coordinateStaging(parsed.data, {
      transaction,
      attach: siteId => cloudflareStagingProvider({ accountId: String(env.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID ?? ''), zoneId: String(env.PAGE_STUDIO_CLOUDFLARE_ZONE_ID ?? ''), apiToken: String(env.PAGE_STUDIO_CLOUDFLARE_API_TOKEN ?? '') }).attach(siteId),
      probe: probeClientStagingHost,
      build: input => service!.buildSnapshot!(input),
      verify: input => service!.verifySnapshot!(input)
    })
    const actor = parsed.data.actor
    return { ok: true as const, operation: parsed.data.operation, siteId: parsed.data.siteId, environment, actorKind: actor.kind, scopeId: actor.kind === 'agency' ? actor.tenantId : actor.clientId, value }
  } catch (error) {
    if (error instanceof StagingStoreError) return rejected(error.code, error.statusCode)
    console.error(JSON.stringify({ event: 'page_studio_client_staging_failure', operation: parsed.data.operation, environment }))
    return rejected('STAGING_SERVICE_UNAVAILABLE', 503)
  }
}
