import { describe, it, expect } from 'vitest'
import { createRenderer, defineComponent, effectScope, h, nextTick, ref } from 'vue'
import { useComposerCampaigns } from '../../app/composables/useComposerCampaigns'

describe('composer campaign client changes', () => {
  it('hydrates only after child props receive a different saved client', async () => {
    const client = ref<string | null>('client-a')
    const selected = ref<string | null>(null)
    const renderer = createRenderer<object, object>({
      createElement: () => ({}), createText: () => ({}), createComment: () => ({}),
      insert: () => {}, remove: () => {}, setElementText: () => {}, setText: () => {}, patchProp: () => {},
      parentNode: () => null, nextSibling: () => null
    })
    const Child = defineComponent({ props: { clientId: String }, setup(props) {
      useComposerCampaigns(() => props.clientId ?? null, selected, async () => [])
      return () => h('div')
    } })
    const app = renderer.createApp({ setup: () => () => h(Child, { clientId: client.value }) })
    app.mount({})
    client.value = 'client-b'
    await nextTick()
    selected.value = 'saved-campaign-b'
    await nextTick()
    expect(selected.value).toBe('saved-campaign-b')
    app.unmount()
  })
  it('clears selection and ignores a late response from the previous client', async () => {
    const client = ref<string | null>('client-a')
    const selected = ref<string | null>('saved-campaign')
    const pending: Record<string, (rows: never[]) => void> = {}
    const scope = effectScope()
    const list = scope.run(() => useComposerCampaigns(() => client.value, selected, id => new Promise((resolve) => {
      pending[id] = resolve
    })))!
    expect(selected.value).toBe('saved-campaign')
    client.value = 'client-b'
    expect(selected.value).toBeNull()
    pending['client-b']!([{ id: 'b' } as never])
    await Promise.resolve()
    pending['client-a']!([{ id: 'a' } as never])
    await Promise.resolve()
    expect(list.campaigns.value.map(c => c.id)).toEqual(['b'])
    scope.stop()
  })
  it('does not retain a previous client list on failure and allows retry', async () => {
    const client = ref<string | null>('a')
    const selected = ref<string | null>(null)
    let fail = false
    const scope = effectScope()
    const list = scope.run(() => useComposerCampaigns(() => client.value, selected, async () => {
      if (fail) throw new Error('offline')
      return [{ id: 'a' } as never]
    }))!
    await Promise.resolve()
    fail = true
    client.value = 'b'
    await Promise.resolve()
    expect(list.campaigns.value).toEqual([])
    expect(list.failed.value).toBe(true)
    fail = false
    await list.reload()
    expect(list.failed.value).toBe(false)
    client.value = null
    expect(list.campaigns.value).toEqual([])
    scope.stop()
  })
})
