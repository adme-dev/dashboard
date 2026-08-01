import { z } from 'zod'
import { siteIntelligenceIngestBatchSchema } from '~~/server/utils/siteIntelligence/contracts'
import { recordSiteIntelligenceIngestBatch } from '~~/server/utils/siteIntelligence/repository'
import { requireSiteIntelligenceWorkflowAuth } from '~~/server/utils/siteIntelligence/workflowAuth'
import {
  prepareSiteIntelligenceSnapshot,
  recordOrphanSiteIntelligenceSnapshots
} from '~~/server/utils/siteIntelligence/storage'
import { enqueue } from '~~/server/utils/queue'

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
  const records = await Promise.all(parsed.data.records.map(record => prepareSiteIntelligenceSnapshot(event, {
    clientId: parsed.data.clientId,
    domainId: parsed.data.domainId,
    runId,
    record
  })))
  const snapshotKeys = records.flatMap(record => record.r2ObjectKey ? [record.r2ObjectKey] : [])
  let result: Awaited<ReturnType<typeof recordSiteIntelligenceIngestBatch>>
  try {
    result = await recordSiteIntelligenceIngestBatch(runId, { ...parsed.data, records })
  } catch (error) {
    recordOrphanSiteIntelligenceSnapshots(snapshotKeys, error)
    throw error
  }
  if (!result) {
    recordOrphanSiteIntelligenceSnapshots(snapshotKeys, 'Crawl run not found')
    throw createError({ statusCode: 404, statusMessage: 'Crawl run not found' })
  }
  for (const payload of result.enrichmentJobs) {
    await enqueue(event, 'site-intelligence.enrich', payload)
  }
  return { ok: true, replayed: result.replayed }
})
