// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, watch } from 'vue'
import SegmentBuilder from '~~/app/components/email/SegmentBuilder.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  ref,
  watch,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

const stubs: Record<string, unknown> = {
  UButton: {
    name: 'UButton',
    props: ['label', 'icon', 'loading'],
    emits: ['click'],
    template: '<button :data-icon="icon" :disabled="loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
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
  USelect: {
    name: 'USelect',
    props: ['items', 'modelValue'],
    emits: ['update:modelValue'],
    template: `
      <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    `
  }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountBuilder() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const props: Record<string, unknown> = {
    open: true,
    campaignId: 'camp-1',
    campaignName: 'June Offers',
    initial: {
      match: 'all',
      rules: [{ field: 'attribs.city', op: 'eq', value: 'Melbourne' }]
    }
  }
  props['onUpdate:open'] = (value: boolean) => {
    props.open = value
  }
  const app = createApp({ render: () => h(SegmentBuilder, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailSegmentBuilder', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  it('surfaces backend validation details when saving audience rules fails', async () => {
    fetchMock.mockRejectedValueOnce({
      data: {
        statusMessage: 'invalid_body',
        data: [
          { message: 'Filter rules are invalid.' },
          { message: 'Unsupported operator.' }
        ]
      }
    })

    const { app, host } = mountBuilder()
    const saveButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Save audience'))

    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'Save failed',
      description: 'invalid_body: Filter rules are invalid.; Unsupported operator.',
      color: 'error'
    })

    app.unmount()
  })
})
