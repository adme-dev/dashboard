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
const TERMINAL_UNREPLAYABLE_CODE = 'client_portal_access_unreplayable'

function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const candidate = error as {
    code?: unknown
    data?: { code?: unknown, data?: { code?: unknown } }
  }
  const code = candidate.data?.data?.code ?? candidate.data?.code ?? candidate.code
  return typeof code === 'string' ? code : null
}

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
        if (
          (status !== null && DECISIVE_FAILURES.has(status))
          || (status === 409 && errorCode(error) === TERMINAL_UNREPLAYABLE_CODE)
        ) {
          keysByClient.delete(clientId)
        }
        throw error
      }
    }
  }
}

interface ClientPortalOpenControllerDependencies {
  accessRequests: ReturnType<typeof createClientPortalAccessRequestSession>
  refreshActivity: () => unknown
  navigate: (path: string) => unknown
  notifyError: (error: unknown) => void
  setOpening: (opening: boolean) => void
}

export function createClientPortalOpenController(dependencies: ClientPortalOpenControllerDependencies) {
  return {
    async open(clientId: string, path = '/portal'): Promise<boolean> {
      dependencies.setOpening(true)
      try {
        await dependencies.accessRequests.request(clientId)
        dependencies.refreshActivity()
        dependencies.navigate(path)
        return true
      } catch (error: unknown) {
        dependencies.notifyError(error)
        return false
      } finally {
        dependencies.setOpening(false)
      }
    }
  }
}
