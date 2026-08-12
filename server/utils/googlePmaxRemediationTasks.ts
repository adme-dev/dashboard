import type { GooglePmaxOnboardingTask } from '~~/server/utils/googlePmaxOnboarding'
import type { GooglePmaxPreflightCheck } from '~~/server/utils/googlePmaxPreflight'

export interface GooglePmaxRemediationTaskDraft {
  taskKey: string
  sourceCode: string
  title: string
  description: string
  severity: 'blocker' | 'advisory'
  execution: 'automatable' | 'assisted' | 'human'
  owner: 'platform' | 'google_admin' | 'client'
}

function bounded(value: string, maximum: number): string {
  const normalized = value.trim()
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`
}

function preflightDraft(check: GooglePmaxPreflightCheck): GooglePmaxRemediationTaskDraft | null {
  if (check.status === 'pass') return null
  if (!/^PMAX_[A-Z0-9_]{1,94}$/.test(check.code)) {
    throw new Error('PMax preflight task code is invalid.')
  }
  const severity = check.status === 'fail' ? 'blocker' : 'advisory'
  const label = severity === 'blocker' ? 'blocker' : 'warning'
  return {
    taskKey: `preflight:${check.code}`,
    sourceCode: check.code,
    title: bounded(`Resolve Google PMax ${label}: ${check.message}`, 255),
    description: bounded(check.remediation || check.message, 2_000),
    severity,
    execution: 'assisted',
    owner: 'platform'
  }
}

function onboardingDraft(task: GooglePmaxOnboardingTask): GooglePmaxRemediationTaskDraft {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task.key)) {
    throw new Error('PMax onboarding task key is invalid.')
  }
  return {
    taskKey: `onboarding:${task.key}`,
    sourceCode: task.key,
    title: bounded(task.title, 255),
    description: bounded(`Complete the governed Google onboarding requirement: ${task.title}.`, 2_000),
    severity: 'blocker',
    execution: task.execution,
    owner: task.owner
  }
}

export function buildGooglePmaxRemediationTaskDrafts(input: {
  preflightChecks: GooglePmaxPreflightCheck[]
  onboardingTasks: GooglePmaxOnboardingTask[]
}): GooglePmaxRemediationTaskDraft[] {
  const drafts = [
    ...input.preflightChecks.map(preflightDraft).filter((item): item is GooglePmaxRemediationTaskDraft => item !== null),
    ...input.onboardingTasks.map(onboardingDraft)
  ]
  const byKey = new Map<string, GooglePmaxRemediationTaskDraft>()
  for (const draft of drafts) {
    const existing = byKey.get(draft.taskKey)
    if (existing && JSON.stringify(existing) !== JSON.stringify(draft)) {
      throw new Error(`PMax remediation task ${draft.taskKey} has conflicting evidence.`)
    }
    byKey.set(draft.taskKey, draft)
  }
  return [...byKey.values()].sort((left, right) => left.taskKey < right.taskKey ? -1 : left.taskKey > right.taskKey ? 1 : 0)
}
