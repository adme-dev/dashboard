import { z } from 'zod'
import { siteIntelligenceIngestBatchSchema } from '~~/server/utils/siteIntelligence/contracts'
import { recordSiteIntelligenceIngestBatch } from '~~/server/utils/siteIntelligence/repository'
import { requireSiteIntelligenceWorkflowAuth } from '~~/server/utils/siteIntelligence/workflowAuth'

const schema = siteIntelligenceIngestBatchSchema.extend({
  clientId: z.string().uuid(),
  domainId: z.string().uuid()
})

export default defineEventHandler(async (event) => {
  requireSiteIntelligenceWorkflowAuth(event)
  const runId = getRouterParam(event, 'id')
  const raw = await readBody(event)
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > 5 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Ingest batch exceeds 5 MB' })
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success || !runId) throw createError({ statusCode: 400, statusMessage: 'Invalid crawl ingest batch' })
  const result = await recordSiteIntelligenceIngestBatch(runId, parsed.data)
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Crawl run not found' })
  return { ok: true, replayed: result.replayed }
})
