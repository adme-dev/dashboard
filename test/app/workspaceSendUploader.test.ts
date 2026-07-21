// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import WorkspaceSendUploader from '~~/app/components/send/WorkspaceSendUploader.vue'

Object.assign(globalThis, { ref })

class FakeRequest {
  static instances: FakeRequest[] = []
  method = ''
  url = ''
  status = 200
  headers: Record<string, string> = {}
  body: unknown
  aborted = false
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null

  constructor() { FakeRequest.instances.push(this) }

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string) { this.headers[name] = value }

  send(body: unknown) {
    this.body = body
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent)
      this.onload?.()
    })
  }

  abort() {
    this.aborted = true
    this.onabort?.()
  }
}

const successfulSend = FakeRequest.prototype.send

const policy = {
  defaultRetentionDays: 7,
  maxRetentionDays: 30,
  maxRecipients: 20,
  maxDownloads: 100,
  maxTransferBytes: 10_000,
  maxFileBytes: 8_000,
  maxFiles: 5
}

async function flushUi() {
  for (let index = 0; index < 10; index += 1) {
    await Promise.resolve()
    await nextTick()
  }
}

function mountUploader(fetchMock: ReturnType<typeof vi.fn>) {
  ;(globalThis as { $fetch?: unknown }).$fetch = fetchMock
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(WorkspaceSendUploader, {
      transferId: '44444444-4444-4444-8444-444444444444',
      existingFileCount: 0,
      existingTotalBytes: 0,
      policy
    })
  })
  app.mount(host)
  return { app, host }
}

function selectFile(host: HTMLElement, file: File) {
  const input = host.querySelector<HTMLInputElement>('[data-testid="send-file-input"]')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('WorkspaceSendUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    FakeRequest.instances = []
    FakeRequest.prototype.send = successfulSend
    ;(globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeRequest
    ;(globalThis.crypto as { randomUUID?: () => string }).randomUUID = vi.fn(() => '77777777-7777-4777-8777-777777777777')
  })

  it('uploads bytes directly to the signed R2 URL, reports progress, then confirms', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/files/intents')) {
        return {
          fileId: '55555555-5555-4555-8555-555555555555',
          intentId: '66666666-6666-4666-8666-666666666666',
          uploadUrl: 'https://example.r2.cloudflarestorage.com/signed',
          capability: 'c'.repeat(43),
          requiredHeaders: { 'Content-Type': 'application/pdf' },
          expiresAt: '2026-07-21T00:15:00.000Z'
        }
      }
      return { file: { id: 'file-1', state: 'uploaded' } }
    })
    const { app, host } = mountUploader(fetchMock)
    selectFile(host, new File(['0123456789'], 'brief.pdf', { type: 'application/pdf' }))
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="send-upload-all"]')!.click()
    await flushUi()

    const request = FakeRequest.instances[0]!
    expect(request.method).toBe('PUT')
    expect(request.url).toBe('https://example.r2.cloudflarestorage.com/signed')
    expect(request.headers).toEqual({ 'Content-Type': 'application/pdf' })
    expect(request.body).toBeInstanceOf(File)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/complete'), expect.objectContaining({
      method: 'POST', body: { capability: 'c'.repeat(43) }
    }))
    expect(host.textContent).toContain('Uploaded')
    expect(host.textContent).not.toContain('cloudflarestorage.com')
    app.unmount()
    host.remove()
  })

  it('aborts the browser request and consumes the server intent when cancelled', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/files/intents')) {
        return {
          fileId: '55555555-5555-4555-8555-555555555555',
          intentId: '66666666-6666-4666-8666-666666666666',
          uploadUrl: 'https://example.r2.cloudflarestorage.com/signed',
          capability: 'c'.repeat(43),
          requiredHeaders: { 'Content-Type': 'application/pdf' },
          expiresAt: '2026-07-21T00:15:00.000Z'
        }
      }
      return { aborted: true }
    })
    FakeRequest.prototype.send = function (body: unknown) {
      this.body = body
    }
    const { app, host } = mountUploader(fetchMock)
    selectFile(host, new File(['0123456789'], 'brief.pdf', { type: 'application/pdf' }))
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="send-upload-all"]')!.click()
    await flushUi()
    host.querySelector<HTMLButtonElement>('[data-testid="cancel-send-upload"]')!.click()
    await flushUi()

    expect(FakeRequest.instances[0]?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/abort'), expect.objectContaining({ method: 'POST' }))
    expect(host.textContent).toContain('Cancelled')
    app.unmount()
    host.remove()
  })

  it('shows an actionable local error without creating an intent for an oversized file', async () => {
    const fetchMock = vi.fn()
    const { app, host } = mountUploader(fetchMock)
    selectFile(host, new File([new Uint8Array(8_001)], 'too-large.bin', { type: 'application/octet-stream' }))
    await flushUi()

    expect(host.getAttribute('data-v-app')).not.toBeNull()
    expect(host.textContent).toContain('exceeds the per-file limit')
    expect(fetchMock).not.toHaveBeenCalled()
    app.unmount()
    host.remove()
  })
})
