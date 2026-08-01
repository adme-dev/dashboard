import type { SpendSyncJobStatus } from '~/types'

export interface SpendSyncFailureGroup {
  reason: string
  accounts: string[]
}

export interface SpendSyncWarning {
  title: string
  summary: string
  completedAccounts: number
  failedAccounts: number
  totalAccounts: number
  finishedAt: string | null
  groups: SpendSyncFailureGroup[]
}

export function buildSpendSyncWarning(
  job: SpendSyncJobStatus | null,
  platformName: string,
): SpendSyncWarning | null {
  if (!job || job.status === 'running') return null

  const groups = new Map<string, Set<string>>()
  const failedAccounts = new Set<string>()

  for (const failure of job.failures || []) {
    const account = failure.account || 'Unknown account'
    const reason = failure.reason || 'Unknown provider error'
    failedAccounts.add(account)

    if (!groups.has(reason)) groups.set(reason, new Set())
    groups.get(reason)!.add(account)
  }

  if (failedAccounts.size === 0 && job.status !== 'failed') return null

  const totalAccounts = Math.max(0, Number(job.totalAccounts ?? job.processedAccounts ?? 0))
  const processedAccounts = Math.max(0, Number(job.processedAccounts || totalAccounts))
  const completedAccounts = Math.max(0, processedAccounts - failedAccounts.size)
  const grouped = [...groups.entries()]
    .map(([reason, accounts]) => ({
      reason,
      accounts: [...accounts].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.reason.localeCompare(b.reason))

  const failed = failedAccounts.size
  return {
    title: job.status === 'failed' ? `${platformName} sync failed` : `Partial ${platformName} data`,
    summary: job.status === 'failed' && failed === 0
      ? (job.error || 'The latest sync failed before account results were available.')
      : `${completedAccounts} of ${totalAccounts} accounts synced. Figures may be incomplete or stale for ${failed} account${failed === 1 ? '' : 's'}.`,
    completedAccounts,
    failedAccounts: failed,
    totalAccounts,
    finishedAt: job.finishedAt,
    groups: grouped,
  }
}
