import { ref } from 'vue'
import type { StoryboardObligations } from '~~/shared/video/storyboardCompile'
import type { ReadinessFinding } from '~~/shared/video/storyboard'

export interface AdjustedEditSnapshot {
  timelineId: string
  editRevision: number
  obligations: StoryboardObligations | null
  findings: ReadinessFinding[]
  changes: Array<{ clipId: string, reasons: string[] }>
  review: { id: string, createdAt: string, operationId: string } | null
  copy?: { contentHash: string, scriptSegments: Array<{ id: string, text: string }>, cues: Array<{ id: string, text: string, required: boolean }> } | null
  references?: Array<{ sourceKind: 'video_asset' | 'audio_asset' | 'source_asset' | 'banner_project', assetId: string, contentHash: string, decision: 'approved' | 'pending', clipIds: string[] }>
}
export interface AdjustedEditAcceptance {
  obligationMappings: Array<{ clipId: string, replacementClipId: string }>
  copyRevisionId?: string
  copyApproval?: { expectedCopyHash: string, scriptSegments: Array<{ id: string, text: string }>, cues: Array<{ id: string, text: string, required: boolean }> }
  referenceApproval?: Array<{ sourceKind: 'video_asset' | 'audio_asset' | 'source_asset' | 'banner_project', assetId: string, expectedContentHash: string, evidence: string }>
}
interface Revision { expectedTimelineId: string, expectedEditRevision: number }
export function useVideoAdjustedEditReview(projectId: string, editor: {
  begin: () => Promise<Revision>
  release: () => void
}) {
  const snapshot = ref<AdjustedEditSnapshot | null>(null)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const uncertain = ref(false)
  let retryBody: (AdjustedEditAcceptance & Revision & { operationId: string }) | null = null
  const url = `/api/agency/video/projects/${projectId}/storyboard/timeline-review`
  const matches = (token: Revision) => snapshot.value?.timelineId === token.expectedTimelineId && snapshot.value.editRevision === token.expectedEditRevision
  async function run(action: (token: Revision) => Promise<void>) {
    if (pending.value) return
    pending.value = true
    error.value = null
    let held = false
    try {
      const token = await editor.begin()
      held = true
      await action({ expectedTimelineId: token.expectedTimelineId, expectedEditRevision: token.expectedEditRevision })
    } catch (cause: unknown) {
      const status = (cause as { statusCode?: number, status?: number })?.statusCode ?? (cause as { status?: number })?.status
      const findings = (cause as { data?: { data?: { findings?: ReadinessFinding[] }, findings?: ReadinessFinding[] } }).data
      const returnedFindings = findings?.data?.findings ?? findings?.findings
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        retryBody = null
        uncertain.value = false
        if (status === 409 && !Array.isArray(returnedFindings)) snapshot.value = null
        if (snapshot.value && Array.isArray(returnedFindings)) snapshot.value = { ...snapshot.value, findings: returnedFindings }
      }
      error.value = Array.isArray(returnedFindings)
        ? 'Correct the findings below, then review the edit again.'
        : status === 409
          ? 'The saved edit changed. Your local cut is preserved. Refresh review before accepting again.'
          : 'Review could not be confirmed. Your cut is preserved. Refresh review to check its saved status.'
    } finally {
      if (held) editor.release()
      pending.value = false
    }
  }
  async function load() {
    await run(async (token) => {
      const result = await $fetch<AdjustedEditSnapshot>(url)
      if (result.timelineId !== token.expectedTimelineId || result.editRevision !== token.expectedEditRevision) throw { statusCode: 409 }
      snapshot.value = result
      // A successful GET establishes current status. Never automatically accept it.
      if (result.review && (!retryBody || result.review.operationId === retryBody.operationId)) {
        retryBody = null
        uncertain.value = false
      }
    })
  }
  function acceptance(body: AdjustedEditAcceptance): AdjustedEditAcceptance {
    return { obligationMappings: body.obligationMappings, ...(body.copyRevisionId ? { copyRevisionId: body.copyRevisionId } : {}), ...(body.copyApproval ? { copyApproval: body.copyApproval } : {}), ...(body.referenceApproval ? { referenceApproval: body.referenceApproval } : {}) }
  }
  async function accept(input: AdjustedEditAcceptance) {
    await run(async (token) => {
      if (!matches(token)) {
        snapshot.value = null
        retryBody = null
        uncertain.value = false
        throw { statusCode: 409 }
      }
      if (retryBody && JSON.stringify(acceptance(retryBody)) !== JSON.stringify(acceptance(input))) {
        throw new Error('Recover the previous acceptance before changing its selections')
      }
      const body = retryBody ?? JSON.parse(JSON.stringify({ ...input, ...token, operationId: crypto.randomUUID() })) as NonNullable<typeof retryBody>
      if (body.expectedTimelineId !== token.expectedTimelineId || body.expectedEditRevision !== token.expectedEditRevision) throw { statusCode: 409 }
      retryBody = body
      uncertain.value = true
      const result = await $fetch<{ timelineId: string, editRevision: number, review: AdjustedEditSnapshot['review'], findings: ReadinessFinding[] }>(url, { method: 'POST', body })
      if (snapshot.value) snapshot.value = { ...snapshot.value, ...result, changes: [] }
      retryBody = null
      uncertain.value = false
    })
  }
  async function retry() {
    if (!retryBody) return
    await accept(acceptance(retryBody))
  }
  function invalidate() {
    snapshot.value = null
  }
  return { snapshot, pending, error, uncertain, load, accept, retry, invalidate }
}
