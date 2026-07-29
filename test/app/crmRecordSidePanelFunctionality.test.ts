// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, inject, nextTick, reactive, ref, toRef, watchEffect } from 'vue'
import ContactPrefs from '~~/app/components/crm/ContactPrefs.vue'
import RecordForm from '~~/app/components/crm/RecordForm.vue'
import RecordSlideover from '~~/app/components/crm/RecordSlideover.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()
const customFields = ref([{
  id: 'field-1',
  key: 'lead_source',
  label: 'Lead source',
  field_type: 'dropdown',
  options: ['Website', 'Referral']
}])

Object.assign(globalThis, {
  computed,
  inject,
  reactive,
  ref,
  toRef,
  watchEffect,
  LIFECYCLE_STAGES: ['lead', 'customer'],
  lifecycleLabel: (stage: string) => stage,
  useCrmCustomFields: () => ({ fields: customFields }),
  useToast: () => ({ add: toastAddMock }),
  $fetch: (...args: unknown[]) => fetchMock(...args)
})

const formStubs = {
  UFormField: {
    props: ['label'],
    template: '<label :data-label="label"><slot /></label>'
  },
  UInput: {
    props: ['modelValue'],
    emits: ['update:modelValue', 'blur'],
    template: '<input :value="modelValue ?? \'\'" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')">'
  },
  UInputTags: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue.join(\',\')" @input="$emit(\'update:modelValue\', $event.target.value.split(\',\').filter(Boolean))">'
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USelectMenu: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value ?? item" :value="item.value ?? item">{{ item.label ?? item }}</option></select>'
  },
  UCheckbox: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)">'
  },
  UButton: {
    props: ['type'],
    template: '<button :type="type || \'button\'"><slot /></button>'
  },
  USeparator: { template: '<hr>' },
  UBadge: { template: '<span><slot /></span>' },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button type="button" :disabled="disabled" :data-enabled="modelValue" @click="$emit(\'update:modelValue\', !modelValue)" />'
  },
  CrmOwnerSelect: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<select data-owner :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="owner-1">Owner 1</option><option value="owner-2">Owner 2</option></select>'
  }
}

function mount(component: unknown, props: Record<string, unknown>, stubs: Record<string, unknown>) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub as never))
  app.mount(host)
  return { app, host }
}

function update(element: HTMLInputElement | HTMLSelectElement, value: string) {
  element.value = value
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
}

