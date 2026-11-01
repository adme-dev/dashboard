import { useEvent } from 'nitropack/runtime/internal/context'

const ORIGINS = {
  production: 'https://app.xeroflow.io',
  staging: 'https://preview.agency-dashboard-6cm.pages.dev'
} as const

/** Private-Worker implementation of the canonical session verification port.
 * Pages retains the signing key. Never trust actor headers or decoded claims
 * until the existing live session authority has accepted this exact token.
 * validateSession still re-reads active staff and revocation from fresh DB.
 */
export async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  const env = useEvent().context.cloudflare?.env
  const environment = env?.EMAIL_DESIGN_ENVIRONMENT as keyof typeof ORIGINS
  if (env?.EMAIL_DESIGN_SESSION_AUTHORITY !== 'pages-auth-me-v1' || !Object.hasOwn(ORIGINS, environment))
    throw authorityUnavailable('configuration')
  if (typeof token !== 'string' || !token || token.length > 4096 || /[\r\n]/.test(token)) return null
  let response: Response
  try {
    response = await fetch(ORIGINS[environment] + '/api/auth/me', {
      method: 'GET', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json', 'Cache-Control': 'no-cache' },
      redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000)
    })
  } catch { throw authorityUnavailable('transport') }
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel()
    return null
  }
  if (response.status !== 200 || !response.headers.get('content-type')?.includes('application/json')) {
    await response.body?.cancel()
    throw authorityUnavailable('http_' + response.status)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Session authority unavailable')
  let text = ''
  let bytes = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > 32768) {
        await reader.cancel()
        throw new Error('Session authority unavailable')
      }
      text += decoder.decode(part.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try {
    const authority = JSON.parse(text)
    if (authority.success !== true || authority.user?.is_active !== true || typeof authority.user.id !== 'string')
      throw new Error('Invalid authority response')
    const [data, signature, extra] = token.split('.')
    if (!data || !signature || extra) return null
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0))))
    if (payload.userId !== authority.user.id || (payload.exp && Date.now() > payload.exp)) return null
    return payload
  } catch { throw authorityUnavailable('invalid_response') }
}

function authorityUnavailable(code: string): Error {
  // Content-free deployment diagnosis; no token, headers or authority payload.
  console.warn('[email-design-session]', code)
  return new Error('Session authority unavailable')
}
