import { createError, defineEventHandler, getHeader, setHeader } from 'h3'
import { createMondayCampaignPerformanceDependencies } from '~~/server/utils/mondayCampaignPerformanceStore'
import { reconcileMondayCampaignPerformance } from '~~/server/utils/mondayCampaignPerformanceReconciler'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const dependencies = await createMondayCampaignPerformanceDependencies()
  const result = await reconcileMondayCampaignPerformance({ apply: true, writeBackMonday: false }, dependencies)
  return {
    ok: true,
    mode: result.mode,
    total: result.total,
    matched: result.matched,
    pending: result.pending,
    ambiguous: result.ambiguous,
    writtenBack: result.writtenBack,
    writeBackSkipped: result.writeBackSkipped,
    writeBackFailed: result.writeBackFailed,
    persisted: result.persisted,
    unmapped: result.unmappedMondayItemIds.length
  }
})
