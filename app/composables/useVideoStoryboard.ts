import { computed, ref } from 'vue'
import type { StoryboardPlan, StoryboardShot, ReadinessFinding, CopyRevision } from '~~/shared/video/storyboard'
import type { ReferenceSetWrite, StoryboardReferenceSet } from '~~/shared/video/storyboardReferences'
import type { StoryboardRecipeValues, VideoProducerTargetFormat } from '~~/shared/video/storyboardRecipes'
import type { StoryboardRevision } from '~~/server/utils/video-storyboard/store'
import type { StoryboardApplicationReceipt } from '~~/server/utils/video-storyboard/apply'
import { apiErrorDescription } from '~~/app/utils/apiError'
import { createStoryboardApplication } from '~~/app/utils/video/storyboardApplication'
import { getStoryboardExamples, validateStoryboardExample, type StoryboardExample } from '~~/app/utils/video/storyboardExamples'

export interface StoryboardDraft {
  brief: string
  inputMode: 'idea' | 'approved_script'
  durationSeconds: number
  targetFormat: VideoProducerTargetFormat
  copy: Pick<CopyRevision, 'scriptSegments' | 'cues'>
  shots: StoryboardShot[]
  recipe?: { id: string, version: number, values: Partial<StoryboardRecipeValues> }
}
export interface StoryboardCandidate { id: string, candidateHash: string, plan: StoryboardPlan, findings: ReadinessFinding[], diff: Record<string, unknown> }
interface Saved { application?: StoryboardApplicationReceipt | null, revision: StoryboardRevision | null, referenceSet: StoryboardReferenceSet | null, readiness: ReadinessFinding[] }
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export function useVideoStoryboard(projectId: string, options: {
  enabled?: () => boolean
  clientId?: () => string | null
  editor?: Parameters<typeof createStoryboardApplication>[1]
  fetch?: <T>(url: string, options?: { method?: string, body?: unknown }) => Promise<T>
} = {}) {
  const api = (options.fetch ?? $fetch) as <T>(url: string, options?: { method?: string, body?: unknown }) => Promise<T>
  const base = `/api/agency/video/projects/${projectId}/storyboard`
  const lastApplication = ref<StoryboardApplicationReceipt | null>(null)
  const revision = ref<StoryboardRevision | null>(null)
  const referenceSet = ref<StoryboardReferenceSet | null>(null)
  const candidate = ref<StoryboardCandidate | null>(null)
  const findings = ref<ReadinessFinding[]>([])
  const resolution = ref<{ ok: boolean, findings: ReadinessFinding[], timeline?: unknown } | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingOperation = ref<string | null>(null)
  const draft = ref<StoryboardDraft>({ brief: '', inputMode: 'idea', durationSeconds: 30, targetFormat: 'reels_9x16', copy: { scriptSegments: [], cues: [] }, shots: [] })
  const examples = getStoryboardExamples()
  const examplePreview = ref<StoryboardExample | null>(null)
  const plan = computed(() => revision.value?.plan ?? null)
  const acceptedDraft = ref('')
  const draftChanged = computed(() => JSON.stringify(draft.value) !== acceptedDraft.value)
  const application = options.editor
    ? createStoryboardApplication(projectId, options.editor, {
        apply: body => api<StoryboardApplicationReceipt>(`${base}/apply`, { method: 'POST', body }),
        recover: id => api<StoryboardApplicationReceipt | null>(`${base}/applications/${id}`)
      }, undefined, typeof window === 'undefined'
        ? undefined
        : {
            read: () => sessionStorage.getItem(`storyboard-application:${projectId}`),
            write: value => value === null ? sessionStorage.removeItem(`storyboard-application:${projectId}`) : sessionStorage.setItem(`storyboard-application:${projectId}`, value)
          })
    : null
  pendingOperation.value = application?.pendingOperation() ?? null
  function ensureEnabled() {
    if (options.enabled && !options.enabled()) throw new Error('Storyboard editing is not enabled. Saved work remains available.')
    if (pendingOperation.value) throw new Error('Recover the pending application before editing the storyboard.')
  }
  async function run<T>(action: () => Promise<T>) {
    if (loading.value) return
    loading.value = true
    error.value = null
    try {
      return await action()
    } catch (e) {
      error.value = apiErrorDescription(e, 'The action failed. Your local draft is preserved.')
      return undefined
    } finally {
      loading.value = false
      pendingOperation.value = application?.pendingOperation() ?? null
    }
  }
  function draftFromPlan(value: StoryboardPlan) {
    draft.value = { ...draft.value, inputMode: value.inputMode, durationSeconds: value.durationFrames / value.fps,
      targetFormat: value.targetFormat, copy: copy({ scriptSegments: value.copy.scriptSegments, cues: value.copy.cues }), shots: copy(value.shots),
      recipe: value.recipe ? { id: value.recipe.id, version: value.recipe.version, values: copy(value.recipe.resolvedValues) } : undefined }
    acceptedDraft.value = JSON.stringify(draft.value)
  }
  let loaded = false
  async function load() {
    return run(async () => {
      if (loaded) return
      const saved = await api<Saved>(base)
      loaded = true
      lastApplication.value = saved.application ?? null
      revision.value = saved.revision
      referenceSet.value = saved.referenceSet
      findings.value = saved.readiness
      if (saved.revision) draftFromPlan(saved.revision.plan)
      else acceptedDraft.value = JSON.stringify(draft.value)
    })
  }
  async function refresh() {
    return run(async () => {
      const saved = await api<Saved>(base)
      lastApplication.value = saved.application ?? null
      revision.value = saved.revision
      referenceSet.value = saved.referenceSet
      findings.value = saved.readiness
      candidate.value = null
      resolution.value = null
      // A refreshed base never silently makes the local draft an accepted revision.
      acceptedDraft.value = ''
      loaded = true
    })
  }
  async function saveReferences(references: ReferenceSetWrite['references'], brandKit: ReferenceSetWrite['brandKit'] = referenceSet.value?.brandKit ? { id: referenceSet.value.brandKit.id, expectedContentHash: referenceSet.value.brandKit.contentHash } : null) {
    return run(async () => {
      ensureEnabled()
      const result = await api<{ referenceSet: StoryboardReferenceSet }>(`${base}/references`, { method: 'PUT', body: {
        operationId: crypto.randomUUID(), expectedRevision: referenceSet.value?.id ?? null, references, brandKit
      } })
      referenceSet.value = result.referenceSet
      candidate.value = null
      resolution.value = null
    })
  }
  async function planDraft(method: 'ai' | 'manual') {
    return run(async () => {
      ensureEnabled()
      // Empty reference selection is an explicit saved set, never an implicit approved set.
      if (!referenceSet.value) {
        const result = await api<{ referenceSet: StoryboardReferenceSet }>(`${base}/references`, { method: 'PUT', body: {
          operationId: crypto.randomUUID(), expectedRevision: null, references: [], brandKit: null
        } })
        referenceSet.value = result.referenceSet
      }
      const current = copy(draft.value)
      const body = { operationId: crypto.randomUUID(), expectedRevision: revision.value?.id ?? null,
        expectedReferenceSetRevisionId: referenceSet.value!.id, method, inputMode: current.inputMode,
        durationSeconds: current.durationSeconds, targetFormat: current.targetFormat, copy: current.copy,
        assets: referenceSet.value!.references.map(ref => ({ sourceKind: ref.sourceKind, assetId: ref.assetId })),
        ...(current.recipe ? { recipe: { ...current.recipe, values: { ...current.recipe.values, durationSeconds: current.durationSeconds, targetFormat: current.targetFormat } } } : {}), ...(method === 'ai' ? { brief: current.brief } : { shots: current.shots }) }
      candidate.value = await api<StoryboardCandidate>(`${base}/plan`, { method: 'POST', body })
      candidateDraft = JSON.stringify(draft.value)
      findings.value = candidate.value!.findings
      resolution.value = null
    })
  }
  let candidateDraft = ''
  async function acceptCandidate(approveCopy: boolean) {
    return run(async () => {
      ensureEnabled()
      if (!candidate.value || candidateDraft !== JSON.stringify(draft.value)) throw new Error('Draft changed. Prepare a new candidate before acceptance.')
      const result = await api<{ revision: StoryboardRevision }>(`${base}/revisions`, { method: 'POST', body: {
        operationId: crypto.randomUUID(), expectedRevision: revision.value?.id ?? null, candidateId: candidate.value.id,
        candidateHash: candidate.value.candidateHash, acceptChanges: true, approveCopy
      } })
      revision.value = result.revision
      draftFromPlan(result.revision.plan)
      candidate.value = null
      resolution.value = null
    })
  }
  async function resolve() {
    return run(async () => {
      ensureEnabled()
      if (!revision.value || draftChanged.value) throw new Error('Accept the current draft before checking media.')
      resolution.value = await api<{ ok: boolean, findings: ReadinessFinding[], timeline?: unknown }>(`${base}/resolve`, { method: 'POST', body: { revisionId: revision.value.id, formats: [revision.value.plan.targetFormat] } })
      findings.value = resolution.value!.findings
    })
  }
  async function apply(replaceConfirmed: boolean) {
    return run(async () => {
      if (!application || !revision.value) throw new Error('Open the project editor before applying.')
      if (!pendingOperation.value) {
        ensureEnabled()
        if (draftChanged.value || !resolution.value?.ok) throw new Error('Accept the draft and resolve its media before applying.')
      }
      return application.apply(revision.value.id, replaceConfirmed)
    })
  }
  async function retry() {
    return run(async () => application?.retry())
  }
  async function recover() {
    return run(async () => {
      const receipt = await application?.recover()
      if (!receipt && application?.pendingOperation()) throw new Error('No committed receipt yet. Retry the same application; editing remains paused.')
      return receipt
    })
  }
  function previewExample(id: string) {
    const example = examples.find(value => value.id === id)
    if (!example || !validateStoryboardExample(example, options.clientId?.() ?? null)) {
      error.value = 'This example is inaccessible or its evidence is stale.'
      return
    }
    examplePreview.value = copy(example)
  }
  function prefillExample() {
    ensureEnabled()
    const example = examplePreview.value
    if (!example || !validateStoryboardExample(example, options.clientId?.() ?? null)) {
      error.value = 'Review a current example first.'
      return
    }
    draft.value = { brief: example.brief, inputMode: 'idea', durationSeconds: example.durationSeconds, targetFormat: example.targetFormat,
      copy: { scriptSegments: [], cues: [] }, shots: [], recipe: { id: example.recipeId, version: example.recipeVersion, values: { durationSeconds: example.durationSeconds, targetFormat: example.targetFormat } } }
    candidate.value = null
    resolution.value = null
    examplePreview.value = null
  }
  return { draft, plan, revision, lastApplication, referenceSet, candidate, findings, resolution, loading, error, pendingOperation, draftChanged,
    examples, examplePreview, load, refresh, saveReferences, planDraft, acceptCandidate, resolve, apply, retry, recover, previewExample, prefillExample }
}