async function flush() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('CRM record side panel functionality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({})
  })

  it('hydrates, edits, and submits all record-field groups through the existing save contract', async () => {
    const submitted: Array<Record<string, unknown>> = []
    const cancelled = vi.fn()
    const { app, host } = mount(RecordForm, {
      objectType: 'person',
      clientId: 'client-1',
      record: {
        id: 'person-1',
        first_name: 'Arman',
        last_name: 'Arya',
        email: 'arman@example.com',
        phone: '0399999999',
        mobile: '0412345678',
        job_title: 'Manager',
        department: 'Sales',
        city: 'Melbourne',
        lifecycle_stage: 'customer',
        tags: ['vip'],
        owner_id: 'owner-1',
        custom_fields: { lead_source: 'Website' }
      },
      onSubmit: (body: Record<string, unknown>) => submitted.push(body),
      onCancel: cancelled
    }, formStubs)

    try {
      expect((host.querySelector('[data-label="First name"] input') as HTMLInputElement).value).toBe('Arman')
      expect((host.querySelector('[data-label="Lifecycle stage"] select') as HTMLSelectElement).value).toBe('customer')
      expect((host.querySelector('[data-label="Tags"] input') as HTMLInputElement).value).toBe('vip')
      expect((host.querySelector('[data-owner]') as HTMLSelectElement).value).toBe('owner-1')
      expect((host.querySelector('[data-label="Lead source"] select') as HTMLSelectElement).value).toBe('Website')

      update(host.querySelector('[data-label="First name"] input') as HTMLInputElement, 'Arman updated')
      update(host.querySelector('[data-label="Lifecycle stage"] select') as HTMLSelectElement, 'lead')
      update(host.querySelector('[data-label="Tags"] input') as HTMLInputElement, 'vip,hot')
      update(host.querySelector('[data-owner]') as HTMLSelectElement, 'owner-2')
      update(host.querySelector('[data-label="Lead source"] select') as HTMLSelectElement, 'Referral')
      await nextTick()

      host.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await nextTick()

      expect(submitted).toHaveLength(1)
      expect(submitted[0]).toMatchObject({
        first_name: 'Arman updated',
        last_name: 'Arya',
        email: 'arman@example.com',
        lifecycle_stage: 'lead',
        tags: ['vip', 'hot'],
        owner_id: 'owner-2',
        custom_fields: { lead_source: 'Referral' }
      })

      const cancel = [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Cancel')
      cancel?.click()
      expect(cancelled).toHaveBeenCalledOnce()
    } finally {
      app.unmount()
    }
  })

  it('persists every contact-preference control through the person PATCH endpoint', async () => {
    const { app, host } = mount(ContactPrefs, {
      clientId: 'client-1',
      record: {
        id: 'person-1',
        do_not_contact: false,
        do_not_email: false,
        do_not_call: false,
        do_not_sms: false,
        preferred_channel: null,
        best_time: null
      }
    }, formStubs)

    try {
      const switches = host.querySelectorAll<HTMLButtonElement>('button[data-enabled]')
      switches[1]?.click()
      await flush()
      switches[2]?.click()
      await flush()
      switches[3]?.click()
      await flush()

      update(host.querySelector('[data-label="Preferred channel"] select') as HTMLSelectElement, 'email')
      await flush()

      const bestTime = host.querySelector('[data-label="Best time"] input') as HTMLInputElement
      update(bestTime, 'mornings')
      bestTime.dispatchEvent(new Event('blur'))
      await flush()

      switches[0]?.click()
      await flush()

      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { do_not_email: true, client_id: 'client-1' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { do_not_call: true, client_id: 'client-1' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { do_not_sms: true, client_id: 'client-1' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { preferred_channel: 'email', client_id: 'client-1' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { best_time: 'mornings', client_id: 'client-1' }
      })
      expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/crm/people/person-1', {
        method: 'PATCH',
        body: { do_not_contact: true, client_id: 'client-1' }
      })
      expect(toastAddMock).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('connects save, close, and every saved-record section through the slideover', () => {
    const saved = vi.fn()
    const closed = vi.fn()
    const child = (name: string) => ({
      props: ['clientId', 'targetType', 'targetId', 'entityType', 'entityId', 'record'],
      template: `<section data-child="${name}" :data-client-id="clientId" :data-record-id="targetId || entityId || record?.id" />`
    })
    const { app, host } = mount(RecordSlideover, {
      'open': true,
      'objectType': 'person',
      'clientId': 'client-1',
      'record': { id: 'person-1', first_name: 'Arman' },
      'onSave': saved,
      'onUpdate:open': closed
    }, {
      USlideover: {
        template: '<aside><slot name="body" /></aside>'
      },
      CrmRecordForm: {
        props: ['objectType', 'clientId', 'record'],
        emits: ['submit', 'cancel'],
        template: '<div data-record-form :data-object-type="objectType" :data-client-id="clientId" :data-record-id="record?.id"><button data-save @click="$emit(\'submit\', { first_name: \'Updated\' })" /><button data-cancel @click="$emit(\'cancel\')" /></div>'
      },
      CrmContactPrefs: child('preferences'),
      CrmScorePanel: child('score'),
      CrmHealthPanel: child('health'),
      CrmRelationshipsPanel: child('relationships'),
      CrmTaskList: child('tasks'),
      CrmMeetingActions: child('meetings'),
      CrmDocuments: child('documents'),
      CrmCommTimeline: child('communications'),
      CrmAuditHistory: child('audit'),
      USeparator: { template: '<hr>' }
    })

    try {
      ;(host.querySelector('[data-save]') as HTMLButtonElement).click()
      ;(host.querySelector('[data-cancel]') as HTMLButtonElement).click()

      expect(saved).toHaveBeenCalledWith({ first_name: 'Updated' })
      expect(closed).toHaveBeenCalledWith(false)
      expect(host.querySelector('[data-record-form]')).toMatchObject({
        dataset: {
          objectType: 'person',
          clientId: 'client-1',
          recordId: 'person-1'
        }
      })
      expect([...host.querySelectorAll<HTMLElement>('[data-child]')].map(node => node.dataset.child)).toEqual([
        'preferences',
        'score',
        'health',
        'relationships',
        'tasks',
        'meetings',
        'documents',
        'communications',
        'audit'
      ])
      for (const section of host.querySelectorAll<HTMLElement>('[data-child]')) {
        expect(section.dataset.clientId).toBe('client-1')
        expect(section.dataset.recordId).toBe('person-1')
      }
    } finally {
      app.unmount()
    }
  })
})
