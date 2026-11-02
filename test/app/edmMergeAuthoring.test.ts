// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEdmMergeTags } from '../../app/composables/useEdmMergeTags'

const client = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const definition = { id: 'id', client_id: client, token: 'custom_offer', name: 'Offer', preview_value: 'Sample offer', fallback: 'Ask us' }
let dispose: (() => void) | undefined
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
function mount(clientValue: string | null = client) {
  const clientId = ref(clientValue)
  let authoring!: ReturnType<typeof useEdmMergeTags>
  const app = createApp({ setup() {
    authoring = useEdmMergeTags(clientId)
    return () => h('div')
  } })
  app.mount(document.createElement('div'))
  dispose = () => app.unmount()
  return { clientId, authoring }
}
describe('sample-only EDM merge authoring', () => {
  it('loads only a scoped definition catalog and adds variables exclusively in sample mode', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [definition] })
    vi.stubGlobal('$fetch', fetch)
    const { authoring } = mount()
    await flush()
    expect(authoring.variables.value).toBeUndefined()
    expect(authoring.choices.value.at(-1)?.value).toBe('{{custom_offer | Ask us}}')
    authoring.previewMode.value = 'samples'
    expect(authoring.variables.value?.custom_offer).toBe('Sample offer')
    expect(authoring.variables.value?.email).toBe('alex@example.invalid')
    expect(fetch.mock.calls).toEqual([[`/api/agency/email/merge-tags?client_id=${client}`]])
  })
  it('clears old samples immediately and rejects a late response from the previous client', async () => {
    let finish!: (value: unknown) => void
    const fetch = vi.fn().mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    })).mockResolvedValue({ items: [] })
    vi.stubGlobal('$fetch', fetch)
    const { authoring, clientId } = mount()
    authoring.previewMode.value = 'samples'
    authoring.samples.value.first_name = 'Previous sample'
    clientId.value = other
    expect(authoring.previewMode.value).toBe('tokens')
    expect(authoring.samples.value.first_name).toBe('Alex')
    expect(authoring.definitions.value).toEqual([])
    await flush()
    finish({ items: [definition] })
    await flush()
    expect(authoring.definitions.value).toEqual([])
  })
  it('does not fetch shared-client or real recipient data', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('$fetch', fetch)
    const { authoring } = mount(null)
    await flush()
    authoring.previewMode.value = 'samples'
    expect(authoring.variables.value?.name).toBe('Alex Example')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps inserted content independent from definition edits and never calls send/schedule', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [definition], item: definition })
    vi.stubGlobal('$fetch', fetch)
    const { authoring } = mount()
    await flush()
    const authored = authoring.choices.value.at(-1)!.value
    await authoring.save({ ...definition, fallback: 'Updated' }, definition.id)
    expect(authored).toBe('{{custom_offer | Ask us}}')
    const patch = fetch.mock.calls.find(call => call[1]?.method === 'PATCH')!
    expect(patch[0]).toBe(`/api/agency/email/merge-tags/id?client_id=${client}`)
    expect(patch[1].body).toEqual({ name: 'Offer', preview_value: 'Sample offer', fallback: 'Updated' })
    expect(fetch.mock.calls.every(call => call[0].startsWith('/api/agency/email/merge-tags'))).toBe(true)
  })
})
