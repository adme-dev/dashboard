// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, ref, watch } from 'vue'
import ImportModal from '~~/app/components/email/ImportModal.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  computed,
  ref,
  watch,
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

const stubs: Record<string, unknown> = {
  UAlert: {
    name: 'UAlert',
    props: ['title', 'description'],
    template: '<div><slot />{{ title }}{{ description }}</div>'
  },
  UButton: {
    name: 'UButton',
    props: ['label', 'loading'],
    emits: ['click'],
    template: '<button :disabled="loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: {
    name: 'UFormField',
    props: ['label', 'help'],
    template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>'
  },
  UModal: {
    name: 'UModal',
    props: ['open'],
    template: '<div v-if="open"><slot name="content" /></div>'
  },
  USelectMenu: {
    name: 'USelectMenu',
    props: ['items', 'modelValue'],
    emits: ['update:modelValue'],
    template: `
      <select :value="modelValue" @change="$emit('update:modelValue', $event.target.value)">
        <option value="">Select</option>
        <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
    `
  },
  UTextarea: {
    name: 'UTextarea',
    props: ['modelValue', 'placeholder'],
    emits: ['update:modelValue'],
    template: `
      <textarea
        :value="modelValue"
        :placeholder="placeholder"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    `
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
  const app = createApp({ render: () => h(ImportModal, props) })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host }
}

describe('EmailImportModal', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      imported: 2,
      skipped: 2,
      errors: [
        { row: 1, message: 'invalid_email' },
        { row: 4, message: 'duplicate_in_file' },
        { row: 3, message: 'suppressed_or_blocklisted' }
      ],
      review: {
        valid_rows: 2,
        invalid_rows: 1,
        duplicate_rows: 1,
        previously_unsubscribed: 0,
        suppressed: 1,
        blocklisted: 0
      }
    })
  })

  it('shows row-level import errors returned by the backend', async () => {
    const { app, host } = mountModal()
    const select = host.querySelector('select') as HTMLSelectElement
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement
    const importButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Import'))
    const csv = [
      'email,name',
      'bad-email,Bad',
      'a@example.com,Alice',
      'b@example.com,Bob',
      'B@example.com,Duplicate'
    ].join('\n')

    select.value = 'list-1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    textarea.value = csv
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/email/subscribers/import', {
      method: 'POST',
      body: { list_id: 'list-1', csv }
    })
    expect(host.textContent).toContain('Imported 2, skipped 2')
    expect(host.textContent).toContain('Invalid rows')
    expect(host.textContent).toContain('Suppressed')
    expect(host.textContent).toContain('Row 1')
    expect(host.textContent).toContain('Invalid email')
    expect(host.textContent).toContain('Row 4')
    expect(host.textContent).toContain('Duplicate in file')
    expect(host.textContent).toContain('Row 3')
    expect(host.textContent).toContain('Suppressed or blocklisted')

    app.unmount()
  })

  it('surfaces backend validation details when the import body is invalid', async () => {
    fetchMock.mockRejectedValueOnce({
      data: {
        statusMessage: 'invalid_body',
        data: [
          { message: 'list_id is required' },
          { message: 'csv is required' }
        ]
      }
    })

    const { app, host } = mountModal()
    const select = host.querySelector('select') as HTMLSelectElement
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement
    const importButton = Array.from(host.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Import'))

    select.value = 'list-1'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    textarea.value = 'email,name\n'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flush()

    expect(toastAddMock).toHaveBeenCalledWith({
      title: 'Import failed',
      description: 'invalid_body: list_id is required; csv is required',
      color: 'error'
    })

    app.unmount()
  })
})
