import { apiErrorStatus } from '~/utils/apiError'

interface ClientPortalAccessRequestOptions {
  randomUUID?: () => string
}

interface ClientPortalAccessFetchOptions {
  method: 'POST'
  body: { clientId: string }
  headers: { 'Idempotency-Key': string }
}

type ClientPortalAccessFetch = <T>(
  url: string,
  options: ClientPortalAccessFetchOptions
) => Promise<T>

const DECISIVE_FAILURES = new Set([400, 404, 422, 428])

export function createClientPortalAccessRequestSession(
  send: ClientPortalAccessFetch,
  options: ClientPortalAccessRequestOptions = {}
) {
  const randomUUID = options.randomUUID ?? (() => globalThis.crypto.randomUUID())
  const keysByClient = new Map<string, string>()

  function keyFor(clientId: string): string {
    const existing = keysByClient.get(clientId)
    if (existing) return existing
    const key = `portal-access:${randomUUID()}`
    keysByClient.set(clientId, key)
    return key
  }

  return {
    async request<T>(clientId: string): Promise<T> {
      const idempotencyKey = keyFor(clientId)
      try {
        const response = await send<T>('/api/agency/client-portal/access', {
          method: 'POST',
          body: { clientId },
          headers: { 'Idempotency-Key': idempotencyKey }
        })
        keysByClient.delete(clientId)
        return response
      } catch (error: unknown) {
        const status = apiErrorStatus(error)
        if (status !== null && DECISIVE_FAILURES.has(status)) keysByClient.delete(clientId)
        throw error
      }
    }
  }
}
