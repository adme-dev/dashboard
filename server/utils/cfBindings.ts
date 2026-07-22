/**
 * Process-local cache of Cloudflare Pages bindings.
 *
 * Pages exposes bindings on each request context rather than process.env.
 * The middleware refreshes this cache on every request so event-less helpers
 * can read deploy-time-stable configuration without importing the email layer.
 */
let cachedCfBindings: Record<string, unknown> | null = null

export function setCachedCfBindings(env: Record<string, unknown> | null | undefined): void {
  if (env && typeof env === 'object') cachedCfBindings = env
}

export function getCachedCfBinding(key: string): string | undefined {
  const value = cachedCfBindings?.[key]
  return typeof value === 'string' ? value : undefined
}

export function getCachedCfObjectBinding<T = unknown>(key: string): T | undefined {
  const value = cachedCfBindings?.[key]
  return value && typeof value === 'object' ? value as T : undefined
}
