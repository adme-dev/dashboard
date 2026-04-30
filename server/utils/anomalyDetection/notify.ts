/**
 * Queue a notification for a newly-detected critical anomaly.
 *
 * Phase 1: no-op stub. Phase 3 wires Smart Watch + email fan-out
 * (see Task 3.2 in docs/superpowers/plans/2026-04-30-anomalies-overhaul.md).
 *
 * Tests stub this module via vi.mock — see test/server/utils/anomalyDetection/reconcile.test.ts.
 */
export async function queueAnomalyNotification(_anomalyId: string): Promise<void> {
  return
}
