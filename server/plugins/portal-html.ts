import { filterPortalResourceHints } from '~~/server/utils/portalHtml'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const { pathname } = getRequestURL(event)
    if (pathname !== '/portal' && !pathname.startsWith('/portal/')) return

    html.head = filterPortalResourceHints(html.head)
  })
})
