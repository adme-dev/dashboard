/**
 * Stash CF Pages bindings into a module-level cache on every request so
 * event-less call sites (notification utilities, AI agent runner, automation
 * engine, queue/cron handlers triggered via HTTP) can still read secrets like
 * RESEND_API_KEY and config like APP_URL.
 *
 * On CF Pages, secrets are NOT exposed via process.env — only via
 * event.context.cloudflare.env. Bindings are deploy-time stable, so caching
 * them across requests in the same isolate is safe.
 */

import {
  promoteCloudflarePlatformContext,
  setCachedCfBindings
} from '~~/server/utils/cfBindings'

export default defineEventHandler((event) => {
  const cloudflare = promoteCloudflarePlatformContext(event.context as Record<string, unknown>)
  const env = cloudflare?.env
  if (env) setCachedCfBindings(env)
})
