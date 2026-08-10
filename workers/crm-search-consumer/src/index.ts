import {
  consumeCrmSearchQueueBatch,
  type CrmSearchConsumerBindings
} from './consumer'
import { evaluateCrmSearchConsumerHealth } from './health'

const responseHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff'
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'GET' || url.pathname !== '/health' || url.search !== '') {
      return jsonResponse({ status: 'not_found' }, 404)
    }
    try {
      const health = await evaluateCrmSearchConsumerHealth(env, {
        fetch: async healthRequest => await fetch(healthRequest),
        now: () => Date.now()
      })
      return jsonResponse(health, 200)
    } catch {
      return jsonResponse({ status: 'unready' }, 503)
    }
  },

  async queue(batch, env): Promise<void> {
    await consumeCrmSearchQueueBatch(batch, env)
  }
} satisfies ExportedHandler<CrmSearchConsumerEnv & CrmSearchConsumerBindings, unknown>
