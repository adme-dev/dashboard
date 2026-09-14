// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computed,
  createApp,
  h,
  nextTick,
  onUnmounted,
  reactive,
  ref,
  Suspense,
  watch
} from 'vue'
import Workspace from '~~/app/components/page-studio/EmailWorkspace.client.vue'

const settings = {
  senderName: 'Synthetic Fleet',
  fromAddress: 'a@example.invalid',
  replyTo: 'b@example.invalid',
  notificationRecipient: 'c@example.invalid',
  inboundAddress: '',
  forwardingDestination: ''
}
const state = () => ({
  siteId: 'site-a',
  environment: 'staging',
  revision: 1,
  settings: { ...settings },
  canEdit: true,
  updatedAt: '2026-09-15T00:00:00Z',
  readiness: {
    status: 'setup_required',
    sendingEnabled: false,
    forwardingEnabled: false,
    senderVerification: 'unverified',
    message: 'Preferences only. Sending and forwarding are not connected.'
  }
})
const data = ref(state()),
  error = ref<unknown>(null)
const mutation = vi.fn(),
  refresh = vi.fn(),
  notify = vi.fn()
const apps: ReturnType<typeof createApp>[] = []
const stubs = {
  UCard: {
    template:
      '<section><slot name="header" /><slot /><slot name="footer" /></section>'
  },
  UFormField: {
    props: ['label', 'error', 'help'],
    template:
      '<label>{{ label }}<slot /><span>{{ error }} {{ help }}</span></label>'
  },
  UBadge: { template: '<span><slot /></span>' },
  UAlert: {
    props: ['title', 'description'],
    template: '<p>{{ title }} {{ description }}</p>'
  },
  UButton: {
    props: ['label', 'disabled', 'loading'],
    emits: ['click'],
    template:
      '<button type="button" :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}</button>'
  },
  UInput: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template:
      '<input :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UModal: {
    props: ['open'],
    template:
      '<aside v-if="open"><slot name="body" /><slot name="footer" /></aside>'
  }
}
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve()
    await nextTick()
  }
}
function button(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].find(
    el => el.textContent === label
  )
}
async function fill(host: HTMLElement, label: string, value: string) {
  const input = [...host.querySelectorAll('label')]
    .find(el => el.textContent?.startsWith(label))
    ?.querySelector('input')
  expect(input).toBeTruthy()
  input!.value = value
  input!.dispatchEvent(new Event('input'))
  await flush()
}
async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({
    render: () =>
      h(Suspense, null, {
        default: () => h(Workspace, { siteId: 'site-a', audience: 'portal' })
      })
  })
  Object.entries(stubs).forEach(([name, component]) =>
    app.component(name, component)
  )
  apps.push(app)
  app.mount(host)
  await flush()
  return host
}
beforeEach(() => {
  vi.clearAllMocks()
  data.value = state()
  error.value = null
  Object.entries({ computed, reactive, ref, watch, onUnmounted }).forEach(
    ([name, value]) => vi.stubGlobal(name, value)
  )
  vi.stubGlobal('useFetch', async () => ({
    data,
    error,
    pending: ref(false),
    refresh
  }))
  vi.stubGlobal('useToast', () => ({ add: notify }))
  vi.stubGlobal('$fetch', mutation)
})
afterEach(() => {
  apps.splice(0).forEach(app => app.unmount())
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})
describe('website email workspace', () => {
  it('shows disabled delivery readiness and prevents viewer edits', async () => {
    data.value.canEdit = false
    const host = await mount()
    expect(host.textContent).toContain('Email delivery is not connected')
    expect(host.textContent).toContain('Read-only access')
    expect(
      [...host.querySelectorAll('input')].every(input => input.disabled)
    ).toBe(true)
    expect(button(host, 'Save preferences')).toBeUndefined()
  })
  it('validates inputs before saving and sends only current revision and preferences', async () => {
    const host = await mount()
    await fill(host, 'Sender address', 'broken')
    button(host, 'Save preferences')!.click()
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    await fill(host, 'Sender address', 'updated@example.invalid')
    mutation.mockResolvedValueOnce({
      ...state(),
      revision: 2,
      settings: { ...settings, fromAddress: 'updated@example.invalid' }
    })
    button(host, 'Save preferences')!.click()
    await flush()
    expect(mutation).toHaveBeenCalledWith(
      '/api/portal/page-studio/sites/site-a/email',
      {
        method: 'PUT',
        body: {
          expectedRevision: 1,
          settings: { ...settings, fromAddress: 'updated@example.invalid' }
        }
      }
    )
    expect(host.textContent).toContain('Revision 2')
    expect(host.textContent).toContain('Email delivery is not connected')
  })
  it('preserves edits after conflict and requires explicit reload confirmation', async () => {
    mutation.mockRejectedValueOnce({ statusCode: 409 })
    const host = await mount()
    await fill(host, 'Sender name', 'My unsaved name')
    button(host, 'Save preferences')!.click()
    await flush()
    expect(host.querySelector('input')!.value).toBe('My unsaved name')
    expect(host.textContent).toContain('Another session changed')
    expect(button(host, 'Save preferences')!.disabled).toBe(true)
    button(host, 'Reload saved settings')!.click()
    await flush()
    expect(refresh).not.toHaveBeenCalled()
    button(host, 'Keep my edits')!.click()
    await flush()
    expect(host.querySelector('input')!.value).toBe('My unsaved name')
    button(host, 'Reload saved settings')!.click()
    await flush()
    refresh.mockImplementationOnce(() => {
      data.value = { ...state(), revision: 3 }
    })
    button(host, 'Reload and replace edits')!.click()
    await flush()
    expect(host.querySelector('input')!.value).toBe('Synthetic Fleet')
    expect(host.textContent).toContain('Revision 3')
  })
  it('does not silently overwrite edits on background refresh and hides them on revoked access', async () => {
    const host = await mount()
    await fill(host, 'Sender name', 'Local edit')
    data.value = { ...state(), revision: 4 }
    await flush()
    expect(host.querySelector('input')!.value).toBe('Local edit')
    error.value = { statusCode: 403 }
    await flush()
    expect(host.querySelectorAll('input')).toHaveLength(0)
    expect(button(host, 'Save preferences')).toBeUndefined()
  })
  it('requires a readback after an uncertain save', async () => {
    mutation.mockRejectedValueOnce(new Error('lost acknowledgement'))
    const host = await mount()
    await fill(host, 'Sender name', 'Local edit')
    button(host, 'Save preferences')!.click()
    await flush()
    expect(host.textContent).toContain('save could not be confirmed')
    expect(button(host, 'Save preferences')!.disabled).toBe(true)
    expect(host.querySelector('input')!.value).toBe('Local edit')
  })
})
