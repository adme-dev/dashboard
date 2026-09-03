export function usePageStudioLauncher() {
  const config = useRuntimeConfig()

  const editorOrigin = computed(() => {
    const value = config.public.pageStudioEditorUrl
    if (typeof value !== 'string' || !value) return ''

    try {
      const url = new URL(value)
      return url.protocol === 'https:' ? url.origin : ''
    } catch {
      return ''
    }
  })

  async function launchPageStudio(siteId: string, audience = 'agency') {
    if (!import.meta.client) return
    if (!editorOrigin.value) throw new Error('Page Studio editor is not configured')

    const targetName = `xeroflow-page-studio-${crypto.randomUUID()}`
    const studioTab = window.open('about:blank', targetName)
    if (!studioTab) throw new Error('Allow pop-ups for XeroFlow to open Page Studio in a new tab')

    studioTab.opener = null

    try {
      const response = await $fetch<{ session: { token: string } }>(
        `/api/${audience}/page-studio/sites/${encodeURIComponent(siteId)}/editor-sessions`,
        { method: 'POST' }
      )
      const form = document.createElement('form')
      form.action = `${editorOrigin.value}/launch`
      form.method = 'POST'
      form.target = targetName
      form.hidden = true

      const token = document.createElement('input')
      token.type = 'hidden'
      token.name = 'token'
      token.value = response.session.token
      form.append(token)
      document.body.append(form)
      form.submit()
      form.remove()
      studioTab.focus()
    } catch (error) {
      studioTab.close()
      throw error
    }
  }

  return { editorOrigin, launchPageStudio }
}
