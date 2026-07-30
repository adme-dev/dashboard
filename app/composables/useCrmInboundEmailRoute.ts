import { computed, ref, toValue, watch } from 'vue'
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
  const apiBase = computed(() => toValue(options.apiBase))
  const clientId = computed(() => toValue(options.clientId))
  const routes = ref<CrmInboundEmailRoute[]>([])
  const pending = ref(false)
  const mutationPendingId = ref<string | null>(null)
  const loadError = ref<string | null>(null)
  let refreshEpoch = 0
  let pendingRefreshEpoch: number | null = null
  let contextEpoch = 0

  interface RequestContext {
    apiBase: string
    clientId?: string
    contextEpoch: number
  }

  function currentContext(): RequestContext {
    return { apiBase: apiBase.value, clientId: clientId.value, contextEpoch }
  }

  function matchesCurrentContext(context: RequestContext): boolean {
    return context.contextEpoch === contextEpoch
      && context.apiBase === apiBase.value
      && context.clientId === clientId.value
  }

  function routeUrl(context: RequestContext, path = ''): string {
    return `${context.apiBase}${path}`
  }

  function mutationBody(context: RequestContext, body: Record<string, unknown> = {}): Record<string, unknown> {
    return context.clientId ? { client_id: context.clientId, ...body } : body
  }

  function replaceRoute(route: CrmInboundEmailRoute) {
    const index = routes.value.findIndex(item => item.id === route.id)
    if (index === -1) routes.value.unshift(route)
    else routes.value[index] = route
  }

  function reset(): void {
    contextEpoch += 1
    refreshEpoch += 1
    pendingRefreshEpoch = null
    routes.value = []
    pending.value = false
    mutationPendingId.value = null
    loadError.value = null
  }

  watch([apiBase, clientId], reset)

  function supersedeRefresh(): void {
    refreshEpoch += 1
    if (pendingRefreshEpoch !== null) {
      pendingRefreshEpoch = null
      pending.value = false
    }
  }

  async function refresh(): Promise<void> {
    const context = currentContext()
    const epoch = ++refreshEpoch
    pendingRefreshEpoch = epoch
    pending.value = true
    loadError.value = null
    try {
      const response = await apiFetch<CrmInboundEmailRouteListResponse>(routeUrl(context), {
        method: 'GET',
        ...(context.clientId ? { query: { client_id: context.clientId } } : {})
      })
      if (epoch === refreshEpoch && matchesCurrentContext(context)) routes.value = response.items ?? []
    } catch (error) {
      if (epoch === refreshEpoch && matchesCurrentContext(context)) loadError.value = errorMessage(error)
    } finally {
      if (pendingRefreshEpoch === epoch) {
        pendingRefreshEpoch = null
        pending.value = false
      }
    }
  }

  async function create(label: string): Promise<CrmInboundEmailRouteIssuedResponse | null> {
    if (mutationPendingId.value) return null
    const context = currentContext()
    supersedeRefresh()
    mutationPendingId.value = 'create'
    try {
      const response = await apiFetch<CrmInboundEmailRouteIssuedResponse>(routeUrl(context), {
        method: 'POST', body: mutationBody(context, { label })
      })
      if (!matchesCurrentContext(context)) return null
      replaceRoute(response.route)
      return response
    } catch (error) {
      if (matchesCurrentContext(context)) {
        toast.add({ title: 'Could not create inbox address', description: errorMessage(error), color: 'error' })
      }
      return null
    } finally {
      if (matchesCurrentContext(context)) mutationPendingId.value = null
    }
  }

  async function rotate(route: CrmInboundEmailRoute): Promise<CrmInboundEmailRouteIssuedResponse | null> {
    if (mutationPendingId.value) return null
    const context = currentContext()
    supersedeRefresh()
    mutationPendingId.value = route.id
    try {
      const response = await apiFetch<CrmInboundEmailRouteIssuedResponse>(routeUrl(context, `/${route.id}/rotate`), {
        method: 'POST', body: mutationBody(context)
      })
      if (!matchesCurrentContext(context)) return null
      routes.value = routes.value.filter(item => item.id !== route.id)
      replaceRoute(response.route)
      return response
    } catch (error) {
      if (matchesCurrentContext(context)) {
        toast.add({ title: 'Could not rotate inbox address', description: errorMessage(error), color: 'error' })
      }
      return null
    } finally {
      if (matchesCurrentContext(context)) mutationPendingId.value = null
    }
  }

  async function revoke(route: CrmInboundEmailRoute): Promise<CrmInboundEmailRouteRevokeResponse | null> {
    if (mutationPendingId.value) return null
    const context = currentContext()
    supersedeRefresh()
    mutationPendingId.value = route.id
    try {
      const response = await apiFetch<CrmInboundEmailRouteRevokeResponse>(routeUrl(context, `/${route.id}`), {
        method: 'DELETE', body: mutationBody(context)
      })
      if (!matchesCurrentContext(context)) return null
      replaceRoute(response.route)
      return response
    } catch (error) {
      if (matchesCurrentContext(context)) {
        toast.add({ title: 'Could not revoke inbox address', description: errorMessage(error), color: 'error' })
      }
      return null
    } finally {
      if (matchesCurrentContext(context)) mutationPendingId.value = null
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
    reset,
    refresh,
    create,
    rotate,
    revoke,
    copyAddress
  }
}
