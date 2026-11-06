export default defineNuxtPlugin(() => {
  // Client presentations have their own status refresh and never edit a workspace.
  const isClientPresentation = () => /^\/share\/banner\/p_[0-9a-f]{32}\/?$/i.test(window.location.pathname)
  if (isClientPresentation()) return
  const nuxtApp = useNuxtApp()
  const currentBuildId = nuxtApp.payload.config?.app?.buildId

  if (!currentBuildId) return

  const toast = useToast()
  let checking = false
  let promptedForBuildId: string | null = null

  async function checkBuildFreshness() {
    if (checking || document.visibilityState === 'hidden' || isClientPresentation()) return

    checking = true
    try {
      const response = await fetch(`${window.location.pathname}${window.location.search}`, {
        cache: 'no-store',
        headers: { Accept: 'text/html' }
      })
      if (!response.ok) return

      const html = await response.text()
      const match = html.match(/"?buildId"?\s*:\s*"([^"]+)"/)
      const nextBuildId = match?.[1]

      if (!nextBuildId || nextBuildId === currentBuildId || nextBuildId === promptedForBuildId) return

      promptedForBuildId = nextBuildId
      toast.add({
        title: 'Update available',
        description: 'Reload to use the latest editor and workspace updates.',
        color: 'primary',
        duration: 0,
        actions: [{
          label: 'Reload',
          color: 'primary',
          variant: 'soft',
          onClick: () => window.location.reload()
        }]
      })
    } catch {
      // Ignore transient network errors; the next focus/visibility event retries.
    } finally {
      checking = false
    }
  }

  window.addEventListener('focus', checkBuildFreshness)
  document.addEventListener('visibilitychange', checkBuildFreshness)
})
