// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, reactive, ref, toRef, computed, inject, watchEffect } from 'vue'
import ContactPrefs from '~~/app/components/crm/ContactPrefs.vue'
import RecordForm from '~~/app/components/crm/RecordForm.vue'
import RecordSlideover from '~~/app/components/crm/RecordSlideover.vue'

Object.assign(globalThis, {
  computed,
  inject,
  reactive,
  ref,
  toRef,
  watchEffect,
  LIFECYCLE_STAGES: ['lead', 'customer'],
  lifecycleLabel: (stage: string) => stage,
  useCrmCustomFields: () => ({ fields: ref([]) }),
  useToast: () => ({ add: vi.fn() }),
  $fetch: vi.fn()
})

const fieldStubs = {
  UFormField: {
    props: ['label'],
    template: '<label><span>{{ label }}</span><slot /></label>'
  },
  UInput: {
    inheritAttrs: false,
    template: '<input v-bind="$attrs">'
  },
  UInputTags: {
    inheritAttrs: false,
    template: '<input v-bind="$attrs">'
  },
  USelect: {
    inheritAttrs: false,
    template: '<select v-bind="$attrs" />'
  },
  USelectMenu: {
    inheritAttrs: false,
    template: '<select v-bind="$attrs" />'
  },
  UCheckbox: {
    inheritAttrs: false,
    template: '<input type="checkbox" v-bind="$attrs">'
  },
  UButton: {
    template: '<button><slot /></button>'
  },
  USeparator: {
    template: '<hr>'
  },
  UBadge: {
    template: '<span><slot /></span>'
  },
  USwitch: {
    template: '<button type="button" />'
  },
  CrmOwnerSelect: {
    template: '<div />'
  }
}

function mount(component: unknown, props: Record<string, unknown>, stubs: Record<string, unknown> = fieldStubs) {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(component as never, props) })
  Object.entries(stubs).forEach(([name, stub]) => app.component(name, stub as never))
  app.mount(host)
  return { app, host }
}

describe('CRM record editor layout', () => {
  it('gives the record slideover enough width for data-heavy forms', () => {
    const { app, host } = mount(RecordSlideover, {
      open: true,
      objectType: 'person',
      clientId: 'client-1',
      record: null
    }, {
      USlideover: {
        props: ['ui'],
        template: '<aside :data-content-class="ui?.content"><slot name="body" /></aside>'
      },
      CrmRecordForm: {
        template: '<form />'
      },
      CrmContactPrefs: { template: '<div />' },
      CrmScorePanel: { template: '<div />' },
      CrmHealthPanel: { template: '<div />' },
      CrmRelationshipsPanel: { template: '<div />' },
      CrmTaskList: { template: '<div />' },
      CrmMeetingActions: { template: '<div />' },
      CrmDocuments: { template: '<div />' },
      CrmCommTimeline: { template: '<div />' },
      CrmAuditHistory: { template: '<div />' },
      USeparator: { template: '<hr>' }
    })

    try {
      expect(host.querySelector('aside')?.getAttribute('data-content-class')).toBe('sm:max-w-xl')
    } finally {
      app.unmount()
    }
  })

  it('adapts record fields to the available panel width', () => {
    Object.assign(globalThis, {
      useCrmCustomFields: () => ({
        fields: ref([{
          id: 'field-1',
          key: 'lead_source',
          label: 'Lead source',
          field_type: 'dropdown',
          options: ['Website', 'Referral']
        }])
      })
    })
    const { app, host } = mount(RecordForm, {
      objectType: 'person',
      clientId: 'client-1',
      record: null
    })

    try {
      const form = host.querySelector('form')
      expect(form?.classList.contains('@container')).toBe(true)
      expect(host.querySelectorAll('.grid.grid-cols-1.gap-4.\\@lg\\:grid-cols-2')).toHaveLength(3)
      expect(host.querySelector('.\\@lg\\:col-span-2')).not.toBeNull()
      expect(host.querySelectorAll('input.w-full, select.w-full')).toHaveLength(11)
      expect(host.querySelector('.grid.grid-cols-2.gap-4')).toBeNull()
    } finally {
      app.unmount()
      Object.assign(globalThis, {
        useCrmCustomFields: () => ({ fields: ref([]) })
      })
    }
  })

  it('keeps contact preference fields readable at narrow panel widths', () => {
    const { app, host } = mount(ContactPrefs, {
      clientId: 'client-1',
      record: { id: 'person-1' }
    })

    try {
      expect(host.firstElementChild?.classList.contains('@container')).toBe(true)
      expect(host.querySelector('.grid.grid-cols-1.gap-4.\\@md\\:grid-cols-2')).not.toBeNull()
      expect(host.querySelectorAll('select.w-full, input.w-full')).toHaveLength(2)
      expect(host.querySelector('.grid.grid-cols-2.gap-3')).toBeNull()
    } finally {
      app.unmount()
    }
  })
})
