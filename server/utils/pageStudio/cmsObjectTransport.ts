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
  return readCmsJsonBody(response, 2_000_000)
}

/** Shared response decoder only; callers own URL, status, digest and authority.
 * Native coordinator failures must not await cancellation of a teed response. */
export async function readCmsJsonBody(response: Response, limit: number, waitForCancellation = true): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw unavailable()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0, raw = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw unavailable()
      raw += decoder.decode(value, { stream: true })
    }
    return JSON.parse(raw + decoder.decode()) as unknown
  } catch {
    const cancelled = reader.cancel().catch(() => {})
    if (waitForCancellation) await cancelled
    throw unavailable()
  } finally { reader.releaseLock() }
}
