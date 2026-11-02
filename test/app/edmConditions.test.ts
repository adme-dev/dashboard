// @vitest-environment happy-dom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEdmBuilder } from '../../app/composables/useEdmBuilder'
import { useEdmConditions } from '../../app/composables/useEdmConditions'

const client = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const definition = {
  id: 'id',
  client_id: client,
  name: 'Named condition',
  predicate: { field: 'name', op: 'exists' }
}
const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  vi.unstubAllGlobals()
})
function mount() {
  const clientId = ref<string | null>(client)
  const documentId = ref<string | null>('document')
  let state!: ReturnType<typeof useEdmConditions>
  const app = createApp({
    setup() {
      state = useEdmConditions(clientId, documentId)
      return () => h('div')
    }
  })
  app.mount(document.createElement('div'))
  dispose = () => app.unmount()
  return { state, clientId, documentId }
}
describe('condition client authority and catalog authoring', () => {
  it('requires independent designer discovery and never treats custom variables as recipient data', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(url =>
        Promise.resolve(
          String(url).includes('documentId')
            ? { canEdit: false, clientId: client }
            : { items: [definition] }
        )
      )
    vi.stubGlobal('$fetch', fetch)
    const { state } = mount()
    await flush()
    expect(state.definitions.value).toEqual([definition])
    expect(state.canEdit.value).toBe(false)
    expect(
      await state.save({
        client_id: client,
        name: 'Changed',
        predicate: { field: 'name', op: 'exists' }
      })
    ).toBe(false)
    expect(fetch.mock.calls).toHaveLength(2)
    expect(
      fetch.mock.calls.every(
        call => !/subscriber|send|schedule|campaign/.test(String(call[0]))
      )
    ).toBe(true)
  })
  it('clears client data and authority synchronously and fences late responses', async () => {
    let finish!: (value: unknown) => void
    const fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('documentId'))
        return Promise.resolve({ canEdit: true, clientId: client })
      if (String(url).includes(client))
        return new Promise((resolve) => {
          finish = resolve
        })
      return Promise.resolve({ items: [] })
    })
    vi.stubGlobal('$fetch', fetch)
    const { state, clientId } = mount()
    clientId.value = other
    expect(state.canEdit.value).toBe(false)
    expect(state.definitions.value).toEqual([])
    await flush()
    finish({ items: [definition] })
    await flush()
    expect(state.definitions.value).toEqual([])
    expect(state.canEdit.value).toBe(false)
  })
  it('validates catalog writes and preserves an already copied predicate when definition changes', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(url =>
        Promise.resolve(
          String(url).includes('documentId')
            ? { canEdit: true, clientId: client }
            : { items: [definition] }
        )
      )
    vi.stubGlobal('$fetch', fetch)
    const { state } = mount()
    await flush()
    const copied = JSON.stringify(state.definitions.value[0]!.predicate)
    expect(
      await state.save(
        {
          client_id: client,
          name: 'Changed',
          predicate: {
            field: 'email',
            op: 'contains',
            value: '@example.invalid'
          }
        },
        'id'
      )
    ).toBe(true)
    expect(copied).toBe(JSON.stringify(definition.predicate))
    expect(
      fetch.mock.calls.find(call => call[1]?.method === 'PATCH')?.[1].body
    ).toEqual({
      name: 'Changed',
      predicate: { field: 'email', op: 'contains', value: '@example.invalid' }
    })
  })
  it('keeps loaded conditions read-only through ordinary desktop and mobile setters', () => {
    const store = useEdmBuilder()
    const condition = {
      version: 1,
      name: 'Saved copy',
      predicate: { field: 'name', op: 'exists' }
    }
    store.resetDocument({
      root: { type: 'EmailLayout', data: { childrenIds: ['text'] } },
      text: {
        type: 'Text',
        data: { props: { text: 'Offer', visibilityCondition: condition } }
      }
    })
    store.updateBlockProps('text', {
      text: 'Updated',
      visibilityCondition: null
    })
    expect(store.document.value.text.data.props?.visibilityCondition).toEqual(
      condition
    )
    store.updateBlockMobileProps('text', {
      text: 'Mobile text',
      visibilityCondition: condition
    })
    expect(
      store.document.value.text.data.mobile?.props?.visibilityCondition
    ).toBeUndefined()
    expect(store.document.value.text.data.mobile?.props?.text).toBe(
      'Mobile text'
    )
  })
})
