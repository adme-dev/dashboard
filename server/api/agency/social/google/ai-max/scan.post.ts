import { z } from 'zod'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import { runAfterResponse } from '~~/server/utils/asyncBackground'
import { loadGoogleAiMaxScanContext } from '~~/server/utils/googleAiMaxConnections'
import {
  claimGoogleAiMaxScanRun,
  getActiveGoogleAiMaxScanRun
} from '~~/server/utils/googleAiMaxRepository'
import { runGoogleAiMaxPortfolioScan } from '~~/server/utils/googleAiMaxScanner'
import { captureGoogleAiMaxCacheInvalidator } from '~~/server/utils/googleAiMaxCache'

const BodySchema = z.object({
  connectionId: z.string().uuid().optional()
}).strict()

export default eventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  }

  const parsed = BodySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AI Max scan request' })
  }

  const context = await loadGoogleAiMaxScanContext({
    tenantId,
    connectionId: parsed.data.connectionId
  })
  if (parsed.data.connectionId && context.accounts.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Google connection not found' })
  }

  const requestedBy = typeof user?.id === 'string' ? user.id : undefined
  const claimInput = {
    tenantId,
    trigger: 'manual' as const,
    requestedBy,
    totalConnections: context.accounts.length,
    apiVersion: 'v23'
  }
  let run = await claimGoogleAiMaxScanRun(claimInput)
  if (!run) {
    const active = await getActiveGoogleAiMaxScanRun(tenantId)
    if (active) {
      return { runId: active.id, status: active.status, deduplicated: true }
    }

    // The prior run may have finished between the conflict and lookup. Retry
    // once; fail closed if another request wins the new claim.
    run = await claimGoogleAiMaxScanRun(claimInput)
    if (!run) {
      throw createError({ statusCode: 409, statusMessage: 'AI Max scan already active' })
    }
  }

  const observedAt = new Date().toISOString()
  const invalidateCache = captureGoogleAiMaxCacheInvalidator(event)
  const work = runGoogleAiMaxPortfolioScan({
    tenantId,
    trigger: 'manual',
    requestedBy,
    claimedRun: run,
    developerToken: context.developerToken,
    observedAt,
    accounts: context.accounts
  }).then(async (result) => {
    if (result.accepted) await invalidateCache(tenantId)
    return result
  })
  runAfterResponse(event, work, `google-ai-max-scan:${run.id}`)

  return { runId: run.id, status: run.status, deduplicated: false }
})
