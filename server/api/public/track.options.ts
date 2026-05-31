/** CORS preflight for the public tracking beacon. Echoes the request Origin
 *  (never '*' — credentialed/keepalive beacons require a concrete origin). */
export default defineEventHandler((event) => {
  const origin = getHeader(event, 'origin') || '*'
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  })
  setResponseStatus(event, 204)
  return ''
})
