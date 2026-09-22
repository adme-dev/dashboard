import { z } from 'zod'
import { pageStudioStagingAddress } from '../../../shared/pageStudio/staging'

// Separate delivery service: customer previews cannot route to a live dealer,
// Dashboard, or shared infrastructure test site through editable configuration.
export const CLIENT_STAGING_SERVICE = 'xeroflow-page-studio-client-staging'
const ProviderId = z.string().regex(/^[a-f0-9]{32}$/)
const Configuration = z.object({ accountId: ProviderId, zoneId: ProviderId, apiToken: z.string().min(1) }).strict()
const ProviderDomain = z.object({
  id: ProviderId, cert_id: z.string().uuid(), hostname: z.string().max(253), service: z.string().max(128),
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

/** The private coordinator reserves the deterministic hostname before calling
 * this adapter. Certificate identity is not proof of successful HTTPS delivery;
 * activation still requires the delivery service's scoped snapshot read-back. */
export function cloudflareStagingProvider(rawConfig: z.infer<typeof Configuration>, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
  const config = Configuration.parse(rawConfig)
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/domains`
  async function request(path: string, body?: object): Promise<unknown> {
    try {
      const response = await fetcher(endpoint + path, {
        method: body ? 'PUT' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'authorization': `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
      })
      if (!response.ok || !response.body) throw unavailable()
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
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if (value?.success !== true || !Object.hasOwn(value, 'result')) throw unavailable()
      return value.result
    } catch {
      // No provider diagnostics, token, payload, redirects or implicit retries.
      throw unavailable()
    }
  }
  function verify(raw: unknown, hostname: string, expectedId?: string) {
    const parsed = ProviderDomain.safeParse(raw)
    if (!parsed.success || parsed.data.hostname !== hostname || parsed.data.zone_id !== config.zoneId
      || parsed.data.zone_name !== 'xeroflow.io' || parsed.data.service !== CLIENT_STAGING_SERVICE
      || (expectedId && parsed.data.id !== expectedId)) throw conflict()
    return parsed.data
  }
  return {
    async attach(siteId: string) {
      const { hostname } = pageStudioStagingAddress(siteId)
      const matches = await request(`?${new URLSearchParams({ hostname, zone_id: config.zoneId })}`)
      if (!Array.isArray(matches) || matches.length > 1) throw conflict()
      const domain = matches.length
        ? verify(matches[0], hostname)
        : verify(await request('', { hostname, service: CLIENT_STAGING_SERVICE, zone_id: config.zoneId }), hostname)
      const confirmed = verify(await request(`/${domain.id}`), hostname, domain.id)
      return { domainId: confirmed.id, hostname: confirmed.hostname, certificateId: confirmed.cert_id }
    }
  }
}
