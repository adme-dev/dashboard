import { z } from 'zod'
import { completeSiteIntelligenceRun } from '~~/server/utils/siteIntelligence/repository'
import { requireSiteIntelligenceWorkflowAuth } from '~~/server/utils/siteIntelligence/workflowAuth'

const schema = z.object({
  clientId: z.string().uuid(),
  domainId: z.string().uuid(),
  status: z.enum(['completed', 'partial', 'blocked', 'failed', 'cancelled']),
  cloudflareJobId: z.string().trim().min(1).max(200).optional(),
  totalPages: z.number().int().min(0).optional(),
  completedPages: z.number().int().min(0).optional(),
  disallowedPages: z.number().int().min(0).optional(),
  erroredPages: z.number().int().min(0).optional(),
  browserSeconds: z.number().min(0).optional(),
  errorCategory: z.string().trim().max(120).optional(),
  errorSummary: z.string().trim().max(1000).optional()
})

export default defineEventHandler(async (event) => {
  requireSiteIntelligenceWorkflowAuth(event)
  const runId = getRouterParam(event, 'id')
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success || !runId) throw createError({ statusCode: 400, statusMessage: 'Invalid crawl completion' })
  const run = await completeSiteIntelligenceRun(runId, parsed.data)
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Active crawl run not found' })
  return { run }
})
