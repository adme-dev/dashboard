import {
  matchMondayCampaignToSpend,
  type CampaignLinkJob,
  type CampaignLinkResult,
  type CampaignSpendCandidate
} from '~~/server/utils/mondayCampaignPerformance'

export interface CampaignPerformanceState {
  jobs: CampaignLinkJob[]
  candidates: CampaignSpendCandidate[]
  unmappedMondayItemIds: string[]
}

export interface CampaignPerformanceReconcileDependencies {
  loadState: () => Promise<CampaignPerformanceState>
  writeMondayCampaignId: (job: CampaignLinkJob, campaignId: string) => Promise<void>
  persistMatch: (
    job: CampaignLinkJob,
    match: Extract<CampaignLinkResult, { status: 'matched' }>
  ) => Promise<void>
}

export interface CampaignPerformanceJobResult {
  mondayItemId: string
  taskId: string
  title: string
  status: 'matched' | 'pending' | 'ambiguous'
  campaignId?: string
  mediaSpendId?: string
  evidence?: 'explicit_campaign_id' | 'unique_name_match'
  reason?: string
  mondayWriteBack?: 'not_needed' | 'skipped' | 'written' | 'failed'
}

export interface CampaignPerformanceReconcileResult {
  mode: 'dry-run' | 'apply'
  total: number
  matched: number
  pending: number
  ambiguous: number
  writtenBack: number
  writeBackSkipped: number
  writeBackFailed: number
  persisted: number
  unmappedMondayItemIds: string[]
  jobs: CampaignPerformanceJobResult[]
}

export async function reconcileMondayCampaignPerformance(
  input: { apply: boolean, writeBackMonday?: boolean },
  dependencies: CampaignPerformanceReconcileDependencies
): Promise<CampaignPerformanceReconcileResult> {
  const state = await dependencies.loadState()
  const evaluated = state.jobs.map(job => ({
    job,
    match: matchMondayCampaignToSpend(job, state.candidates)
  }))

  const claims = new Map<string, number>()
  for (const result of evaluated) {
    if (result.match.status !== 'matched') continue
    claims.set(result.match.mediaSpendId, (claims.get(result.match.mediaSpendId) || 0) + 1)
  }

  let writtenBack = 0
  let writeBackSkipped = 0
  let writeBackFailed = 0
  let persisted = 0
  const jobs: CampaignPerformanceJobResult[] = []

  for (const result of evaluated) {
    const { job, match } = result
    if (match.status === 'matched' && claims.get(match.mediaSpendId)! > 1) {
      jobs.push({
        mondayItemId: job.mondayItemId,
        taskId: job.taskId,
        title: job.title,
        status: 'ambiguous',
        reason: 'candidate_claimed_by_multiple_jobs'
      })
      continue
    }

    if (match.status !== 'matched') {
      jobs.push({
        mondayItemId: job.mondayItemId,
        taskId: job.taskId,
        title: job.title,
        status: match.status,
        reason: match.reason
      })
      continue
    }

    if (input.apply) {
      await dependencies.persistMatch(job, match)
      persisted++
    }

    let mondayWriteBack: CampaignPerformanceJobResult['mondayWriteBack'] = 'not_needed'
    if (!job.campaignId) {
      if (!input.apply || !input.writeBackMonday) {
        mondayWriteBack = 'skipped'
        if (input.apply) writeBackSkipped++
      } else {
        try {
          await dependencies.writeMondayCampaignId(job, match.campaignId)
          writtenBack++
          mondayWriteBack = 'written'
        } catch {
          writeBackFailed++
          mondayWriteBack = 'failed'
        }
      }
    }

    jobs.push({
      mondayItemId: job.mondayItemId,
      taskId: job.taskId,
      title: job.title,
      status: 'matched',
      campaignId: match.campaignId,
      mediaSpendId: match.mediaSpendId,
      evidence: match.evidence,
      mondayWriteBack
    })
  }

  return {
    mode: input.apply ? 'apply' : 'dry-run',
    total: state.jobs.length,
    matched: jobs.filter(job => job.status === 'matched').length,
    pending: jobs.filter(job => job.status === 'pending').length,
    ambiguous: jobs.filter(job => job.status === 'ambiguous').length,
    writtenBack,
    writeBackSkipped,
    writeBackFailed,
    persisted,
    unmappedMondayItemIds: state.unmappedMondayItemIds,
    jobs
  }
}
