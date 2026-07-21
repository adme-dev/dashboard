<script setup lang="ts">
import type {
  WorkspaceMultipartPartResponse,
  WorkspaceMultipartResumeResponse,
  WorkspaceSendPolicySummary,
  WorkspaceSingleUploadIntentResponse,
  WorkspaceMultipartUploadIntentResponse,
  WorkspaceUploadIntentResponse
} from '~~/shared/types/send'

const props = defineProps<{
  transferId: string
  existingFileCount: number
  existingTotalBytes: number
  policy: WorkspaceSendPolicySummary
}>()
const emit = defineEmits<{ uploaded: [] }>()
const apiFetch = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>

type UploadState = 'queued' | 'preparing' | 'uploading' | 'confirming' | 'uploaded' | 'failed' | 'cancelling' | 'cancelled'

interface UploadItem {
  id: string
  file: File
  state: UploadState
  progress: number
  error: string
  idempotencyKey: string
  retryable: boolean
  cancelRequested: boolean
  intent?: WorkspaceUploadIntentResponse
}

const items = ref<UploadItem[]>([])
const requests = new Map<string, XMLHttpRequest>()
const uploading = ref(false)

function readableError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as {
    message?: string
    statusMessage?: string
    data?: { message?: string, statusMessage?: string }
  }
  return candidate.data?.statusMessage
    || candidate.data?.message
    || candidate.statusMessage
    || candidate.message
    || fallback
}

function displaySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function stateLabel(state: UploadState): string {
  return {
    queued: 'Ready',
    preparing: 'Preparing',
    uploading: 'Uploading',
    confirming: 'Confirming',
    uploaded: 'Uploaded',
    failed: 'Needs attention',
    cancelling: 'Cancelling',
    cancelled: 'Cancelled'
  }[state]
}

function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  let queuedCount = props.existingFileCount + items.value.filter(item => item.state !== 'cancelled').length
  let queuedBytes = props.existingTotalBytes + items.value
    .filter(item => item.state !== 'cancelled')
    .reduce((total, item) => total + item.file.size, 0)

  for (const file of selected) {
    const item: UploadItem = {
      id: crypto.randomUUID(),
      file,
      state: 'queued',
      progress: 0,
      error: '',
      idempotencyKey: crypto.randomUUID(),
      retryable: true,
      cancelRequested: false
    }
    if (file.size <= 0) {
      item.state = 'failed'
      item.retryable = false
      item.error = 'Empty files cannot be uploaded.'
    } else if (file.size > props.policy.maxFileBytes) {
      item.state = 'failed'
      item.retryable = false
      item.error = `This file exceeds the per-file limit of ${displaySize(props.policy.maxFileBytes)}.`
    } else if (queuedCount + 1 > props.policy.maxFiles) {
      item.state = 'failed'
      item.retryable = false
      item.error = `This transfer is limited to ${props.policy.maxFiles} files.`
    } else if (queuedBytes + file.size > props.policy.maxTransferBytes) {
      item.state = 'failed'
      item.retryable = false
      item.error = `This file would exceed the transfer limit of ${displaySize(props.policy.maxTransferBytes)}.`
    } else {
      queuedCount += 1
      queuedBytes += file.size
    }
    items.value.push(item)
  }
  input.value = ''
}

function putBody(input: {
  item: UploadItem
  url: string
  body: Blob
  headers?: Record<string, string>
  onProgress(loaded: number, total: number): void
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    requests.set(input.item.id, request)
    request.open('PUT', input.url, true)
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      request.setRequestHeader(name, value)
    }
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      input.onProgress(event.loaded, event.total)
    }
    request.onerror = () => reject(new Error('The upload connection failed. Check your connection and retry.'))
    request.onabort = () => reject(new Error('Upload cancelled.'))
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve()
      else reject(new Error(`Storage rejected the upload (${request.status}). Retry to request a fresh upload link.`))
    }
    request.send(input.body)
  }).finally(() => {
    requests.delete(input.item.id)
  })
}

function putDirectly(item: UploadItem, intent: WorkspaceSingleUploadIntentResponse): Promise<void> {
  return putBody({
    item,
    url: intent.uploadUrl,
    body: item.file,
    headers: intent.requiredHeaders,
    onProgress: (loaded, total) => {
      item.progress = Math.min(99, Math.round((loaded / total) * 100))
    }
  })
}

async function uploadMultipart(item: UploadItem, intent: WorkspaceMultipartUploadIntentResponse) {
  const baseUrl = `/api/agency/send/${props.transferId}/files/${intent.fileId}/intents/${intent.intentId}/multipart`
  const resume = await apiFetch<WorkspaceMultipartResumeResponse>(`${baseUrl}/resume`, {
    method: 'POST',
    body: { capability: intent.capability }
  })
  if (resume.partSizeBytes !== intent.partSizeBytes || resume.partCount !== intent.partCount) {
    throw new Error('The server returned inconsistent multipart upload geometry.')
  }

  const completedParts = new Set(resume.uploadedParts.map(part => part.partNumber))
  let uploadedBytes = resume.uploadedParts.reduce((total, part) => total + part.sizeBytes, 0)
  item.progress = Math.min(99, Math.round((uploadedBytes / item.file.size) * 100))

  for (let partNumber = 1; partNumber <= intent.partCount; partNumber += 1) {
    if (completedParts.has(partNumber)) continue
    if (item.cancelRequested) throw new Error('Upload cancelled.')
    const start = (partNumber - 1) * intent.partSizeBytes
    const end = Math.min(start + intent.partSizeBytes, item.file.size)
    const body = item.file.slice(start, end)
    if (body.size <= 0) throw new Error('The multipart upload geometry exceeds the selected file.')

    const partIntent = await apiFetch<WorkspaceMultipartPartResponse>(`${baseUrl}/parts`, {
      method: 'POST',
      body: { capability: intent.capability, partNumber }
    })
    await putBody({
      item,
      url: partIntent.uploadUrl,
      body,
      onProgress: (loaded) => {
        item.progress = Math.min(99, Math.round(((uploadedBytes + loaded) / item.file.size) * 100))
      }
    })
    uploadedBytes += body.size
  }
}

