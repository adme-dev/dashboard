import { DESIGN_ACTION_LIMITS } from '../../shared/emailRendering/designActions'
import { MAX_RENDER_REQUEST_BYTES } from '../../shared/emailRendering/bounds'

const ENVIRONMENTS = new Set(['staging', 'production'])
const LEGACY_TEMPLATE_PATH = /^\/api\/email\/templates\/[^/]+$/

function bodyLimit(request) {
  const legacyTemplatePatch = request.method === 'PATCH'
    && LEGACY_TEMPLATE_PATH.test(new URL(request.url).pathname)
  return legacyTemplatePatch
    ? MAX_RENDER_REQUEST_BYTES + DESIGN_ACTION_LIMITS.envelopeBytes
    : DESIGN_ACTION_LIMITS.envelopeBytes
}

let nitroPromise
function loadNitro() {
  nitroPromise ??= import('./dist/server/index.mjs').then(module => module.default)
  return nitroPromise
}

function rejection(status, message) {
  return new Response(message, {
    status,
    statusText: message,
    headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' }
  })
}

async function admitBody(request) {
  const limit = bodyLimit(request)
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    await request.body?.cancel()
    return { error: rejection(413, 'design_request_too_large') }
  }
  if (!request.body) return { request }
  const reader = request.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > limit) {
        await reader.cancel()
        return { error: rejection(413, 'design_request_too_large') }
      }
      chunks.push(item.value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { request: new Request(request, { body }) }
}

export default {
  async fetch(request, env, context) {
    const environment = env.EMAIL_DESIGN_ENVIRONMENT
    if (!ENVIRONMENTS.has(environment))
      return rejection(503, 'email_design_environment_unavailable')
    if (request.headers.get('x-xeroflow-email-design-environment') !== environment)
      return rejection(403, 'email_design_environment_mismatch')
    if (env.EMAIL_DESIGN_SESSION_AUTHORITY !== 'pages-auth-me-v1')
      return rejection(503, 'email_design_authority_unavailable')

    const admitted = await admitBody(request)
    if (admitted.error) return admitted.error
    const nitro = await loadNitro()
    return nitro.fetch(admitted.request, env, context)
  }
}
