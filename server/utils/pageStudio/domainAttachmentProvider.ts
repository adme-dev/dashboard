import { z } from 'zod'

export class PageStudioDomainAttachmentError extends Error {
  constructor(readonly code: string, readonly statusCode: number, message: string) {
    super(message)
    this.name = 'PageStudioDomainAttachmentError'
  }
}
export const domainFailure = (code = 'DOMAIN_RECONCILIATION_REQUIRED', statusCode = 409) => new PageStudioDomainAttachmentError(code, statusCode, code === 'DOMAIN_ACCESS_DENIED' ? 'Website domain access is not active' : 'Domain attachment could not be verified. Retry to check its retained status.')
export interface DomainProviderConfig {
  apiToken: string
  zoneId: string
  cnameTarget: string
}
export interface DomainHostname {
  id: string
  hostname: string
  custom_metadata?: Record<string, unknown>
  status?: string
  ownership_verification?: Record<string, unknown>
  ssl?: {
    status?: string
    validation_records?: Array<Record<string, unknown>>
  }
}
export interface DomainProvider {
  create(hostname: string, owner: string): Promise<DomainHostname>
  find(hostname: string): Promise<DomainHostname | null>
  get(id: string): Promise<DomainHostname>
}
export const Hostname = z.string().trim().toLowerCase().max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
const ProviderHostname = z.object({
  id: z.string().regex(/^[a-f0-9]{32}$/i), hostname: Hostname,
  custom_metadata: z.record(z.string(), z.unknown()).optional(),
  status: z.string().max(80).optional(), ownership_verification: z.record(z.string(), z.unknown()).optional(),
  ssl: z.object({ status: z.string().max(80).optional(), validation_records: z.array(z.record(z.string(), z.unknown())).max(20).optional() }).optional()
})
export function verifyDomainHostname(value: unknown, hostname: string, owner?: string, id?: string): DomainHostname {
  const parsed = ProviderHostname.safeParse(value)
  if (!parsed.success || parsed.data.hostname !== hostname || (id && parsed.data.id !== id)
    || (owner && parsed.data.custom_metadata?.page_studio_owner !== owner))
    throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
  return parsed.data
}
export function requireDomainCnameTarget(value: string) {
  if (!Hostname.safeParse(value).success || /^\d+(?:\.\d+){3}$/.test(value))
    throw domainFailure('DOMAIN_PROVIDER_UNAVAILABLE', 503)
}
/** Fixed zone only; never follows redirects, retries mutations or adopts metadata. */
export function cloudflareDomainProvider(config: DomainProviderConfig, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)): DomainProvider | null {
  if (!config.apiToken || !config.zoneId)
    return null
  if (!/^[a-f0-9]{32}$/i.test(config.zoneId))
    throw domainFailure('DOMAIN_PROVIDER_UNAVAILABLE', 503)
  async function request(path: string, init?: RequestInit) {
    let response: Response
    try {
      response = await fetcher(`https://api.cloudflare.com/client/v4/zones/${config.zoneId}/custom_hostnames${path}`, {
        ...init, redirect: 'manual', signal: AbortSignal.timeout(10000),
        headers: { 'authorization': `Bearer ${config.apiToken}`, 'content-type': 'application/json' }
      })
      if (!response.ok || !response.body)
        throw domainFailure('DOMAIN_PROVIDER_FAILED', 502)
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let size = 0
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done)
            break
          size += value.byteLength
          if (size > 64 * 1024)
            throw domainFailure('DOMAIN_PROVIDER_FAILED', 502)
          chunks.push(value)
        }
      } finally {
        await reader.cancel().catch(() => undefined)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
      const payload = JSON.parse(new TextDecoder().decode(bytes))
      if (payload?.success !== true || !('result' in payload))
        throw domainFailure('DOMAIN_PROVIDER_FAILED', 502)
      return payload
    } catch {
      throw domainFailure('DOMAIN_PROVIDER_FAILED', 502)
    }
  }
  return {
    async create(hostname, owner) {
      requireDomainCnameTarget(config.cnameTarget)
      const payload = await request('', { method: 'POST', body: JSON.stringify({ hostname: Hostname.parse(hostname), ssl: { method: 'txt', type: 'dv' }, custom_metadata: { page_studio_owner: owner } }) })
      return verifyDomainHostname(payload.result, hostname, owner)
    },
    async get(id) {
      if (!/^[a-f0-9]{32}$/i.test(id))
        throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
      return (await request(`/${id}`)).result as DomainHostname
    },
    async find(hostname) {
      const payload = await request(`?hostname.exact=${encodeURIComponent(Hostname.parse(hostname))}&page=1&per_page=5`)
      // Cloudflare totals describe the unfiltered zone, so total_pages does
      // not establish filtered completeness. Require the exact query's first
      // page and count, fewer rows than its requested size, and at most one
      // matching identity. Never walk or adopt unrelated hostname results.
      if (!Array.isArray(payload.result) || payload.result.length > 1
        || payload.result_info?.page !== 1 || payload.result_info?.per_page !== 5
        || payload.result_info?.count !== payload.result.length) throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
      return payload.result.length ? verifyDomainHostname(payload.result[0], hostname) : null
    }
  }
}
