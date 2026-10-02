/**
 * Global client context for the Social Publishing suite (Slice 1).
 *
 * The publishing pages (Accounts, Compose, Calendar, Queue, Approvals,
 * Analytics, Planner) all operate on a single selected client. Today the
 * shell shares one selector with each page's client-specific controls. This
 * composable makes the selection ambient: it is the single
 * source of truth, persisted to the `?client=` query param (shareable/deep-link)
 * and a 30-day cookie (sticky across sessions).
 *
 * Usage:
 *   const { clientId } = useSocialPublishingClient()
 *   // bind a USelectMenu to clientId in the suite shell; read it on every page.
 */
export function useSocialPublishingClient() {
  const route = useRoute()
  const router = useRouter()

  // Sticky fallback so the suite remembers the last client across sessions.
  const cookie = useCookie<string | null>('social-publishing-client', {
    default: () => null,
    maxAge: 60 * 60 * 24 * 30,
    sameSite: 'lax',
  })

  const { data: clientsData } = useFetch('/api/agency/clients', { query: { limit: 200 } })
  const clients = computed<Array<{ id: string; name: string }>>(() => {
    const data = clientsData.value as any
    return Array.isArray(data) ? data : (data?.clients ?? [])
  })
  const requestedClient = computed(() => route.query.client !== undefined ? route.query.client : cookie.value)
  async function selectClient(value: string | null) {
    cookie.value = value || null
    await router.replace({ query: { ...route.query, client: value || undefined } })
  }

  const clientId = computed<string | null>({
    get: () => {
      const value = requestedClient.value
      return typeof value === 'string' && clients.value.some(client => client.id === value) ? value : null
    },
    set: (value) => {
      // Keep the URL in sync (deep-linkable) without stacking history entries.
      void selectClient(value)
    },
  })

  // A missing selection may use the initial default. An explicit invalid query or
  // stale cookie must require a choice, never silently switch work to another client.
  watchEffect(() => {
    if (route.query.client !== undefined && clientId.value) {
      cookie.value = clientId.value
    } else if (route.query.client === undefined && !cookie.value && clients.value.length) {
      clientId.value = clients.value[0]!.id
    }
  })
  const invalidSelection = computed(() => clientsData.value != null && requestedClient.value != null && !clientId.value)

  return { clientId, clients, invalidSelection, selectClient }
}
