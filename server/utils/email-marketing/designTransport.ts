import {
  createError,
  defineEventHandler,
  getRequestURL,
  sendWebResponse,
  setHeader,
  toWebRequest
} from 'h3'

/** Transport only. Existing Pages middleware still runs before these routes.
 * The private Worker owns session, scope, input validation and
 * transactional writes. Forward original authority; never derive an actor here. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const env = event.context.cloudflare?.env ?? {}
  const path = getRequestURL(event).pathname
  const draft = /^\/api\/email\/design\/drafts\/[0-9a-f-]{36}(\/metadata)?$/i.exec(path)
  const template = /^\/api\/email\/templates\/[0-9a-f-]{36}$/i.test(path)
    && (event.method === 'PATCH' || event.method === 'DELETE')
  const allowed = (draft && (event.method === 'PATCH' || (!draft[1] && event.method === 'GET')))
    || (path === '/api/email/design/drafts/initialize' && event.method === 'POST')
  // Existing template CRUD remains available when new draft saves are disabled.
  if (!template && (env.FIGFLOW_EDM_DRAFT_SAVES_ENABLED !== 'true' || !allowed))
    throw createError({ statusCode: 404, statusMessage: 'not_found' })
  const service = env.EMAIL_DESIGN
  const environment = env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  const unavailable = () => createError({ statusCode: 503, statusMessage: 'design_service_unavailable' })
  if (!service || typeof service.fetch !== 'function' || !['production', 'staging'].includes(environment))
    throw unavailable()
  try {
    const request = new Request(toWebRequest(event))
    request.headers.set('x-xeroflow-email-design-environment', environment)
    const response = await service.fetch(request)
    const output = new Response(response.body, response)
    output.headers.set('cache-control', 'no-store')
    return await sendWebResponse(event, output)
  } catch {
    // A lost reply does not establish that a write failed. The caller retains
    // its operation ID and reconciles against the existing receipt contract.
    throw unavailable()
  }
})
