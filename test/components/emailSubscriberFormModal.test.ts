// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, watch } from 'vue'
import SubscriberFormModal from '~~/app/components/email/SubscriberFormModal.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  computed,
  reactive,
  ref,
  watch,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

const stubs: Record<string, unknown> = {
  UButton: {
    name: 'UButton',
    props: ['label', 'loading'],
    emits: ['click'],
    template: '<button :disabled="loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: {
    name: 'UFormField',
    props: ['label'],
    template: '<label><span>{{ label }}</span><slot /></label>'
  },
  UInput: {
    name: 'UInput',
    props: ['modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" :placeholder="placeholder" :type="type" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UModal: {
    name: 'UModal',
    props: ['open'],
    template: '<div v-if="open"><slot name="content" /></div>'
  },
  USelectMenu: {
    name: 'USelectMenu',
    props: ['items'],
    template: '<select><option v-for="item in items" :key="item.value">{{ item.label }}</option></select>'
  }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountModal() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const props: Record<string, unknown> = {
    open: true,
    lists: [{ id: 'list-1', name: 'Main list' }]
  }
  props['onUpdate:open'] = (value: boolean) => {
    props.open = value
  }
  const app = createApp({ render: () => h(SubscriberFormModal, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailSubscriberFormModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('surfaces backend validation details when adding a subscriber fails', async () => {
    fetchMock.mockRejectedValueOnce({
      data: {
        statusMessage: 'invalid_body',
        data: [
          { message: 'Enter a valid email address.' },
          { message: 'List ID is invalid.' }
        ]
      }
    })

    const { app, host } = mountModal()
    const emailInput = host.querySelector('input[type="email"]') as HTMLInputElement
    const addButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Add'))

    emailInput.value = 'person@example.com'
    emailInput.dispatchEvent(new Event('input', { bubbles: true }))
    addButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'Add failed',
      description: 'invalid_body: Enter a valid email address.; List ID is invalid.',
      color: 'error'
    })

    app.unmount()
  })
})
