// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense, watch } from 'vue'
import QrEditor from '~~/app/components/qr/QrEditor.vue'
import QrClientSelect from '~~/app/components/qr/QrClientSelect.vue'

let cleanup = () => {}
afterEach(() => cleanup())
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve()
    await nextTick()
  }
}

it('keeps the QR draft, waits for client creation and saves with the new client and no old folder', async () => {
  const clients = ref([{ id: 'old-client', name: 'Existing client' }])
  const qrCreate = vi.fn(async () => ({ code: { id: 'qr-code' } }))
  let resolve!: (client: { id: string, name: string }) => void
  const fetchClient = vi.fn(() => new Promise((done) => {
    resolve = done
  }))
  Object.assign(globalThis, {
    computed, ref, reactive, watch,
    useAuth: () => ({ canWrite: ref(true), hasRole: () => true }),
    useToast: () => ({ add: vi.fn() }),
    useFetch: async () => ({ data: clients }),
    useQrCodes: () => ({
      create: qrCreate,
      folders: vi.fn(async () => ({ folders: [{ id: 'old-folder', name: 'Old folder' }] })),
      shortUrl: () => 'https://app.xeroflow.io/q/AbC1234'
    }),
    $fetch: fetchClient
  })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(Suspense, null, { default: () => h(QrEditor, {
    open: true, clientId: 'old-client', folderId: 'old-folder'
  }) }) })
  let createClient!: (name: string) => void
  app.component('QrClientSelect', QrClientSelect)
  app.component('USlideover', { template: '<div><slot name="body"/><slot name="footer"/></div>' })
  app.component('UFormField', { template: '<div><slot/></div>' })
  app.component('USelectMenu', {
    props: ['placeholder'], emits: ['create'],
    setup(props, { emit }) {
      if (props.placeholder === 'Select client') createClient = name => emit('create', name)
      return () => h('div')
    }
  })
  app.component('UInput', {
    props: ['modelValue', 'placeholder'], emits: ['update:modelValue'],
    template: '<input :placeholder="placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  })
  app.component('UButton', {
    props: ['disabled'], emits: ['click'],
    template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot/></button>'
  })
  for (const name of ['USwitch', 'USlider', 'USeparator', 'QrStylePicker', 'QrColorField', 'QrPreview']) {
    app.component(name, { template: '<div/>' })
  }
  app.mount(host)
  cleanup = () => {
    app.unmount()
    host.remove()
  }
  await flush()
  function fill(placeholder: string, value: string) {
    const input = host.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }
  fill('Front window decal', 'Knox Ford window decal')
  fill('https://client.com.au/landing', 'https://knoxford.com.au/')
  await flush()
  const save = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Create QR code'))!
  expect(save.disabled).toBe(false)
  createClient('Knox Ford')
  await flush()
  expect(save.disabled).toBe(true)
  expect(qrCreate).not.toHaveBeenCalled()
  resolve({ id: 'knox-ford', name: 'Knox Ford' })
  await flush()
  expect(save.disabled).toBe(false)
  save.click()
  await flush()
  expect(qrCreate).toHaveBeenCalledWith(expect.objectContaining({
    clientId: 'knox-ford', name: 'Knox Ford window decal',
    destinationUrl: 'https://knoxford.com.au/', folderId: null
  }))
})
