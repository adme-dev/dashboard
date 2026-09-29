const unavailable = () => new Error('Managed CMS object transport unavailable')

/** Only the trusted router binding accepts this read-only path. Fetch allows
 * storage to execute near its D1 primary without changing authority checks. */
export async function readPlacedCmsObjects(fetch: (request: Request) => Promise<unknown>, input: unknown) {
  const response = await fetch(new Request('https://cms-objects.internal/read', {
    method: 'POST', body: JSON.stringify(input), redirect: 'manual',
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    signal: AbortSignal.timeout(8000)
  }))
  if (!(response instanceof Response)) throw unavailable()
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel().catch(() => {})
    throw unavailable()
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0, raw = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) throw unavailable()
      raw += decoder.decode(value, { stream: true })
    }
    return JSON.parse(raw + decoder.decode()) as unknown
  } catch {
    await reader.cancel().catch(() => {})
    throw unavailable()
  } finally { reader.releaseLock() }
}
