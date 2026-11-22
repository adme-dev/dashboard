import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useVideoModelAccess } from '~~/app/composables/useVideoModelAccess'

afterEach(() => vi.unstubAllGlobals())

describe('video generation access', () => {
  it('distinguishes disabled policy, an empty catalog and a failed lookup that can be retried', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ policy: { enabled: false }, models: [] })
      .mockResolvedValueOnce({ policy: { enabled: true }, models: [] })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ policy: { enabled: true, payer: 'agency' }, models: [{ id: 'video' }] })
    vi.stubGlobal('$fetch', fetch)
    const scope = effectScope()
    try {
      const access = scope.run(() => useVideoModelAccess(ref('project'), ref(true)))!
      await vi.waitFor(() => expect(access.detail.value).toMatch(/disabled for this project/))
      access.retry()
      await vi.waitFor(() => expect(access.detail.value).toMatch(/no selectable video models/))
      access.retry()
      await vi.waitFor(() => expect(access.failed.value).toBe(true))
      expect(access.detail.value).toContain('Try again')
      access.retry()
      await vi.waitFor(() => expect(access.models.value).toHaveLength(1))
      expect(access.data.value.policy?.payer).toBe('agency')
    } finally {
      scope.stop()
    }
  })

  it.each([
    [{ statusCode: 404, data: { data: { code: 'VIDEO_GENERATION_DISABLED' } } }, 'disabled for this workspace'],
    [{ statusCode: 403 }, 'does not have generation access']
  ] as const)('explains a server access decision without prompting a retry', async (error, detail) => {
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(error))
    const scope = effectScope()
    try {
      const access = scope.run(() => useVideoModelAccess(ref('project'), ref(true)))!
      await vi.waitFor(() => expect(access.detail.value).toContain(detail))
      expect(access.failed.value).toBe(false)
    } finally {
      scope.stop()
    }
  })

  it('discards a previous project response after switching to a disabled workspace', async () => {
    let finish!: (data: unknown) => void
    vi.stubGlobal('$fetch', () => new Promise(resolve => { finish = resolve }))
    const active = ref(true)
    const scope = effectScope()
    try {
      const access = scope.run(() => useVideoModelAccess(ref('old-project'), active))!
      active.value = false
      await nextTick()
      finish({ models: [{ id: 'stale' }] })
      await Promise.resolve()
      expect(access.models.value).toEqual([])
      expect(access.detail.value).toContain('disabled for this workspace')
      expect(access.pending.value).toBe(false)
    } finally {
      scope.stop()
    }
  })
})
