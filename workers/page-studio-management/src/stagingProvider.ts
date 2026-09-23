import { z } from 'zod'
import { pageStudioStagingAddress } from '../../../shared/pageStudio/staging'

// Separate delivery service: customer previews cannot route to a live dealer,
// Dashboard, or shared infrastructure test site through editable configuration.
export const CLIENT_STAGING_SERVICE = 'xeroflow-page-studio-client-staging'
const ProviderId = z.string().regex(/^[a-f0-9]{32}$/)
const Configuration = z.object({ accountId: ProviderId, zoneId: ProviderId, apiToken: z.string().min(1) }).strict()
// Worker hostname IDs are opaque hex identifiers; live Cloudflare responses
// can exceed the 32 characters used by account and zone IDs.
export const StagingProviderDomainIdSchema = z.string().regex(/^[a-f0-9]{32,64}$/)
const ProviderDomain = z.object({
  id: StagingProviderDomainIdSchema, cert_id: z.string().uuid(), hostname: z.string().max(253), service: z.string().max(128),
  zone_id: ProviderId, zone_name: z.string().max(253), environment: z.string().optional()
})
export class StagingProviderError extends Error {
  constructor(readonly code: 'STAGING_HOST_CONFLICT' | 'STAGING_HOST_UNAVAILABLE') {
    super('Staging hostname could not be verified. Retry to check its saved state.')
    this.name = 'StagingProviderError'
  }
}
const unavailable = () => new StagingProviderError('STAGING_HOST_UNAVAILABLE')
const conflict = () => new StagingProviderError('STAGING_HOST_CONFLICT')
type ProviderOperation = 'configuration' | 'list' | 'attach' | 'verify'
function reportFailure(operation: ProviderOperation, reason: string, status: number | null = null) {
  // Deliberately exclude URLs, identifiers, credentials, bodies and exception
  // messages. These bounded diagnostics distinguish provider failures safely.
  console.warn(JSON.stringify({ event: 'page_studio_staging_provider_failure', operation, reason, status }))
}

/** Inspect locally, but emit only this fixed vocabulary. Exception text can
 * contain credentials, URLs or provider details and must never be logged. */
function transportReason(error: unknown): string {
  if (!(error instanceof Error)) return 'network'
  if (error.name === 'TimeoutError') return 'network_timeout'
  if (error.name === 'AbortError') return 'network_aborted'
  const message = error.message.slice(0, 512).toLowerCase()
  if (/header|bytestring|iso-8859/.test(message)) return 'network_header'
  if (/redirect/.test(message)) return 'network_redirect'
  if (/different request|outside.*request|i\/o.*request/.test(message)) return 'network_request_context'
  if (/certificate|tls|ssl/.test(message)) return 'network_tls'
  if (/dns|resolve.*host|name resolution/.test(message)) return 'network_dns'
  if (/connection|connect failed|socket/.test(message)) return 'network_connection'
  if (error.name === 'TypeError') return 'network_type_error'
  return 'network'
}

/** The private coordinator reserves the deterministic hostname before calling
 * this adapter. Certificate identity is not proof of successful HTTPS delivery;
 * activation still requires the delivery service's scoped snapshot read-back. */
export function cloudflareStagingProvider(rawConfig: z.infer<typeof Configuration>, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  const parsed = Configuration.safeParse(rawConfig)
  if (!parsed.success) {
    reportFailure('configuration', 'invalid')
    throw unavailable()
  }
  const config = parsed.data
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/domains`
  async function request(operation: ProviderOperation, path: string, body?: object): Promise<unknown> {
    let status: number | null = null
    let reason = 'network'
    try {
      const response = await fetcher(endpoint + path, {
        method: body ? 'PUT' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'authorization': `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      status = response.status
      reason = 'http'
      if (!response.ok || !response.body) throw unavailable()
      reason = 'body'
      const reader = response.body.getReader()
      let length = 0
      const chunks: Uint8Array[] = []
      try {
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          length += value.byteLength
          if (length > 65536) throw unavailable()
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
      const bytes = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      reason = 'json'
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      reason = 'envelope'
      if (value?.success !== true || !Object.hasOwn(value, 'result')) throw unavailable()
      return value.result
    } catch (error) {
      reportFailure(operation, reason === 'network' ? transportReason(error) : reason, status)
      // No provider payloads, exception messages, redirects or implicit retries.
      throw unavailable()
    }
  }
  function verify(raw: unknown, hostname: string, operation: ProviderOperation, expectedId?: string) {
    const parsed = ProviderDomain.safeParse(raw)
    if (!parsed.success || parsed.data.hostname !== hostname || parsed.data.zone_id !== config.zoneId
      || parsed.data.zone_name !== 'xeroflow.io' || parsed.data.service !== CLIENT_STAGING_SERVICE
      || (expectedId && parsed.data.id !== expectedId)) {
      reportFailure(operation, 'identity')
      throw conflict()
    }
    return parsed.data
  }
  return {
    async attach(siteId: string) {
      const { hostname } = pageStudioStagingAddress(siteId)
      const matches = await request('list', `?${new URLSearchParams({ hostname, zone_id: config.zoneId })}`)
      if (!Array.isArray(matches) || matches.length > 1) {
        reportFailure('list', 'matches')
        throw conflict()
      }
      const domain = matches.length
        ? verify(matches[0], hostname, 'list')
        : verify(await request('attach', '', { hostname, service: CLIENT_STAGING_SERVICE, zone_id: config.zoneId }), hostname, 'attach')
      const confirmed = verify(await request('verify', `/${domain.id}`), hostname, 'verify', domain.id)
      return { domainId: confirmed.id, hostname: confirmed.hostname, certificateId: confirmed.cert_id }
    }
  }
}
