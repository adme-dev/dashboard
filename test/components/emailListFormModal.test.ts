// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, ref, watch } from 'vue'
import ListFormModal from '~~/app/components/email/ListFormModal.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
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
  UCheckbox: {
    name: 'UCheckbox',
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">{{ label }}</label>'
  },
  UFormField: {
    name: 'UFormField',
    props: ['label', 'help'],
    template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>'
  },
  UInput: {
    name: 'UInput',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UModal: {
    name: 'UModal',
    props: ['open'],
    template: '<div v-if="open"><slot name="content" /></div>'
  },
  UTextarea: {
    name: 'UTextarea',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
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
  const props: Record<string, unknown> = { open: true, list: null }
  props['onUpdate:open'] = (value: boolean) => {
    props.open = value
  }
  const app = createApp({ render: () => h(ListFormModal, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailListFormModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('surfaces backend validation details when saving a list fails', async () => {
    fetchMock.mockRejectedValueOnce({
      data: {
        statusMessage: 'invalid_body',
        data: [
          { message: 'List name is required.' },
          { message: 'Description is too long.' }
        ]
      }
    })

    const { app, host } = mountModal()
    const nameInput = host.querySelector('input[placeholder="Monthly Newsletter"]') as HTMLInputElement
    const saveButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Save'))

    nameInput.value = 'June list'
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'Save failed',
      description: 'invalid_body: List name is required.; Description is too long.',
      color: 'error'
    })

    app.unmount()
  })
})
