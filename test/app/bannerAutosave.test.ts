import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import { useBannerAutosave } from '../../app/composables/useBannerAutosave'

const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  vi.useFakeTimers()
  const state = reactive({ project: { id: 'one', name: 'Original' }, sets: { text: 'Original' }, isDirty: false, isSaving: false })
  const save = vi.fn(async () => { state.isDirty = false })
  const scope = effectScope(); scopes.push(scope)
  const control = scope.run(() => useBannerAutosave(state, save))!
  const edit = async (text: string) => { state.sets.text = text; state.isDirty = true; await nextTick() }
  return { state, save, scope, control, edit }
}
afterEach(() => { scopes.splice(0).forEach(s => s.stop()); vi.useRealTimers() })
describe('Banner autosave', () => {
  it('does not save opening a project; batches typing after two idle seconds', async () => {
    const e = setup(); await vi.advanceTimersByTimeAsync(10000); expect(e.save).not.toHaveBeenCalled()
    await e.edit('A'); await vi.advanceTimersByTimeAsync(1000); await e.edit('AB')
    await vi.advanceTimersByTimeAsync(1999); expect(e.save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1); expect(e.save).toHaveBeenCalledTimes(1); expect(e.state.isDirty).toBe(false)
  })
  it('saves continuous editing at the ten-second deadline', async () => {
    const e = setup()
    for (let i = 0; i < 10; i++) { await e.edit(String(i)); await vi.advanceTimersByTimeAsync(1000) }
    expect(e.save).toHaveBeenCalledTimes(1)
  })
  it('retains failed edits and retries, clearing the failure only after success', async () => {
    const e = setup(); e.save.mockRejectedValueOnce(new Error('R2 unavailable'))
    await e.edit('Changed'); await vi.advanceTimersByTimeAsync(2000)
    expect(e.control.error.value).toBe(true); expect(e.state.isDirty).toBe(true)
    await vi.advanceTimersByTimeAsync(15000)
    expect(e.save).toHaveBeenCalledTimes(2); expect(e.control.error.value).toBe(false)
  })
  it('flushes title edits before leaving and cancels timers on disposal', async () => {
    const e = setup(); e.state.project.name = 'New title'; e.state.isDirty = true; await nextTick()
    await e.control.flush(); expect(e.save).toHaveBeenCalledTimes(1)
    await e.edit('Later'); e.scope.stop(); await vi.advanceTimersByTimeAsync(30000)
    expect(e.save).toHaveBeenCalledTimes(1)
  })
  it('never overlaps autosaves and follows changes made during a request', async () => {
    const e = setup(); let finish!: () => void
    e.save.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    await e.edit('First'); await vi.advanceTimersByTimeAsync(2000)
    await e.edit('Second'); await vi.advanceTimersByTimeAsync(2000)
    expect(e.save).toHaveBeenCalledTimes(1)
    finish(); await vi.advanceTimersByTimeAsync(2000)
    expect(e.save).toHaveBeenCalledTimes(2)
  })
})
