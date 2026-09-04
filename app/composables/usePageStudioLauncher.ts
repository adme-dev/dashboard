export function usePageStudioLauncher() {
  const config = useRuntimeConfig()

  function renderLaunchLoadingState(studioTab: Window) {
    const launchDocument = studioTab.document
    launchDocument.open()
    launchDocument.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Opening XeroFlow Page Studio</title>
    <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #121315;
        color: #f7f7f5;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main { width: min(28rem, calc(100vw - 3rem)); text-align: center; }
      .mark {
        width: 3rem;
        height: 3rem;
        margin: 0 auto 1.5rem;
        display: grid;
        place-items: center;
        border-radius: 0.875rem;
        background: #00dc82;
        color: #07130e;
        font-weight: 800;
        letter-spacing: -0.08em;
      }
      .spinner {
        width: 1.5rem;
        height: 1.5rem;
        margin: 0 auto 1.25rem;
        border: 2px solid rgba(255,255,255,0.18);
        border-top-color: #00dc82;
        border-radius: 999px;
        animation: spin 0.8s linear infinite;
      }
      h1 { margin: 0; font-size: 1.125rem; font-weight: 650; letter-spacing: -0.02em; }
      p { margin: 0.625rem 0 0; color: #a7a7ad; font-size: 0.875rem; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main role="status" aria-live="polite">
      <div class="mark" aria-hidden="true">XF</div>
      <div class="spinner" aria-hidden="true"></div>
      <h1>Opening Page Studio</h1>
      <p>Creating a secure editing session for this website...</p>
    </main>
  </body>
</html>`)
    launchDocument.close()
  }

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

    renderLaunchLoadingState(studioTab)

    try {
      const response = await $fetch<{ session: { token: string } }>(
        `/api/${audience}/page-studio/sites/${encodeURIComponent(siteId)}/editor-sessions`,
        { method: 'POST' }
      )
      if (studioTab.closed) throw new Error('The Page Studio tab was closed before launch completed')

      const form = studioTab.document.createElement('form')
      form.action = `${editorOrigin.value}/launch`
      form.method = 'POST'
      form.hidden = true

      const token = studioTab.document.createElement('input')
      token.type = 'hidden'
      token.name = 'token'
      token.value = response.session.token
      form.append(token)
      studioTab.document.body.append(form)
      studioTab.opener = null
      form.submit()
      studioTab.focus()
    } catch (error) {
      if (!studioTab.closed) studioTab.close()
      throw error
    }
  }

  return { editorOrigin, launchPageStudio }
}
