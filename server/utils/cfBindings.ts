/**
 * Process-local cache of Cloudflare Pages bindings.
 *
 * Pages exposes bindings on each request context rather than process.env.
 * The middleware refreshes this cache on every request so event-less helpers
 * can read deploy-time-stable configuration without importing the email layer.
 */
let cachedCfBindings: Record<string, unknown> | null = null

interface CloudflarePlatformContext {
  env?: Record<string, unknown>
  [key: string]: unknown
}

interface NitroCloudflareContext {
  cloudflare?: CloudflarePlatformContext
  _platform?: { cloudflare?: CloudflarePlatformContext }
  [key: string]: unknown
}

/**
 * Nitro's Cloudflare adapter initially carries the Worker request context under
 * `_platform.cloudflare`. Promote that exact object to the public application
 * contract before middleware and routes consume bindings. Keeping the same
 * object (rather than copying `env`) preserves native binding identity.
 */
export function promoteCloudflarePlatformContext(context: NitroCloudflareContext): CloudflarePlatformContext | undefined {
  if (context.cloudflare && typeof context.cloudflare === 'object') return context.cloudflare

  const platformCloudflare = context._platform?.cloudflare
  if (!platformCloudflare || typeof platformCloudflare !== 'object') return undefined

  context.cloudflare = platformCloudflare
  return platformCloudflare
}

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
