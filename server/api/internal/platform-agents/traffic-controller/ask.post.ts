import { runTrafficControllerAgentRequest } from '~~/server/utils/ai/trafficControllerAgentRuntime'

function enabled() {
  return process.env.TRAFFIC_CONTROLLER_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  const authHeader = getHeader(event, 'authorization')
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Traffic Controller Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Traffic Controller bridge does not allow direct write actions.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null

  return runTrafficControllerAgentRequest({
    prompt,
    clientId,
    userId: null,
    route: '/internal/platform-agents/traffic-controller',
  })
})
