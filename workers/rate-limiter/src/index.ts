/**
 * rate-limiter-worker entry. Exports the RateLimiter DO class so the Pages
 * project can bind it. Direct fetches aren't used (access is via the binding).
 */
import { RateLimiter } from './RateLimiter'

interface Env {
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>
}

export { RateLimiter }

export default {
  async fetch(): Promise<Response> {
    return new Response('rate-limiter-worker: use the RATE_LIMITER binding', { status: 404 })
  },
} satisfies ExportedHandler<Env>
