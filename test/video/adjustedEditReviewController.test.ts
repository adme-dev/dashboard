// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useVideoAdjustedEditReview } from '~~/app/composables/useVideoAdjustedEditReview'

const snapshot = { timelineId: 'timeline', editRevision: 2, obligations: { cues: [], sources: [] }, findings: [], changes: [{ clipId: 'clip', reasons: ['timing'] }], review: null }
afterEach(() => vi.unstubAllGlobals())
describe('adjusted review ownership', () => {
  it('awaits save drain and preserves the cut without adopting a new timeline', async () => {
    let drain!: (value: { expectedTimelineId: string, expectedEditRevision: number }) => void
    const begin = vi.fn(() => new Promise<{ expectedTimelineId: string, expectedEditRevision: number }>((resolve) => {
      drain = resolve
    }))
    const release = vi.fn()
    const fetch = vi.fn().mockResolvedValue(snapshot)
    vi.stubGlobal('$fetch', fetch)
    const controller = useVideoAdjustedEditReview('project', { begin, release })
    const load = controller.load()
    expect(fetch).not.toHaveBeenCalled()
    drain({ expectedTimelineId: 'timeline', expectedEditRevision: 2 })
    await load
    expect(release).toHaveBeenCalledOnce()
    expect(controller.snapshot.value).toEqual(snapshot)
  })
  it('rejects edits made after the displayed review before POST and releases lock', async () => {
    const begin = vi.fn().mockResolvedValue({ expectedTimelineId: 'timeline', expectedEditRevision: 2 })
    const release = vi.fn()
    const fetch = vi.fn().mockResolvedValue(snapshot)
    vi.stubGlobal('$fetch', fetch)
    const controller = useVideoAdjustedEditReview('project', { begin, release })
    await controller.load()
    begin.mockResolvedValue({ expectedTimelineId: 'timeline', expectedEditRevision: 3 })
    await controller.accept({ obligationMappings: [] })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(controller.error.value).toContain('changed')
    expect(controller.snapshot.value).toBeNull()
    expect(release).toHaveBeenCalledTimes(2)
  })
  it('retries an ambiguous acceptance with exactly the original operation and content', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ timelineId: 'timeline', editRevision: 2, review: { id: 'review', createdAt: 'now' }, findings: [] })
    vi.stubGlobal('$fetch', fetch)
    const controller = useVideoAdjustedEditReview('project', { begin: vi.fn().mockResolvedValue({ expectedTimelineId: 'timeline', expectedEditRevision: 2, beforeState: { tracks: ['must not send'] } }), release: vi.fn() })
    await controller.load()
    await controller.accept({ obligationMappings: [] })
    expect(controller.uncertain.value).toBe(true)
    await controller.accept({ obligationMappings: [{ clipId: 'x', replacementClipId: 'y' }] })
    expect(fetch).toHaveBeenCalledTimes(2)
    await controller.retry()
    expect(fetch.mock.calls[2][1].body).toEqual(fetch.mock.calls[1][1].body)
    expect(fetch.mock.calls[2][1].body).not.toHaveProperty('beforeState')
    expect(controller.snapshot.value?.review?.id).toBe('review')
  })
})

it('allows correcting a rejected mapping with a fresh operation and surfaces server findings', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce({ statusCode: 409, data: { data: { findings: [{ code: 'copy_mismatch', severity: 'blocker', message: 'Required copy differs.' }] } } }).mockResolvedValueOnce({ timelineId: 'timeline', editRevision: 2, review: { id: 'review', createdAt: 'now' }, findings: [] })
  vi.stubGlobal('$fetch', fetch)
  const controller = useVideoAdjustedEditReview('project', { begin: vi.fn().mockResolvedValue({ expectedTimelineId: 'timeline', expectedEditRevision: 2 }), release: vi.fn() })
  await controller.load()
  await controller.accept({ obligationMappings: [] })
  expect(controller.uncertain.value).toBe(false)
  expect(controller.snapshot.value?.findings[0]?.code).toBe('copy_mismatch')
  await controller.accept({ obligationMappings: [{ clipId: 'clip', replacementClipId: 'fixed' }] })
  expect(fetch.mock.calls[2][1].body.operationId).not.toBe(fetch.mock.calls[1][1].body.operationId)
  expect(fetch.mock.calls[2][1].body.obligationMappings[0].replacementClipId).toBe('fixed')
})

it('does not mistake an older review for confirmation of an uncertain operation', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(snapshot).mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({ ...snapshot, review: { id: 'older', operationId: 'different', createdAt: 'then' } })
  vi.stubGlobal('$fetch', fetch)
  const controller = useVideoAdjustedEditReview('project', { begin: vi.fn().mockResolvedValue({ expectedTimelineId: 'timeline', expectedEditRevision: 2 }), release: vi.fn() })
  await controller.load()
  await controller.accept({ obligationMappings: [] })
  await controller.load()
  expect(controller.uncertain.value).toBe(true)
})
