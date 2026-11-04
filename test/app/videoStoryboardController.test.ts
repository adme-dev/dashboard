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
