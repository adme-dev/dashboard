import { storyboardFixture } from '../video/fixtures/storyboard'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { describe, expect, it, vi } from 'vitest'
import { useVideoStoryboard } from '~~/app/composables/useVideoStoryboard'
import { getStoryboardExamples, validateStoryboardExample } from '~~/app/utils/video/storyboardExamples'

describe('storyboard examples and draft isolation', () => {
  it('previews without changing the draft and prefill makes zero requests', () => {
    const fetch = vi.fn()
    const c = useVideoStoryboard('project', { fetch, enabled: () => true })
    c.draft.value.brief = 'Existing work'
    c.previewExample(c.examples[0]!.id)
    expect(c.draft.value.brief).toBe('Existing work')
    c.prefillExample()
    expect(c.draft.value.brief).toContain('Sample direction')
    expect(c.draft.value.copy).toEqual({ scriptSegments: [], cues: [] })
    expect(c.draft.value.shots).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
    expect(c.candidate.value).toBe(null)
  })
  it('rejects stale evidence, injected media and cross-client examples', () => {
    const example = getStoryboardExamples()[0]!
    expect(validateStoryboardExample(example, 'client')).toBe(true)
    expect(validateStoryboardExample({ ...example, evaluationRevision: 0 }, 'client')).toBe(false)
    expect(validateStoryboardExample({ ...example, assets: ['foreign'] }, 'client')).toBe(false)
    expect(validateStoryboardExample({ ...example, clientId: 'other' }, 'client')).toBe(false)
  })
  it('invalidates evaluated acceptance after refresh, preserving draft until new candidate acceptance', async () => {
    const planA = storyboardFixture()
    const planB = storyboardFixture()
    planB.copy.cues[0]!.text = 'New approved copy'
    const revisionA = { id: 'revision-a', plan: planA }
    const revisionB = { id: 'revision-b', plan: planB }
    const referenceSet = { id: 'references', references: [] }
    const fetch = vi.fn()
      .mockResolvedValueOnce({ revision: revisionA, referenceSet, readiness: [] })
      .mockResolvedValueOnce({ ok: true, findings: [] })
      .mockResolvedValueOnce({ revision: revisionB, referenceSet, readiness: [] })
    const editor = { begin: vi.fn(async () => ({ beforeState: emptyAvTimeline(), expectedTimelineId: 'timeline', expectedEditRevision: 1 })), adopt: vi.fn(), release: vi.fn() }
    const c = useVideoStoryboard('project', { fetch, editor, enabled: () => true })
    await c.load()
    expect(c.draftChanged.value).toBe(false)
    await c.resolve()
    const localDraft = JSON.stringify(c.draft.value)
    await c.refresh()
    expect(JSON.stringify(c.draft.value)).toBe(localDraft)
    expect(c.revision.value!.id).toBe('revision-b')
    expect(c.draftChanged.value).toBe(true)
    await c.resolve()
    expect(c.error.value).toContain('Accept the current draft')
    await c.apply(false)
    expect(c.error.value).toContain('Accept the draft')
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(editor.begin).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce({ id: 'candidate', candidateHash: 'hash', plan: planA, findings: [], diff: {} })
      .mockResolvedValueOnce({ revision: { id: 'revision-c', plan: planA } })
      .mockResolvedValueOnce({ ok: true, findings: [] })
    await c.planDraft('manual')
    await c.acceptCandidate(false)
    expect(c.draftChanged.value).toBe(false)
    await c.resolve()
    expect(c.resolution.value?.ok).toBe(true)
  })
  it('disabled actions preserve draft and do not send a request', async () => {
    const fetch = vi.fn()
    const c = useVideoStoryboard('project', { fetch, enabled: () => false })
    c.draft.value.brief = 'Keep this'
    await c.planDraft('ai')
    expect(c.error.value).toContain('not enabled')
    expect(c.draft.value.brief).toBe('Keep this')
    expect(fetch).not.toHaveBeenCalled()
  })
})
