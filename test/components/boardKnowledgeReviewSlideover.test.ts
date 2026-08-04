// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import BoardKnowledgeReviewSlideover from '~~/app/components/board/knowledge/BoardKnowledgeReviewSlideover.vue'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const SUBMISSION_ID = '22222222-2222-4222-8222-222222222222'
const fetchMock = vi.fn()
const toastAddMock = vi.fn()

Object.assign(globalThis, {
  $fetch: (...args: unknown[]) => fetchMock(...args),
  useToast: () => ({ add: toastAddMock })
})

function reviewDetail() {
  return {
    submission: {
      id: SUBMISSION_ID,
      departmentId: BOARD_ID,
      sourceType: 'task_attachment',
      sourceId: 'attachment-1',
      sourceFileName: 'Bookkeeper instruction.pdf',
      sourceMimeType: 'application/pdf',
      sourceSize: 4096,
      sourceVersionKey: 'sha256:version',
      sourceChecksumSha256: 'a'.repeat(64),
      sourceDeletedAt: null,
      submittedBy: 'user-1',
      submittedAt: '2026-08-04T01:00:00.000Z',
      reviewStatus: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewReason: null,
      extractionStatus: 'ready',
      extractionMethod: 'gemini',
      extractionProvider: 'google-ai-studio',
      extractionModel: 'gemini-3.6-flash',
      extractionStartedAt: '2026-08-04T01:01:00.000Z',
      extractionCompletedAt: '2026-08-04T01:02:00.000Z',
      extractionMetrics: { pages: 8, characters: 24560, chunks: 18 },
      extractionWarnings: ['OCR_USED', 'LOW_TEXT_DENSITY'],
      extractionErrorCode: null,
      extractionErrorMessage: null,
      indexStatus: 'not_indexed',
      aiKnowledgeArticleId: 'article-1',
      createdAt: '2026-08-04T01:00:00.000Z',
      updatedAt: '2026-08-04T01:02:00.000Z'
    },
    context: {
      boardName: 'Finance',
      task: { id: 'task-1', title: 'Reference PDFs' },
      submittedBy: { id: 'user-1', name: 'Clara', email: 'clara@adme.net.au' }
    },
    preview: {
      chunks: [{
        chunkIndex: 0,
        content: `Opening cash position ${'x'.repeat(22_000)} tail-marker`,
        heading: 'Cash position',
        pageStart: 2,
        pageEnd: 2,
        sheetName: null,
        slideNumber: null
      }],
      totalChunks: 18,
      truncated: true
    },
    history: [{
      action: 'extraction_success',
      actorName: null,
      createdAt: '2026-08-04T01:02:00.000Z'
    }]
  }
}

const stubs: Record<string, unknown> = {
  USlideover: {
    props: ['open', 'title', 'description'],
    emits: ['update:open'],
    template: '<section v-if="open"><slot name="content" /><slot /></section>'
  },
  UModal: {
    props: ['open'],
    emits: ['update:open'],
    template: '<div v-if="open" data-testid="rejection-modal"><slot name="content" /></div>'
  },
  UButton: {
    props: ['label', 'loading', 'disabled', 'ariaLabel'],
    emits: ['click'],
    template: '<button :aria-label="ariaLabel" :disabled="disabled || loading" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>'
  },
  UBadge: { props: ['label'], template: '<span><slot />{{ label }}</span>' },
  UAlert: { props: ['title', 'description'], template: '<div><strong>{{ title }}</strong><p>{{ description }}</p><slot /></div>' },
  UFormField: { props: ['label', 'help', 'error'], template: '<label><span>{{ label }}</span><slot /><small>{{ help }}{{ error }}</small></label>' },
  UTextarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  USkeleton: { template: '<span>Loading review</span>' }
}

async function flush() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function mountSlideover(options: { canReview?: boolean, returnFocus?: HTMLElement } = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const open = ref(true)
  const changed = vi.fn()
  const app = createApp({
    render: () => h(BoardKnowledgeReviewSlideover, {
      'open': open.value,
      'boardId': BOARD_ID,
      'submissionId': SUBMISSION_ID,
      'canReview': options.canReview ?? true,
      'returnFocus': options.returnFocus,
      'onUpdate:open': (value: boolean) => { open.value = value },
      'onChanged': changed
    })
  })
  Object.entries(stubs).forEach(([name, component]) => app.component(name, component as never))
  app.mount(host)
  return { app, host, changed, open }
}

