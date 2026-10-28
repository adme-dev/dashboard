// Keep every editor under the canonical origin so browser storage stays consistent.
export default {
  fetch(request) {
    const url = new URL(request.url)
    url.protocol = 'https:'
    url.hostname = 'creative.xeroflow.io'
    url.port = ''
    return Response.redirect(url.href, 308)
  },
}
