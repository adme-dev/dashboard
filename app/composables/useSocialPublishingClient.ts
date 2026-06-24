/**
 * Global client context for the Social Publishing suite (Slice 1).
 *
 * The publishing pages (Accounts, Compose, Calendar, Queue, Approvals,
 * Analytics, Planner) all operate on a single selected client. Today the
 * selector lives only on the Accounts page, so context is lost when moving
 * between pages. This composable makes the selection ambient: it is the single
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

  const clientId = computed<string | null>({
    get: () => (route.query.client as string | undefined) || cookie.value || null,
    set: (value) => {
      cookie.value = value || null
      // Keep the URL in sync (deep-linkable) without stacking history entries.
      router.replace({ query: { ...route.query, client: value || undefined } })
    },
  })

  return { clientId }
}
