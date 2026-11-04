import { ref, nextTick } from 'vue'
import { installStoryboardRecovery } from '~~/app/utils/video/storyboardRecovery'
import { describe, expect, it, vi } from 'vitest'
import type { StoryboardApplicationReceipt } from '~~/server/utils/video-storyboard/apply'
import { emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'
import { createStoryboardApplication } from '~~/app/utils/video/storyboardApplication'

const before = emptyAvTimeline()
const token = { expectedTimelineId: 'timeline', expectedEditRevision: 3 }
const receipt = { operationId: 'stable', projectId: 'project', before: { timelineId: 'timeline', editRevision: 3 }, afterState: { tracks: [] } } as unknown as StoryboardApplicationReceipt
function setup() {
  const editor = { begin: vi.fn(async () => ({ beforeState: before, ...token })), adopt: vi.fn(), release: vi.fn() }
  const transport = { apply: vi.fn(async () => receipt), recover: vi.fn(async (): Promise<StoryboardApplicationReceipt | null> => receipt) }
  return { editor, transport, app: createStoryboardApplication('project', editor, transport, () => 'stable') }
}
describe('storyboard application ownership', () => {
  it('awaits the flushed editor before applying and adopts only once', async () => {
    const { app, editor, transport } = setup()
    await app.apply('revision', true)
    expect(transport.apply).toHaveBeenCalledWith({ operationId: 'stable', revisionId: 'revision', ...token, replaceConfirmed: true })
    expect(editor.adopt).toHaveBeenCalledWith(receipt, before)
    await app.recover()
    expect(editor.adopt).toHaveBeenCalledTimes(1)
    expect(editor.release).toHaveBeenCalledOnce()
  })
  it('retains the operation and edit freeze across unknown failures and recovers', async () => {
    const { app, editor, transport } = setup()
    transport.apply.mockRejectedValueOnce(new Error('timeout'))
    transport.recover.mockResolvedValueOnce(null)
    await expect(app.apply('revision', false)).rejects.toThrow()
    expect(editor.release).not.toHaveBeenCalled()
    expect(app.pendingOperation()).toBe('stable')
    await app.recover()
    expect(editor.adopt).toHaveBeenCalledOnce()
    expect(editor.release).toHaveBeenCalledOnce()
  })
  it('preserves local state on conflict and releases editing', async () => {
    const { app, editor, transport } = setup()
    transport.apply.mockRejectedValueOnce({ statusCode: 409 })
    await expect(app.apply('revision', false)).rejects.toMatchObject({ statusCode: 409 })
    expect(editor.adopt).not.toHaveBeenCalled()
    expect(editor.release).toHaveBeenCalledOnce()
    expect(app.pendingOperation()).toBe(null)
  })
  it('retries exactly the original request and rejects changed intent while unresolved', async () => {
    const { app, transport } = setup()
    transport.apply.mockRejectedValueOnce(new Error('lost'))
    transport.recover.mockResolvedValue(null)
    await expect(app.apply('revision', false)).rejects.toThrow()
    await expect(app.apply('other', true)).rejects.toThrow('Recover')
    await app.apply('revision', false)
    expect(transport.apply.mock.calls[0]).toEqual(transport.apply.mock.calls[1])
  })
  it('retains an ambiguous request across refresh and freezes the new editor before recovery', async () => {
    const { editor, transport } = setup()
    let stored: string | null = null
    const storage = { read: () => stored, write: (value: string | null) => {
      stored = value
    } }
    const first = createStoryboardApplication('project', editor, transport, () => 'stable', storage)
    transport.apply.mockRejectedValueOnce(new Error('lost'))
    transport.recover.mockResolvedValueOnce(null)
    await expect(first.apply('revision', true)).rejects.toThrow('lost')
    expect(stored).toContain('stable')
    const resumed = { ...editor, resume: vi.fn(async () => undefined) }
    const second = createStoryboardApplication('project', resumed, transport, () => 'must-not-be-used', storage)
    await second.recover()
    expect(resumed.resume).toHaveBeenCalledOnce()
    expect(transport.recover).toHaveBeenLastCalledWith('stable')
    expect(stored).toBe(null)
    expect(editor.begin).toHaveBeenCalledOnce()
  })
  it('locks synchronously and waits for slow storyboard GET after fast editor initialization', async () => {
    const status = ref('loading'), loading = ref(true), pending = ref<string | null>('stable')
    const hold = vi.fn(), recover = vi.fn(async () => {
      pending.value = null
    })
    const stop = installStoryboardRecovery({ status, loading, pending, hold, recover })
    expect(hold).toHaveBeenCalledOnce()
    status.value = 'ready'
    await nextTick()
    expect(recover).not.toHaveBeenCalled()
    loading.value = false
    await nextTick()
    expect(recover).toHaveBeenCalledOnce()
    loading.value = true
    await nextTick()
    loading.value = false
    await nextTick()
    expect(recover).toHaveBeenCalledOnce()
    stop()
  })
  it.each(['{broken', '{}', JSON.stringify({ projectId: 'other', body: { operationId: 'stable', revisionId: 'revision', ...token, replaceConfirmed: true }, before })])('ignores invalid or cross-project pending cache without locking', (cached) => {
    const { editor, transport } = setup()
    const write = vi.fn()
    const app = createStoryboardApplication('project', editor, transport, () => 'stable', { read: () => cached, write })
    expect(app.pendingOperation()).toBe(null)
    expect(write).toHaveBeenCalledWith(null)
    expect(editor.begin).not.toHaveBeenCalled()
  })
})
