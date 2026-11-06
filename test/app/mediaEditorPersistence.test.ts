import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { useMediaProjectEditor } from '~~/app/composables/useMediaProjectEditor'

const hooks = vi.hoisted(() => ({ mounted: [] as Array<() => void>, unmount: [] as Array<() => void> }))
vi.mock('vue', async original => ({ ...await original<typeof import('vue')>(), onMounted: (fn: () => void) => hooks.mounted.push(fn), onBeforeUnmount: (fn: () => void) => hooks.unmount.push(fn) }))
vi.mock('~~/app/utils/audio/audioContextFactory', () => ({ createBrowserAudioContext: () => ({}), browserSetTimer: vi.fn(), makeR2Resolver: vi.fn() }))
vi.mock('~~/app/composables/useAudioEngine', () => ({ createAudioEngine: () => ({ load: async () => ({ missingClipIds: [] }), duration: () => 0, currentTime: () => 0, dispose: vi.fn(), isPlaying: () => false, pause: vi.fn(), seek: vi.fn() }) }))

const state = emptyAvTimeline()
const request = vi.fn()
const project = { id: 'p1', createdBy: 'u1', currentTimelineId: 't1', mediaType: 'av', status: 'draft' }
let saved = { id: 't1', editRevision: 0, state }
function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function editor() {
  const instance = useMediaProjectEditor('p1')
  hooks.mounted.forEach(fn => fn())
  await vi.waitFor(() => expect(instance.status.value).toBe('ready'))
  return instance
}
beforeEach(() => {
  hooks.unmount.forEach(fn => fn())
  hooks.mounted = []
  hooks.unmount = []
  saved = { id: 't1', editRevision: 0, state }
  request.mockReset().mockImplementation(async (url: string) => url.endsWith('clip-sources') ? { sources: {} } : { project, timeline: saved })
  vi.stubGlobal('$fetch', request)
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  hooks.unmount.forEach(fn => fn())
})

describe('editor revision persistence integration', () => {
  it('serializes overlapping saves, preserves edits in flight and advances the token', async () => {
    const e = await editor()
    const first = pending<{ timeline: typeof saved }>()
    const second = pending<{ timeline: typeof saved }>()
    request.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    e.restoreVersion({ ...state, width: 1920 })
    const a = e.saveNow()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3))
    e.restoreVersion({ ...state, width: 720 })
    const b = e.saveNow()
    await Promise.resolve()
    expect(request).toHaveBeenCalledTimes(3)
    first.resolve({ timeline: { ...saved, editRevision: 1 } })
    await a
    expect(e.dirty.value).toBe(true)
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    expect(request.mock.calls[3][1].body).toMatchObject({ expectedTimelineId: 't1', expectedEditRevision: 1, state: { width: 720 } })
    second.resolve({ timeline: { ...saved, editRevision: 2 } })
    await b
    expect(e.dirty.value).toBe(false)
  })

  it('keeps local edits and stops automatic retries after a conflict until explicit reload', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 720 })
    request.mockRejectedValueOnce({ statusCode: 409, statusMessage: 'Timeline changed' })
    await expect(e.saveNow()).rejects.toThrow()
    expect(e.dirty.value).toBe(true)
    expect(e.timeline.value?.width).toBe(720)
    expect(e.saveConflict.value).toBe(true)
    const count = request.mock.calls.length
    await expect(e.saveNow()).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(count)
    saved = { id: 't2', editRevision: 4, state: { ...state, width: 1440 } }
    await e.reloadSavedTimeline()
    expect(e.timeline.value?.width).toBe(1440)
    expect(e.saveConflict.value).toBe(false)
    expect(e.dirty.value).toBe(false)
  })

  it('adopts the new version token before a later autosave', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 720 })
    request.mockResolvedValueOnce({ timeline: { ...saved, editRevision: 1 } })
    const version = pending<{ timeline: typeof saved }>()
    request.mockImplementationOnce(() => version.promise)
    const a = e.saveVersion('Cut A')
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    e.restoreVersion({ ...state, width: 1440 })
    request.mockResolvedValueOnce({ timeline: { ...saved, id: 't2', editRevision: 1 } })
    const b = e.saveNow()
    version.resolve({ timeline: { ...saved, id: 't2', editRevision: 0 } })
    await Promise.all([a, b])
    expect(request.mock.calls[4][1].body).toMatchObject({ expectedTimelineId: 't2', expectedEditRevision: 0, state: { width: 1440 } })
  })
  it('stops queued work after a conflict without submitting a second request', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 720 })
    request.mockRejectedValueOnce({ statusCode: 409 })
    const results = await Promise.allSettled([e.saveNow(), e.saveNow(), e.saveVersion('Late')])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(request).toHaveBeenCalledTimes(3)
    expect(e.timeline.value?.width).toBe(720)
  })

  it('flushes before rendering and surfaces a render revision conflict', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 720 })
    request.mockResolvedValueOnce({ timeline: { ...saved, editRevision: 1 } })
    request.mockRejectedValueOnce({ statusCode: 409 })
    expect(await e.renderVideoAction()).toMatchObject({ ok: false })
    expect(request.mock.calls[3][1].body).toMatchObject({ expectedEditRevision: 1 })
    expect(e.saveConflict.value).toBe(true)
    expect(e.saveStatus.value).toBe('error')
    expect(e.timeline.value?.width).toBe(720)
  })

  it('keeps edits made while an explicit reload is in flight', async () => {
    const e = await editor()
    const response = pending<{ project: typeof project, timeline: typeof saved }>()
    request.mockImplementationOnce(() => response.promise)
    const reload = e.reloadSavedTimeline()
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4))
    e.restoreVersion({ ...state, width: 720 })
    response.resolve({ project, timeline: saved })
    await expect(reload).rejects.toThrow('You edited while reloading')
    expect(e.timeline.value?.width).toBe(720)
    expect(e.dirty.value).toBe(true)
  })

  it('blocks autosave after an ambiguous version response until reload', async () => {
    const e = await editor()
    request.mockRejectedValueOnce({ statusCode: 502 })
    await expect(e.saveVersion('Unknown')).rejects.toBeDefined()
    expect(e.saveConflict.value).toBe(true)
    e.restoreVersion({ ...state, width: 720 })
    const count = request.mock.calls.length
    await expect(e.saveNow()).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(count)
  })
})

