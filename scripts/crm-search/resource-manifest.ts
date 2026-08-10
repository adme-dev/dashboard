export const CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION
  = 'crm-search-environment-resource-manifest-v1' as const
export const CRM_SEARCH_ENVIRONMENT_RESOURCE_ENVELOPE_VERSION
  = 'crm-search-environment-resource-envelope-v1' as const
export const CRM_SEARCH_QUEUE_RETENTION_SECONDS = 1_209_600 as const

export type CrmSearchReleaseEnvironment = 'preview' | 'production'

export interface CrmSearchEnvironmentResources {
  version: typeof CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION
  environment: CrmSearchReleaseEnvironment
  issuedAt: string
  expiresAt: string
  readbackSource: 'cloudflare_api'
  plan: 'workers_paid'
  pages: {
    project: 'agency-dashboard'
    branch: 'preview' | 'main'
    origin: string
  }
  worker: { name: string }
  vectorize: { crmSearch: string }
  queues: {
    primary: { name: string, retentionSeconds: typeof CRM_SEARCH_QUEUE_RETENTION_SECONDS }
    deadLetter: { name: string, retentionSeconds: typeof CRM_SEARCH_QUEUE_RETENTION_SECONDS }
  }
}

export interface SignedCrmSearchEnvironmentResources {
  version: typeof CRM_SEARCH_ENVIRONMENT_RESOURCE_ENVELOPE_VERSION
  keyVersion: string
  payload: CrmSearchEnvironmentResources
  payloadSha256: string
  signature: string
}

function canonicalValue(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('crm_search_resource_manifest_noncanonical')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>
    return `{${Object.keys(candidate).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalValue(candidate[key])}`
    )).join(',')}}`
  }
  throw new Error('crm_search_resource_manifest_noncanonical')
}

export function canonicalResourceManifest(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalValue(value))
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer))
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
