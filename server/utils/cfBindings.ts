/**
 * Process-local cache of primitive Cloudflare Pages configuration.
 *
 * Pages exposes bindings on each request context rather than process.env.
 * Native object bindings are deliberately excluded: request-owned capabilities
 * must be threaded from event.context.cloudflare.env to the operation using them.
 */
let cachedCfBindings: Record<string, string> = {}

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
  if (!env || typeof env !== 'object') return
  cachedCfBindings = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
}

export function getCachedCfBinding(key: string): string | undefined {
  return cachedCfBindings[key]
}

export function getCachedCfObjectBinding<T = unknown>(key: string): T | undefined {
  void key
  return undefined
}
