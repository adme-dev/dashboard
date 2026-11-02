import { describe, expect, it, vi } from 'vitest'
import { useEdmWorkspaceLeave } from '../../app/composables/useEdmWorkspaceLeave'

describe('embedded email library navigation', () => {
  it('keeps dirty edits until the user explicitly stays, discards or confirms a successful save', async () => {
    let dirty = true
    const save = vi.fn(async () => {
      dirty = false
      return true
    })
    const flow = useEdmWorkspaceLeave({ hasChanges: () => dirty, isBusy: () => false, save })
    const stayed = flow.request()
    expect(flow.open.value).toBe(true)
    flow.stay()
    expect(await stayed).toBe(false)
    expect(dirty).toBe(true)
    const discarded = flow.request()
    flow.discard()
    expect(await discarded).toBe(true)
    const saved = flow.request()
    await flow.saveAndLeave()
    expect(await saved).toBe(true)
    expect(save).toHaveBeenCalledOnce()
    expect(flow.request()).toBe(true)
  })
  it('does not leave after a failed save, newer edits during save or an unconfirmed action', async () => {
    let busy = true
    const save = vi.fn().mockResolvedValue(false)
    const flow = useEdmWorkspaceLeave({ hasChanges: () => true, isBusy: () => busy, save })
    const pending = flow.request()
    flow.discard()
    await flow.saveAndLeave()
    expect(flow.open.value).toBe(true)
    expect(save).not.toHaveBeenCalled()
    busy = false
    await flow.saveAndLeave()
    expect(flow.open.value).toBe(true)
    save.mockResolvedValue(true)
    await flow.saveAndLeave()
    expect(flow.open.value).toBe(true)
    flow.stay()
    expect(await pending).toBe(false)
  })
})
