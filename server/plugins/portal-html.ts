import { filterPortalResourceHints } from '~~/server/utils/portalHtml'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const { pathname } = getRequestURL(event)
    if (!/^\/(?:portal|studio)(?:\/|$)/.test(pathname)) return

    html.head = filterPortalResourceHints(html.head)
  })
})
