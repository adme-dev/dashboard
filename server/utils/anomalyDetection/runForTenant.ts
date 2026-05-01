// server/utils/anomalyDetection/runForTenant.ts
import type { H3Event } from 'h3'
import { acquireScanLock, releaseScanLock } from './kvLock'
import { fetchSharedData } from './sharedData'
import { runAllAnalysers } from './index'
import { applyGroupRules } from './groupRules'
import { reconcile, type ReconcileResult } from './reconcile'

export interface RunOutcome {
  tenantId: string
  status: 'completed' | 'in_flight' | 'error'
  durationMs?: number
  reconcile?: ReconcileResult
  detected?: number
  error?: string
}

export async function runDetectionForTenant(
  tenantId: string,
  opts: { event?: H3Event | null } = {},
): Promise<RunOutcome> {
  const haveLock = await acquireScanLock(tenantId)
  if (!haveLock) return { tenantId, status: 'in_flight' }

  const start = Date.now()
  try {
    const data = await fetchSharedData(opts.event ?? null)
    const detected = await runAllAnalysers({ tenantId, data, now: new Date() })
    applyGroupRules(detected)
    const result = await reconcile(tenantId, detected)
    const durationMs = Date.now() - start
    if (durationMs > 60_000) {
      console.warn(`[anomalies] long detection run: tenant=${tenantId} durationMs=${durationMs}`)
    }
    return { tenantId, status: 'completed', durationMs, reconcile: result, detected: detected.length }
  } catch (err: any) {
    return { tenantId, status: 'error', error: String(err?.message || err) }
  } finally {
    await releaseScanLock(tenantId)
  }
}
