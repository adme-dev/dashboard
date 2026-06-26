import { runFinancialWatchAgentRequest } from '~~/server/utils/ai/financialWatchAgentRuntime'

function enabled() {
  return process.env.FINANCIAL_WATCH_AGENT_ENABLED === 'true'
}

export default defineEventHandler(async (event) => {
  const expectedKey = process.env.INTERNAL_API_KEY?.trim()
  const authHeader = getHeader(event, 'authorization')
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (!enabled()) {
    throw createError({ statusCode: 404, statusMessage: 'Financial Watch Agent is not enabled.' })
  }

  const body = await readBody(event)
  if (body?.draftActions === true) {
    throw createError({ statusCode: 403, statusMessage: 'Financial Watch bridge does not allow direct write actions.' })
  }

  const prompt = String(body?.prompt || '').trim()
  if (!prompt) {
    throw createError({ statusCode: 400, statusMessage: 'prompt required' })
  }
  const context = body?.context && typeof body.context === 'object' ? body.context : {}
  const tenantId = typeof context.tenantId === 'string' && context.tenantId.trim() ? context.tenantId.trim() : ''
  const clientId = typeof context.clientId === 'string' && context.clientId.trim() ? context.clientId.trim() : null

  return runFinancialWatchAgentRequest({
    prompt,
    tenantId,
    clientId,
    userId: null,
    route: '/internal/platform-agents/financial-watch',
  })
})
