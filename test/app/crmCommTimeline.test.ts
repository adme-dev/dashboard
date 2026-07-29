// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, inject, nextTick, reactive, ref, watch } from 'vue'
import CommTimeline from '~~/app/components/crm/CommTimeline.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()
const timelineEntry = {
  source: 'communication',
  id: 'communication-1',
  kind: 'email',
  direction: 'inbound',
  title: 'Customer replied',
  body: 'Please call tomorrow',
  at: '2026-07-28T00:00:00.000Z',
  actor_name: 'Portal user'
}

Object.assign(globalThis, {
  computed,
  inject,
  reactive,
  ref,
  watch,
  useToast: () => ({ add: toastAddMock }),
  $fetch: (...args: unknown[]) => fetchMock(...args)
})

const stubs = {
  UFormField: {
    props: ['label', 'hint'],
    template: '<label :data-label="label" :data-hint="hint"><slot /></label>'
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">'
  },
  UTextarea: {
    props: ['modelValue', 'rows'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" :rows="rows" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UButton: {
    props: ['type', 'disabled', 'loading'],
    emits: ['click'],
    template: '<button :type="type || \'button\'" :disabled="disabled" :data-loading="loading" @click="$emit(\'click\')"><slot /></button>'
  },
  UIcon: {
    props: ['name'],
    template: '<i :data-icon="name" />'
  },
  UBadge: {
    template: '<span><slot /></span>'
  }
}

function mountTimeline() {
  const host = document.createElement('div')
  const app = createApp({
    render: () => h(CommTimeline, {
      clientId: 'client-1',
      targetType: 'person',
      targetId: 'person-1'
    })
  })
  app.provide('crmApiBase', '/api/client-portal/crm')
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub))
  app.mount(host)
  return { app, host }
}

function update(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('CRM communications timeline composer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (_request: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return {}
      return { items: [timelineEntry] }
    })
  })

  it('renders a labelled full-width composer that adapts to direction requirements', async () => {
    const { app, host } = mountTimeline()

    try {
      await flush()

      const form = host.querySelector('form')
      expect(form?.classList.contains('@container')).toBe(true)
      expect(form?.querySelector('.grid.grid-cols-1.gap-4.\\@md\\:grid-cols-2')).not.toBeNull()
      expect(form?.querySelector('[data-label="Activity type"]')?.classList.contains('@md:col-span-2')).toBe(true)
      expect(form?.querySelector('[data-label="Direction"]')).toBeNull()
      expect(form?.querySelector('[data-label="Subject"]')?.getAttribute('data-hint')).toBe('Optional')
      expect(form?.querySelector('[data-label="Details"] textarea')?.getAttribute('rows')).toBe('4')
      expect(form?.querySelectorAll('select.w-full, input.w-full, textarea.w-full')).toHaveLength(3)
      expect((form?.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)

      const type = form?.querySelector('[data-label="Activity type"] select') as HTMLSelectElement
      for (const channel of ['email', 'call', 'sms']) {
        update(type, channel)
        await nextTick()
        expect(form?.querySelector('[data-label="Direction"]')).not.toBeNull()
        expect(form?.querySelector('[data-label="Activity type"]')?.classList.contains('@md:col-span-2')).toBe(false)
        expect(form?.querySelectorAll('select.w-full, input.w-full, textarea.w-full')).toHaveLength(4)
      }

      for (const channel of ['meeting', 'note']) {
        update(type, channel)
        await nextTick()
        expect(form?.querySelector('[data-label="Direction"]')).toBeNull()
        expect(form?.querySelector('[data-label="Activity type"]')?.classList.contains('@md:col-span-2')).toBe(true)
      }
    } finally {
      app.unmount()
    }
  })

  it('keeps portal logging, refresh, filtering, and timeline rendering connected', async () => {
    const { app, host } = mountTimeline()

    try {
      await flush()
      expect(host.textContent).toContain('Customer replied')
      expect(host.textContent).toContain('Please call tomorrow')

      const form = host.querySelector('form')
      if (!form) {
        expect(form).not.toBeNull()
        return
      }
      update(form.querySelector('[data-label="Activity type"] select') as HTMLSelectElement, 'email')
      await nextTick()
      update(form.querySelector('[data-label="Direction"] select') as HTMLSelectElement, 'inbound')
      update(form.querySelector('[data-label="Subject"] input') as HTMLInputElement, 'Follow-up')
      update(form.querySelector('[data-label="Details"] textarea') as HTMLTextAreaElement, 'Customer replied')
      await nextTick()

      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement
      expect(submit.disabled).toBe(false)
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()

      expect(fetchMock).toHaveBeenCalledWith('/api/client-portal/crm/communications', {
        method: 'POST',
        body: {
          client_id: 'client-1',
          person_id: 'person-1',
          channel: 'email',
          direction: 'inbound',
          subject: 'Follow-up',
          body: 'Customer replied'
        }
      })
      expect((form.querySelector('[data-label="Subject"] input') as HTMLInputElement).value).toBe('')
      expect((form.querySelector('[data-label="Details"] textarea') as HTMLTextAreaElement).value).toBe('')
      expect(toastAddMock).toHaveBeenCalledWith({ title: 'Logged', color: 'success' })

      const getCallsAfterSubmit = fetchMock.mock.calls.filter(([, options]) => !options?.method)
      expect(getCallsAfterSubmit).toHaveLength(2)

      const filter = host.querySelector('.flex.items-center.gap-2 select') as HTMLSelectElement
      update(filter, 'email')
      await flush()

      expect(fetchMock).toHaveBeenLastCalledWith('/api/client-portal/crm/communications', {
        query: {
          client_id: 'client-1',
          target: 'person',
          target_id: 'person-1',
          channel: 'email'
        }
      })
    } finally {
      app.unmount()
    }
  })
})