function buttonByText(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button as HTMLButtonElement
}

describe('BoardKnowledgeReviewSlideover', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') return structuredClone(reviewDetail())
      return { accepted: true, queued: true, submission: reviewDetail().submission }
    })
  })

  it('shows bounded preview, provenance, extraction quality, and history without management actions', async () => {
    const { app, host } = mountSlideover({ canReview: false })
    await flush()

    expect(host.textContent).toContain('Bookkeeper instruction.pdf')
    expect(host.textContent).toContain('Finance')
    expect(host.textContent).toContain('Reference PDFs')
    expect(host.textContent).toContain('Clara')
    expect(host.textContent).toContain('Gemini')
    expect(host.textContent).toContain('8 pages')
    expect(host.textContent).toContain('24,560 characters')
    expect(host.textContent).toContain('Page 2')
    expect(host.textContent).toContain('OCR used')
    expect(host.textContent).toContain('Preview truncated')
    expect(host.textContent).not.toContain('tail-marker')
    expect(host.textContent).toContain('Extraction completed')
    expect(host.textContent).not.toContain('Approve')
    expect(host.textContent).not.toContain('Reject')
    app.unmount()
  })

  it('approves with optimistic concurrency and reports the mutation', async () => {
    const { app, host, changed } = mountSlideover()
    await flush()

    buttonByText(host, 'Approve').click()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agency/boards/${BOARD_ID}/knowledge/${SUBMISSION_ID}/approve`,
      {
        method: 'POST',
        body: { expectedUpdatedAt: '2026-08-04T01:02:00.000Z' }
      }
    )
    expect(changed).toHaveBeenCalledOnce()
    app.unmount()
  })

  it('requires a bounded rejection reason and submits it through the modal', async () => {
    const { app, host } = mountSlideover()
    await flush()

    buttonByText(host, 'Reject').click()
    await nextTick()
    const submit = buttonByText(host, 'Reject submission')
    expect(submit.disabled).toBe(true)

    const textarea = host.querySelector('textarea') as HTMLTextAreaElement
    textarea.value = 'Totals conflict with the signed report.'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    buttonByText(host, 'Reject submission').click()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agency/boards/${BOARD_ID}/knowledge/${SUBMISSION_ID}/reject`,
      {
        method: 'POST',
        body: {
          expectedUpdatedAt: '2026-08-04T01:02:00.000Z',
          reason: 'Totals conflict with the signed report.'
        }
      }
    )
    app.unmount()
  })

  it.each([
    ['failed', 'pending', 'Retry extraction', 'retry'],
    ['ready', 'approved', 'Archive', 'archive']
  ] as const)('offers the valid %s/%s lifecycle action', async (extractionStatus, reviewStatus, label, action) => {
    const state = reviewDetail()
    state.submission.extractionStatus = extractionStatus
    state.submission.reviewStatus = reviewStatus
    state.submission.indexStatus = reviewStatus === 'approved' ? 'indexed' : 'not_indexed'
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') return structuredClone(state)
      return { accepted: true, queued: true, submission: state.submission }
    })
    const { app, host } = mountSlideover()
    await flush()

    buttonByText(host, label).click()
    await flush()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agency/boards/${BOARD_ID}/knowledge/${SUBMISSION_ID}/${action}`,
      expect.objectContaining({ method: 'POST' })
    )
    app.unmount()
  })

  it('reloads stale state, shows an error toast, and returns focus when closed', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    let detailLoads = 0
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') {
        detailLoads += 1
        return structuredClone(reviewDetail())
      }
      throw Object.assign(new Error('stale'), { statusCode: 409 })
    })
    const { app, host, open } = mountSlideover({ returnFocus: trigger })
    await flush()

    buttonByText(host, 'Approve').click()
    await flush()
    expect(detailLoads).toBe(2)
    expect(toastAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review state changed', color: 'warning' }))

    ;(host.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click()
    await flush()
    expect(open.value).toBe(false)
    expect(document.activeElement).toBe(trigger)
    app.unmount()
  })

  it('shows a recoverable toast when an action fails', async () => {
    fetchMock.mockImplementation(async (_url: string, options?: { method?: string }) => {
      if (!options?.method || options.method === 'GET') return structuredClone(reviewDetail())
      throw new Error('offline')
    })
    const { app, host } = mountSlideover()
    await flush()

    buttonByText(host, 'Approve').click()
    await flush()
    expect(toastAddMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Review action failed', color: 'error' }))
    app.unmount()
  })
})
