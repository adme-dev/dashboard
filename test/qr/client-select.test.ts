// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, Suspense } from 'vue'
import QrClientSelect from '~~/app/components/qr/QrClientSelect.vue'

const clients = ref([{ id: 'existing', name: 'Knox GWM Haval' }])
const canWrite = ref(true)
const hasRole = vi.fn(() => true)
const fetchClient = vi.fn()
const toast = { add: vi.fn() }
let cleanup = () => {}

beforeEach(() => {
  clients.value = [{ id: 'existing', name: 'Knox GWM Haval' }]
  canWrite.value = true
  hasRole.mockReturnValue(true)
  fetchClient.mockReset()
  toast.add.mockClear()
  Object.assign(globalThis, {
    computed, ref,
    useAuth: () => ({ canWrite, hasRole }),
    useToast: () => toast,
    useFetch: async () => ({ data: clients }),
    $fetch: fetchClient
  })
})
afterEach(() => cleanup())

async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

async function mount(disabled = false) {
  const selected = ref('existing')
  const host = document.createElement('div')
  document.body.append(host)
  let select!: { props: { createItem?: boolean | 'always', disabled?: boolean }, emit: (event: string, ...args: unknown[]) => void }
  const app = createApp({ render: () => h(Suspense, null, {
    default: () => h(QrClientSelect, {
      'modelValue': selected.value, disabled,
      'onUpdate:modelValue': (value: string) => { selected.value = value }
    })
  }) })
  app.component('USelectMenu', {
    props: ['modelValue', 'items', 'createItem', 'disabled', 'loading', 'searchTerm'],
    emits: ['create', 'update:searchTerm', 'update:open', 'update:modelValue'],
    setup(props, { emit }) {
      select = { props, emit }
      return () => h('div', props.items?.map((item: { label: string }) => h('span', item.label)))
    }
  })
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  return { selected, select, host }
}

describe('QR client selection', () => {
  it('creates an unlisted client and selects its persisted ID immediately', async () => {
    fetchClient.mockResolvedValue({ id: 'knox-ford', name: 'Knox Ford' })
    const { select, selected, host } = await mount()
    select.emit('update:searchTerm', ' Knox Ford ')
    await flush()
    expect(select.props.createItem).toBe('always')
    select.emit('create', ' Knox Ford ')
    await flush()
    expect(fetchClient).toHaveBeenCalledWith('/api/agency/clients', expect.objectContaining({
      method: 'POST', body: { name: 'Knox Ford' },
      headers: { 'Idempotency-Key': expect.stringMatching(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/) }
    }))
    expect(selected.value).toBe('knox-ford')
    expect(host.textContent).toContain('Knox Ford')
    expect(clients.value).toContainEqual({ id: 'knox-ford', name: 'Knox Ford' })
  })

  it('uses an existing exact name case-insensitively without creating duplicates', async () => {
    const { select, selected } = await mount()
    select.emit('update:searchTerm', ' knox gwm haval ')
    await flush()
    expect(select.props.createItem).toBe(false)
    select.emit('create', ' knox gwm haval ')
    await flush()
    expect(fetchClient).not.toHaveBeenCalled()
    expect(selected.value).toBe('existing')
  })

  it('keeps the selected client on failure and reuses the attempt key on retry', async () => {
    fetchClient.mockRejectedValueOnce({ data: { statusMessage: 'Could not create client' } })
      .mockResolvedValueOnce({ id: 'knox-ford', name: 'Knox Ford' })
    const { select, selected } = await mount()
    select.emit('create', 'Knox Ford')
    await flush()
    expect(selected.value).toBe('existing')
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ color: 'error', description: 'Could not create client' }))
    select.emit('create', 'Knox Ford')
    await flush()
    expect(fetchClient.mock.calls[1][1].headers).toEqual(fetchClient.mock.calls[0][1].headers)
    expect(selected.value).toBe('knox-ford')
  })

  it.each(['permission', 'read-only', 'editing'])('prevents client creation for %s restrictions', async (restriction) => {
    if (restriction === 'permission') hasRole.mockReturnValue(false)
    if (restriction === 'read-only') canWrite.value = false
    const { select } = await mount(restriction === 'editing')
    select.emit('update:searchTerm', 'Knox Ford')
    await flush()
    expect(select.props.createItem).toBe(false)
    select.emit('create', 'Knox Ford')
    await flush()
    expect(fetchClient).not.toHaveBeenCalled()
  })

  it('rejects whitespace and prevents repeated creates while saving', async () => {
    let resolve!: (client: { id: string, name: string }) => void
    fetchClient.mockImplementation(() => new Promise((done) => {
      resolve = done
    }))
    const { select } = await mount()
    select.emit('create', '  ')
    await flush()
    expect(fetchClient).not.toHaveBeenCalled()
    select.emit('create', 'Knox Ford')
    select.emit('create', 'Knox Ford')
    await flush()
    expect(fetchClient).toHaveBeenCalledTimes(1)
    expect(select.props.disabled).toBe(true)
    resolve({ id: 'knox-ford', name: 'Knox Ford' })
    await flush()
    expect(select.props.disabled).toBe(false)
  })
})
