// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import BoardFilesView from '~~/app/components/board/views/BoardFilesView.vue'

const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

const response = {
  files: [
    {
      id: 'board-file-1',
      boardId: 'board-1',
      scope: 'board',
      fileName: 'Cashflow policy.pdf',
      fileUrl: '/api/agency/boards/board-1/files/board-file-1/download',
      fileType: 'application/pdf',
      fileSize: 2048,
      category: 'policy',
      description: 'Approved procedure',
      source: 'xeroflow',
      sourceReference: null,
      createdAt: '2026-08-04T00:00:00.000Z',
      uploadedBy: { id: 'user-1', name: 'Clara', email: 'clara@adme.net.au' },
      canDelete: true,
      task: null
    },
    {
      id: 'task-file-1',
      boardId: 'board-1',
      scope: 'task',
      fileName: 'Bookkeeper instruction.pdf',
      fileUrl: '/download/instruction',
      fileType: 'application/pdf',
      fileSize: 4096,
      category: 'evidence',
      description: null,
      source: 'monday',
      sourceReference: 'asset-1',
      createdAt: '2026-08-03T00:00:00.000Z',
      uploadedBy: null,
      canDelete: false,
      task: { id: 'task-1', title: 'Reference PDFs' }
    }
  ],
  summary: { total: 2, boardDocuments: 1, taskEvidence: 1 }
}

const stubs: Record<string, unknown> = {
  UAlert: { props: ['title', 'description'], template: '<section><strong>{{ title }}</strong><p>{{ description }}</p><slot /><slot name="actions" /></section>' },
  UBadge: { props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UButton: {
    props: ['label', 'href', 'loading', 'disabled', 'ariaLabel'],
    emits: ['click'],
    template: '<a v-if="href" :href="href" :aria-label="ariaLabel"><slot />{{ label }}</a><button v-else :aria-label="ariaLabel" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UFormField: { props: ['label', 'help'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}</small></label>' },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UInput: {
    props: ['modelValue', 'placeholder', 'type', 'accept'],
    emits: ['update:modelValue', 'change'],
    template: '<input :type="type || \'text\'" :value="modelValue" :placeholder="placeholder" :accept="accept" @input="$emit(\'update:modelValue\', $event.target.value)" @change="$emit(\'change\', $event)" />'
  },
  UModal: { props: ['open'], template: '<div v-if="open"><slot name="content" /></div>' },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>'
  },
  USkeleton: { template: '<span>Loading</span>' },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UTooltip: { template: '<span><slot /></span>' }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountView() {
  const events: string[] = []
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(BoardFilesView, {
      boardId: 'board-1',
      onOpenTask: (taskId: string) => events.push(taskId)
    })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host, events }
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button as HTMLButtonElement
}

describe('BoardFilesView', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') return structuredClone(response)
      if (options.method === 'POST') return { id: 'new-file' }
      if (options.method === 'DELETE') return { success: true }
      throw new Error('Unexpected request')
    })
  })

  it('renders board documents and task evidence with their summary', async () => {
    const { app, host } = mountView()
    await flush()

    expect(host.textContent).toContain('2 files')
    expect(host.textContent).toContain('1 board document')
    expect(host.textContent).toContain('1 task attachment')
    expect(host.textContent).toContain('Cashflow policy.pdf')
    expect(host.textContent).toContain('Bookkeeper instruction.pdf')
    app.unmount()
  })

  it('opens the related task without treating task evidence as a board upload', async () => {
    const { app, host, events } = mountView()
    await flush()

    buttonByText(host, 'Reference PDFs').click()
    await nextTick()
    expect(events).toEqual(['task-1'])
    app.unmount()
  })

  it('uploads a board-wide file with category and description then refreshes', async () => {
    const { app, host } = mountView()
    await flush()
    buttonByText(host, 'Upload board file').click()
    await nextTick()

    const input = host.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['%PDF-new'], 'new-policy.pdf', { type: 'application/pdf' })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    const description = host.querySelector('textarea') as HTMLTextAreaElement
    description.value = 'New policy'
    description.dispatchEvent(new Event('input', { bubbles: true }))
    buttonByText(host, 'Upload file').click()
    await flush()

    const post = fetchMock.mock.calls.find(call => call[1]?.method === 'POST')
    expect(post?.[0]).toBe('/api/agency/boards/board-1/files')
    expect(post?.[1].body).toBeInstanceOf(FormData)
    expect(post?.[1].body.get('file')).toMatchObject({ name: 'new-policy.pdf', type: 'application/pdf' })
    expect(post?.[1].body.get('category')).toBe('reference')
    expect(post?.[1].body.get('description')).toBe('New policy')
    expect(toastAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Board file uploaded', color: 'success' }))
    app.unmount()
  })

  it('confirms board-file deletion and never offers task evidence deletion', async () => {
    const { app, host } = mountView()
    await flush()

    expect(host.querySelectorAll('button[aria-label="Delete file"]')).toHaveLength(1)
    ;(host.querySelector('button[aria-label="Delete file"]') as HTMLButtonElement).click()
    await nextTick()
    buttonByText(host, 'Delete board file').click()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agency/boards/board-1/files/board-file-1',
      { method: 'DELETE' }
    )
    app.unmount()
  })

  it('shows a recoverable error when the library cannot load', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const { app, host } = mountView()
    await flush()

    expect(host.textContent).toContain('Files could not be loaded')
    expect(host.textContent).toContain('Try again')
    app.unmount()
  })
})
