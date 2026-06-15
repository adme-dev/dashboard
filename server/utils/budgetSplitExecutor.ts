/**
 * Sequential per-ad-set budget writer for the multi-ABO split (Phase 1.5).
 * Writes each ad set's daily budget and read-back-verifies it, stopping at the
 * first failure so later ad sets stay 'not_attempted' — the campaign is left in a
 * mixed state (Meta has no cross-ad-set transaction), and the result array records
 * exactly which ad sets were applied / failed / never touched for reconciliation.
 *
 * Pure orchestration over an injected writer (no network / DB import) so the
 * live-money write loop is unit-testable without Nitro.
 */

export interface AdSetSplit {
  id: string
  newDailyMajor: number
}

export interface AdSetWriteResult {
  adSetId: string
  requested: number
  readBack: number | null
  status: 'applied' | 'failed' | 'not_attempted'
  error?: string
}

export async function executeAdSetSplitWrites(
  splits: AdSetSplit[],
  writeDailyBudget: (adSetId: string, dailyMajor: number) => Promise<{ readBackDailyMajor: number }>,
): Promise<{ allApplied: boolean; results: AdSetWriteResult[] }> {
  const results: AdSetWriteResult[] = splits.map(s => ({
    adSetId: s.id, requested: s.newDailyMajor, readBack: null, status: 'not_attempted',
  }))
  let allApplied = true
  for (let i = 0; i < splits.length; i++) {
    const s = splits[i]!
    try {
      const res = await writeDailyBudget(s.id, s.newDailyMajor)
      const ok = Math.abs(res.readBackDailyMajor - s.newDailyMajor) < 0.01
      results[i]!.readBack = res.readBackDailyMajor
      results[i]!.status = ok ? 'applied' : 'failed'
      if (!ok) { allApplied = false; break }
    } catch (err: any) {
      results[i]!.status = 'failed'
      results[i]!.error = (err?.data?.error?.message || err?.message || 'write failed').slice(0, 300)
      allApplied = false
      break
    }
  }
  return { allApplied, results }
}
