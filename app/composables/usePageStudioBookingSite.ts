export function usePageStudioBookingSite() {
  const route = useRoute()
  const router = useRouter()
  const siteId = computed(() => typeof route.query.siteId === 'string' ? route.query.siteId : '')
  function selectSite(value: string) {
    return router.replace({ query: { ...route.query, siteId: value || undefined } })
  }
  return { siteId, selectSite }
}
