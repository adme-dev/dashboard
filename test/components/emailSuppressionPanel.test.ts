// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, reactive, ref, Suspense, watch } from 'vue'
import SuppressionPanel from '~~/app/components/email/SuppressionPanel.vue'

const fetchMock = vi.fn()
const refreshMock = vi.fn()
const toastAddMock = vi.fn()
const promptMock = vi.fn()
const confirmMock = vi.fn()
const originalConsoleInfo = console.info

Object.assign(globalThis, {
  computed,
  reactive,
  ref,
  watch,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock }),
  useFetch: async () => ({
    data: ref({
      items: [
        {
          email: 'person@example.com',
          reason: 'manual',
          subscriber_name: 'Person',
          subscriber_status: 'enabled',
          created_at: '2026-06-05T00:00:00.000Z'
        }
      ],
      total: 1,
      page: 1,
      page_size: 50
    }),
    refresh: refreshMock,
    pending: ref(false)
  })
})

const stubs: Record<string, unknown> = {
  UBadge: { name: 'UBadge', props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UButton: {
    name: 'UButton',
    props: ['label', 'icon', 'loading', 'disabled'],
    emits: ['click'],
    template: '<button :data-icon="icon" :disabled="disabled" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UInput: { name: 'UInput', props: ['modelValue', 'placeholder'], template: '<input :placeholder="placeholder">' },
  USelectMenu: {
    name: 'USelectMenu',
    props: ['items'],
    template: '<select><option v-for="item in items" :key="item.value">{{ item.label }}</option></select>'
  },
  UTextarea: { name: 'UTextarea', props: ['modelValue', 'placeholder'], template: '<textarea :placeholder="placeholder" />' }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

async function mountPanel() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(Suspense, null, {
      default: () => h(SuppressionPanel),
      fallback: () => h('div', 'loading')
    })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  await flush()
  return { app, host }
}

describe('EmailSuppressionPanel', () => {
  beforeAll(() => {
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      if (String(args[0]).includes('<Suspense> is an experimental feature')) return
      originalConsoleInfo(...args)
    })
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    Object.defineProperty(window, 'prompt', {
      value: promptMock,
      configurable: true
    })
    Object.defineProperty(window, 'confirm', {
      value: confirmMock,
      configurable: true
    })
    promptMock.mockReturnValue('Support confirmed consent before lifting')
    confirmMock.mockReturnValue(true)
  })

  it('captures a staff reason when removing a manual suppression', async () => {
    const { app, host } = await mountPanel()
    const removeButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Remove'))

    removeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(window.confirm).not.toHaveBeenCalled()
    expect(window.prompt).toHaveBeenCalledWith(
      'Reason for removing suppression for person@example.com',
      ''
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/email/suppressions/person%40example.com', {
      method: 'DELETE',
      body: {
        confirm: false,
        note: 'Support confirmed consent before lifting'
      }
    })

    app.unmount()
  })
})