describe('committed storyboard adoption', () => {
  it('freezes edits while draining autosave then adopts once without another save and undoes once', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 720 })
    request.mockResolvedValueOnce({ timeline: { ...saved, editRevision: 1 } })
    const before = await e.beginStoryboardApplication()
    expect(before.expectedEditRevision).toBe(1)
    e.restoreVersion({ ...state, width: 400 })
    expect(e.timeline.value?.width).toBe(720)
    const receipt = { operationId: 'apply1', projectId: 'p1', before: { timelineId: 't1', editRevision: 1 }, after: { timelineId: 't2', editRevision: 2 }, afterState: { ...state, width: 1080 } } as import('~~/server/utils/video-storyboard/apply').StoryboardApplicationReceipt
    await e.adoptCommittedStoryboard(receipt, before.beforeState)
    await e.adoptCommittedStoryboard(receipt, before.beforeState)
    expect(e.dirty.value).toBe(false)
    expect(e.storyboardDiverged.value).toBe(false)
    const writes = request.mock.calls.filter(([, opts]) => opts?.method === 'PUT')
    expect(writes).toHaveLength(1)
    e.releaseStoryboardApplication()
    e.undoAction()
    expect(e.timeline.value?.width).toBe(720)
    expect(e.storyboardDiverged.value).toBe(true)
    request.mockResolvedValueOnce({ timeline: { id: 't2', editRevision: 3, state: e.timeline.value } })
    await e.saveNow()
    expect(request.mock.calls.at(-1)?.[1].body).toMatchObject({ expectedTimelineId: 't2', expectedEditRevision: 2 })
  })
  it('recovers a receipt after refresh without overwriting a newer saved edit', async () => {
    const e = await editor()
    await e.resumeStoryboardApplication()
    const receipt = { operationId: 'older-apply', projectId: 'p1', before: { timelineId: 'old', editRevision: 1 }, after: { timelineId: 'old-next', editRevision: 2 }, afterState: { ...state, width: 720 } } as import('~~/server/utils/video-storyboard/apply').StoryboardApplicationReceipt
    await e.adoptCommittedStoryboard(receipt, { ...state, width: 400 })
    expect(e.timeline.value).toEqual(state)
    expect(e.dirty.value).toBe(false)
    expect(e.storyboardDiverged.value).toBe(true)
    expect(e.canUndo.value).toBe(false)
    e.releaseStoryboardApplication()
  })
  it('preserves dirty local edits on receipt recovery even when the before token still matches', async () => {
    const e = await editor()
    e.restoreVersion({ ...state, width: 400 })
    await e.resumeStoryboardApplication()
    const receipt = { operationId: 'recovered-apply', projectId: 'p1', before: { timelineId: 't1', editRevision: 0 }, after: { timelineId: 't2', editRevision: 1 }, afterState: { ...state, width: 720 } } as import('~~/server/utils/video-storyboard/apply').StoryboardApplicationReceipt
    await e.adoptCommittedStoryboard(receipt, state)
    expect(e.timeline.value?.width).toBe(400)
    expect(e.dirty.value).toBe(true)
    expect(e.storyboardDiverged.value).toBe(true)
    e.releaseStoryboardApplication()
  })
  it('holds editing before project initialization for a restored pending operation', async () => {
    const e = useMediaProjectEditor('p1')
    e.holdStoryboardApplication()
    hooks.mounted.forEach(fn => fn())
    await vi.waitFor(() => expect(e.status.value).toBe('ready'))
    e.restoreVersion({ ...state, width: 400 })
    expect(e.timeline.value).toEqual(state)
    expect(e.dirty.value).toBe(false)
  })
  it('restores divergence baseline from the saved application after an ordinary refresh', async () => {
    const e = await editor()
    e.restoreStoryboardBaseline({ projectId: 'p1', afterState: state } as import('~~/server/utils/video-storyboard/apply').StoryboardApplicationReceipt)
    expect(e.storyboardDiverged.value).toBe(false)
    e.restoreVersion({ ...state, width: 400 })
    expect(e.storyboardDiverged.value).toBe(true)
  })
})

it('restores a saved version through server identity instead of posting client state without lineage', async () => {
  const e = await editor()
  const restored = { id: 'restored', editRevision: 1, state: { ...state, width: 720 } }
  request.mockImplementationOnce(async () => ({ timeline: restored }))
  await e.restoreVersion({ ...state, width: 2000 }, 'historical-version')
  expect(request.mock.calls.at(-1)![1].body).toEqual({ expectedTimelineId: 't1', expectedEditRevision: 0, restoreTimelineId: 'historical-version' })
  expect(e.timeline.value!.width).toBe(720)
  expect(e.dirty.value).toBe(false)
})