async function uploadItem(item: UploadItem) {
  if (!['queued', 'failed', 'cancelled'].includes(item.state)) return
  if (item.state === 'cancelled') item.idempotencyKey = crypto.randomUUID()
  item.state = 'preparing'
  item.progress = 0
  item.error = ''
  item.retryable = true
  item.cancelRequested = false
  item.intent = undefined

  try {
    const intent = await apiFetch<WorkspaceUploadIntentResponse>(
      `/api/agency/send/${props.transferId}/files/intents`,
      {
        method: 'POST',
        body: {
          fileName: item.file.name,
          fileSize: item.file.size,
          contentType: item.file.type || 'application/octet-stream',
          idempotencyKey: item.idempotencyKey
        }
      }
    )
    item.intent = intent
    if (item.cancelRequested) {
      item.state = 'cancelling'
      try {
        await abortServerIntent(intent)
        item.intent = undefined
        item.state = 'cancelled'
      } catch (error) {
        item.state = 'failed'
        item.retryable = true
        item.error = readableError(error, 'The server could not confirm cancellation. Retry or refresh.')
      }
      return
    }
    item.state = 'uploading'
    if (intent.uploadMethod === 'multipart') await uploadMultipart(item, intent)
    else await putDirectly(item, intent)
    item.state = 'confirming'
    item.progress = 100
    await apiFetch(
      `/api/agency/send/${props.transferId}/files/${intent.fileId}/intents/${intent.intentId}/complete`,
      { method: 'POST', body: { capability: intent.capability } }
    )
    item.state = 'uploaded'
    item.intent = undefined
    emit('uploaded')
  } catch (error) {
    if (item.state === 'cancelling' || item.state === 'cancelled') return
    item.state = 'failed'
    item.retryable = true
    item.error = readableError(error, 'The file could not be uploaded. Retry to request a fresh upload link.')
  }
}

async function uploadAll() {
  uploading.value = true
  try {
    await Promise.all(items.value
      .filter(item => item.state === 'queued')
      .map(item => uploadItem(item)))
  } finally {
    uploading.value = false
  }
}

async function cancelUpload(item: UploadItem) {
  if (!['preparing', 'uploading', 'confirming'].includes(item.state)) return
  item.state = 'cancelling'
  item.cancelRequested = true
  requests.get(item.id)?.abort()
  const intent = item.intent
  if (intent) {
    try {
      await abortServerIntent(intent)
    } catch (error) {
      item.state = 'failed'
      item.error = readableError(error, 'The upload stopped locally, but server cancellation could not be confirmed. Retry or refresh.')
      return
    }
  }
  item.intent = undefined
  item.state = 'cancelled'
  item.error = ''
}

async function abortServerIntent(intent: WorkspaceUploadIntentResponse): Promise<void> {
  await apiFetch(
    `/api/agency/send/${props.transferId}/files/${intent.fileId}/intents/${intent.intentId}/abort`,
    { method: 'POST', body: { capability: intent.capability } }
  )
}
</script>

<template>
  <section class="mt-4 rounded-xl border border-default bg-muted/20 p-4" aria-label="Transfer files">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 class="font-medium text-highlighted">
          Add files
        </h3>
        <p class="mt-1 text-xs text-muted">
          Files upload directly to private storage and are verified before delivery.
        </p>
      </div>
      <label class="cursor-pointer rounded-lg border border-default bg-default px-3 py-2 text-sm font-medium hover:bg-elevated">
        Choose files
        <input
          type="file"
          multiple
          class="sr-only"
          data-testid="send-file-input"
          @change="onFilesSelected"
        >
      </label>
    </div>

    <ul v-if="items.length" class="mt-4 space-y-3" aria-live="polite">
      <li v-for="item in items" :key="item.id" class="rounded-lg border border-default bg-default p-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-highlighted">
              {{ item.file.name }}
            </p>
            <p class="mt-0.5 text-xs text-muted">
              {{ displaySize(item.file.size) }} · {{ stateLabel(item.state) }}
            </p>
          </div>
          <div class="flex shrink-0 gap-2">
            <button
              v-if="['preparing', 'uploading', 'confirming'].includes(item.state)"
              type="button"
              class="text-xs font-medium text-error hover:underline"
              data-testid="cancel-send-upload"
              @click="cancelUpload(item)"
            >
              Cancel
            </button>
            <button
              v-else-if="item.state === 'cancelled' || (item.state === 'failed' && item.retryable)"
              type="button"
              class="text-xs font-medium text-primary hover:underline"
              data-testid="retry-send-upload"
              @click="uploadItem(item)"
            >
              Retry
            </button>
          </div>
        </div>
        <div v-if="['uploading', 'confirming', 'uploaded'].includes(item.state)" class="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated">
          <div class="h-full rounded-full bg-primary transition-[width]" :style="{ width: `${item.progress}%` }" />
        </div>
        <p v-if="item.error" role="alert" class="mt-2 text-xs text-error">
          {{ item.error }}
        </p>
      </li>
    </ul>

    <button
      v-if="items.some(item => item.state === 'queued')"
      type="button"
      class="mt-4 w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      :disabled="uploading"
      data-testid="send-upload-all"
      @click="uploadAll"
    >
      Upload ready files
    </button>
  </section>
</template>
