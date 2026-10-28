export interface MarketingProviderConfig {
  pmaxProviderWrites: boolean
  pmaxActivation: boolean
  metaAdPublish: boolean
  emailSending: boolean
}
const bindings = {
  pmaxProviderWrites: 'GOOGLE_PMAX_PROVIDER_WRITES_ENABLED',
  pmaxActivation: 'GOOGLE_PMAX_ACTIVATION_ENABLED',
  metaAdPublish: 'META_AD_PUBLISH_ENABLED',
  emailSending: 'EMAIL_SENDING_ENABLED'
} as const
const owns = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key)
function parseCompact(raw: unknown): Partial<MarketingProviderConfig> {
  if (typeof raw !== 'string') return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    if (Object.entries(value).some(([key, enabled]) => !owns(bindings, key) || typeof enabled !== 'boolean')) return {}
    return value as Partial<MarketingProviderConfig>
  } catch {
    return {}
  }
}
/**
 * Receives the caller's request-first merged runtime environment. Explicit legacy switches win,
 * including invalid/false values. Compact settings save binding slots; they grant no actor authority.
 */
export function resolveMarketingProviderConfig(env: Record<string, unknown>): MarketingProviderConfig {
  const compact = parseCompact(owns(env, 'MARKETING_PROVIDER_CONFIG') ? env.MARKETING_PROVIDER_CONFIG : undefined)
  const enabled = (field: keyof MarketingProviderConfig) => owns(env, bindings[field])
    ? env[bindings[field]] === 'true'
    : compact[field] === true
  const pmaxProviderWrites = enabled('pmaxProviderWrites')
  return {
    pmaxProviderWrites,
    pmaxActivation: pmaxProviderWrites && enabled('pmaxActivation'),
    metaAdPublish: enabled('metaAdPublish'),
    emailSending: enabled('emailSending')
  }
}
