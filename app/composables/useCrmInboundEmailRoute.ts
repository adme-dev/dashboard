import { ref } from 'vue'
import type {
  CrmInboundEmailRoute,
  CrmInboundEmailRouteIssuedResponse,
  CrmInboundEmailRouteListResponse,
  CrmInboundEmailRouteRevokeResponse,
  UseCrmInboundEmailRouteOptions
} from '~/types/crmEmailRoute'

type ApiFetch = <T>(
  request: string,
  options?: {
    method?: 'GET' | 'POST' | 'DELETE'
    body?: Record<string, unknown>
    query?: Record<string, string>
  }
) => Promise<T>

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    ?? candidate?.statusMessage
    ?? candidate?.message
    ?? 'Please retry.'
}

/**
 * Holds only the safe, refreshable CRM inbox route projection. The one-time
 * issued address deliberately belongs to the consuming component's local ref.
 */
export function useCrmInboundEmailRoute(options: UseCrmInboundEmailRouteOptions) {
  const toast = useToast()
  const apiFetch = $fetch as ApiFetch
  const routes = ref<CrmInboundEmailRoute[]>([])
  const pending = ref(false)
  const mutationPendingId = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  let refreshEpoch = 0

  function routeUrl(path = ''): string {
    return `${options.apiBase}/email-routes${path}`
  }

  function mutationBody(body: Record<string, unknown> = {}): Record<string, unknown> {
    return options.clientId ? { client_id: options.clientId, ...body } : body
  }

  function replaceRoute(route: CrmInboundEmailRoute) {
    const index = routes.value.findIndex(item => item.id === route.id)
    if (index === -1) routes.value.unshift(route)
    else routes.value[index] = route
  }

  async function refresh(): Promise<void> {
    const epoch = ++refreshEpoch
    pending.value = true
    loadError.value = null
    try {
      const response = await apiFetch<CrmInboundEmailRouteListResponse>(routeUrl(), {
        method: 'GET',
        ...(options.clientId ? { query: { client_id: options.clientId } } : {})
      })
      if (epoch === refreshEpoch) routes.value = response.items ?? []
    } catch (error) {
      if (epoch === refreshEpoch) loadError.value = errorMessage(error)
    } finally {
      if (epoch === refreshEpoch) pending.value = false
    }
  }

  async function create(label: string): Promise<CrmInboundEmailRouteIssuedResponse | null> {
    if (mutationPendingId.value) return null
    mutationPendingId.value = 'create'
    try {
      const response = await apiFetch<CrmInboundEmailRouteIssuedResponse>(routeUrl(), {
        method: 'POST', body: mutationBody({ label })
      })
      replaceRoute(response.route)
      return response
    } catch (error) {
      toast.add({ title: 'Could not create inbox address', description: errorMessage(error), color: 'error' })
      return null
    } finally {
      mutationPendingId.value = null
    }
  }

  async function rotate(route: CrmInboundEmailRoute): Promise<CrmInboundEmailRouteIssuedResponse | null> {
    if (mutationPendingId.value) return null
    mutationPendingId.value = route.id
    try {
      const response = await apiFetch<CrmInboundEmailRouteIssuedResponse>(routeUrl(`/${route.id}/rotate`), {
        method: 'POST', body: mutationBody()
      })
      replaceRoute(response.route)
      return response
    } catch (error) {
      toast.add({ title: 'Could not rotate inbox address', description: errorMessage(error), color: 'error' })
      return null
    } finally {
      mutationPendingId.value = null
    }
  }

  async function revoke(route: CrmInboundEmailRoute): Promise<CrmInboundEmailRouteRevokeResponse | null> {
    if (mutationPendingId.value) return null
    mutationPendingId.value = route.id
    try {
      const response = await apiFetch<CrmInboundEmailRouteRevokeResponse>(routeUrl(`/${route.id}`), {
        method: 'DELETE', body: mutationBody()
      })
      replaceRoute(response.route)
      return response
    } catch (error) {
      toast.add({ title: 'Could not revoke inbox address', description: errorMessage(error), color: 'error' })
      return null
    } finally {
      mutationPendingId.value = null
    }
  }

  async function copyAddress(address: string): Promise<boolean> {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(address)
      toast.add({ title: 'Address copied', description: 'Paste it where inbound CRM email should be sent.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Copy failed', description: 'Select the address and copy it manually.', color: 'error' })
      return false
    }
  }

  return {
    routes,
    pending,
    mutationPendingId,
    loadError,
    refresh,
    create,
    rotate,
    revoke,
    copyAddress
  }
}
