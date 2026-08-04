<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { BoardKnowledgePreviewChunk } from '~/types'
import { boardKnowledgeApiError, boardKnowledgeApiStatus, useBoardKnowledge } from '~/composables/useBoardKnowledge'

const MAX_PREVIEW_CHARACTERS = 20_000

const props = defineProps<{
  open: boolean
  boardId: string
  submissionId: string | null
  canReview: boolean
  returnFocus?: HTMLElement
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'changed': []
}>()
const toast = useToast()
const {
  detail,
  detailLoading,
  detailError,
  pendingAction,
  loadDetail,
  transition
} = useBoardKnowledge(() => props.boardId)

const rejectionOpen = ref(false)
const rejectionReason = ref('')

const submission = computed(() => detail.value?.submission || null)
const canApproveOrReject = computed(() => props.canReview
  && submission.value?.reviewStatus === 'pending'
  && submission.value.extractionStatus === 'ready'
  && submission.value.indexStatus === 'not_indexed')
const canRetry = computed(() => props.canReview
  && ((submission.value?.reviewStatus === 'pending'
    && submission.value.extractionStatus === 'failed'
    && submission.value.indexStatus !== 'indexing')
  || (submission.value?.reviewStatus === 'approved'
    && submission.value.extractionStatus === 'ready'
    && submission.value.indexStatus === 'failed')))
const retryIsIndexing = computed(() => submission.value?.reviewStatus === 'approved'
  && submission.value.indexStatus === 'failed')
const canArchive = computed(() => props.canReview
  && Boolean(submission.value)
  && submission.value?.reviewStatus !== 'archived'
  && submission.value?.extractionStatus !== 'processing'
  && submission.value?.indexStatus !== 'indexing')
const validRejectionReason = computed(() => {
  const length = rejectionReason.value.trim().length
  return length > 0 && length <= 2000
})

const previewChunks = computed(() => {
  let remaining = MAX_PREVIEW_CHARACTERS
  const chunks: BoardKnowledgePreviewChunk[] = []
  for (const chunk of detail.value?.preview.chunks || []) {
    if (remaining <= 0) break
    const content = chunk.content.slice(0, remaining)
    chunks.push({ ...chunk, content })
    remaining -= content.length
  }
  return chunks
})
const previewTruncated = computed(() => {
  const suppliedCharacters = (detail.value?.preview.chunks || [])
    .reduce((total, chunk) => total + chunk.content.length, 0)
  return Boolean(detail.value?.preview.truncated || suppliedCharacters > MAX_PREVIEW_CHARACTERS)
})
const metricEntries = computed(() => {
  const metrics = submission.value?.extractionMetrics || {}
  return (['pages', 'sheets', 'slides', 'characters', 'chunks'] as const)
    .flatMap((key) => {
      const value = Number(metrics[key])
      return Number.isFinite(value) && value >= 0 ? [{ key, value }] : []
    })
})

function close() {
  emit('update:open', false)
  void nextTick(() => props.returnFocus?.focus())
}

function handleOpenChange(value: boolean) {
  if (!value) close()
}

function openRejection() {
  rejectionReason.value = ''
  rejectionOpen.value = true
}

function closeRejection() {
  rejectionOpen.value = false
  rejectionReason.value = ''
}

async function reload() {
  if (!props.submissionId) return
  try {
    await loadDetail(props.submissionId)
  } catch {
    // The inline recoverable error state is populated by the composable.
  }
}

async function perform(action: 'approve' | 'reject' | 'retry' | 'archive', reason?: string) {
  if (!submission.value) return
  try {
    await transition(submission.value, action, { reason })
    closeRejection()
    emit('changed')
    await reload()
    toast.add({
      title: action === 'approve'
        ? 'Knowledge approved'
        : action === 'reject'
          ? 'Knowledge rejected'
          : action === 'retry'
            ? retryIsIndexing.value ? 'Indexing queued' : 'Extraction queued'
            : 'Knowledge archived',
      color: 'success'
    })
  } catch (error) {
    if (boardKnowledgeApiStatus(error) === 409) {
      toast.add({
        title: 'Review state changed',
        description: 'The latest review state has been reloaded. Check it before trying again.',
        color: 'warning'
      })
      await reload()
      return
    }
    toast.add({
      title: 'Review action failed',
      description: boardKnowledgeApiError(error, 'The review action could not be completed.'),
      color: 'error'
    })
  }
}

function formatDate(value: string | null) {
  if (!value) return 'Not recorded'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value))
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function formatMetric(key: string, value: number) {
  const singular = key.endsWith('s') ? key.slice(0, -1) : key
  const label = value === 1 ? singular : key
  return `${new Intl.NumberFormat('en-AU').format(value)} ${label}`
}

function humanize(value: string) {
  if (value === 'OCR_USED') return 'OCR used'
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, character => character.toUpperCase())
}

function extractionLabel() {
  if (!submission.value?.extractionMethod) return 'Not available'
  const method = submission.value.extractionMethod === 'gemini'
    ? 'Gemini'
    : submission.value.extractionMethod === 'huggingface'
      ? 'Hugging Face'
      : 'Native extraction'
  const provenance = [submission.value.extractionProvider, submission.value.extractionModel].filter(Boolean).join(' · ')
  return provenance ? `${method} · ${provenance}` : method
}

function chunkProvenance(chunk: BoardKnowledgePreviewChunk) {
  const parts = [chunk.heading]
  if (chunk.pageStart) {
    parts.push(chunk.pageEnd && chunk.pageEnd !== chunk.pageStart
      ? `Pages ${chunk.pageStart}–${chunk.pageEnd}`
      : `Page ${chunk.pageStart}`)
  }
  if (chunk.sheetName) parts.push(`Sheet ${chunk.sheetName}`)
  if (chunk.slideNumber) parts.push(`Slide ${chunk.slideNumber}`)
  return parts.filter(Boolean).join(' · ') || `Passage ${chunk.chunkIndex + 1}`
}

function historyLabel(action: string) {
  const labels: Record<string, string> = {
    submit: 'Submitted for extraction',
    extraction_start: 'Extraction started',
    extraction_success: 'Extraction completed',
    extraction_failure: 'Extraction failed',
    retry: 'Extraction retried',
    approve: 'Approved for AI',
    reject: 'Rejected',
    archive: 'Archived',
    index_success: 'Added to AI retrieval',
    index_failure: 'Indexing failed',
    deindex: 'Removed from AI retrieval'
  }
  return labels[action] || humanize(action)
}

watch(
  () => [props.open, props.submissionId] as const,
  ([open, submissionId]) => {
    if (open && submissionId) void reload()
  },
  { immediate: true }
)
</script>

<template>
  <USlideover
    :open="open"
    title="Knowledge review"
    description="Verify the extracted source before it can be used by AI."
    :ui="{ content: 'w-full max-w-2xl' }"
    @update:open="handleOpenChange"
  >
    <template #content>
      <div class="flex h-full flex-col bg-default">
        <header class="flex items-start justify-between gap-4 border-b border-default px-5 py-4">
          <div class="min-w-0">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">
              Knowledge review
            </p>
            <h2 class="mt-1 truncate text-base font-semibold text-highlighted">
              {{ submission?.sourceFileName || 'Loading source…' }}
            </h2>
          </div>
          <UButton
            aria-label="Close"
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            @click="close"
          />
        </header>

        <div
          v-if="detailLoading && !detail"
          class="space-y-3 p-5"
          aria-busy="true"
          aria-label="Loading knowledge review"
        >
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-40 w-full" />
          <USkeleton class="h-28 w-full" />
        </div>

        <div v-else-if="detailError && !detail" class="p-5">
          <UAlert
            title="Review could not be loaded"
            :description="detailError"
            color="error"
            icon="i-lucide-circle-alert"
            variant="subtle"
          >
            <template #actions>
              <UButton
                label="Try again"
                color="error"
                variant="soft"
                size="sm"
                @click="reload"
              />
            </template>
          </UAlert>
        </div>

        <div v-else-if="detail" class="flex-1 space-y-6 overflow-y-auto p-5">
          <section aria-labelledby="knowledge-source-heading">
            <div class="flex flex-wrap items-center gap-2">
              <h3 id="knowledge-source-heading" class="text-sm font-semibold text-highlighted">
                Source and status
              </h3>
              <UBadge
                :label="submission?.reviewStatus"
                color="neutral"
                variant="subtle"
                size="sm"
              />
              <UBadge
                :label="submission?.extractionStatus"
                color="neutral"
                variant="outline"
                size="sm"
              />
            </div>
            <dl class="mt-3 space-y-2 rounded-lg border border-default bg-elevated/40 p-4 text-sm">
              <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Board
                </dt><dd class="font-medium text-highlighted">
                  {{ detail.context.boardName }}
                </dd>
              </div>
              <div v-if="detail.context.task" class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Related task
                </dt><dd class="font-medium text-highlighted">
                  {{ detail.context.task.title }}
                </dd>
              </div>
              <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Submitted by
                </dt><dd class="font-medium text-highlighted">
                  {{ detail.context.submittedBy?.name || 'Unknown user' }}
                </dd>
              </div>
              <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Submitted
                </dt><dd class="text-highlighted">
                  {{ formatDate(submission?.submittedAt || null) }}
                </dd>
              </div>
              <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  File
                </dt><dd class="text-right text-highlighted">
                  {{ formatFileSize(submission?.sourceSize || 0) }} · {{ submission?.sourceMimeType }}
                </dd>
              </div>
              <div v-if="submission?.sourceChecksumSha256" class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Checksum
                </dt><dd class="max-w-full break-all font-mono text-xs text-highlighted">
                  {{ submission.sourceChecksumSha256 }}
                </dd>
              </div>
              <div class="flex flex-wrap justify-between gap-x-4 gap-y-1">
                <dt class="text-muted">
                  Extraction
                </dt><dd class="max-w-md text-right text-highlighted">
                  {{ extractionLabel() }}
                </dd>
              </div>
            </dl>
            <div v-if="metricEntries.length" class="mt-3 flex flex-wrap gap-2" aria-label="Extraction metrics">
              <UBadge
                v-for="metric in metricEntries"
                :key="metric.key"
                :label="formatMetric(metric.key, metric.value)"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </div>
          </section>

          <section v-if="submission?.extractionWarnings.length" aria-labelledby="knowledge-quality-heading">
            <h3 id="knowledge-quality-heading" class="text-sm font-semibold text-highlighted">
              Extraction quality
            </h3>
            <div class="mt-3 space-y-2">
              <UAlert
                v-for="warning in submission.extractionWarnings"
                :key="warning"
                :title="humanize(warning)"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
              />
            </div>
          </section>

          <section aria-labelledby="knowledge-preview-heading">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 id="knowledge-preview-heading" class="text-sm font-semibold text-highlighted">
                Extracted preview
              </h3>
              <span class="text-xs text-muted">{{ detail.preview.totalChunks }} passages</span>
            </div>
            <UAlert
              v-if="previewTruncated"
              class="mt-3"
              title="Preview truncated"
              description="This bounded preview shows the beginning of the extraction. Approval applies to the complete stored extraction."
              color="neutral"
              variant="subtle"
              icon="i-lucide-info"
            />
            <div v-if="previewChunks.length" class="mt-3 space-y-3">
              <article v-for="chunk in previewChunks" :key="chunk.chunkIndex" class="rounded-lg border border-default bg-elevated/30 p-4">
                <p class="text-xs font-medium text-muted">
                  {{ chunkProvenance(chunk) }}
                </p>
                <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-highlighted">
                  {{ chunk.content }}
                </p>
              </article>
            </div>
            <p v-else class="mt-3 rounded-lg border border-dashed border-default p-5 text-sm text-muted">
              Extracted text is not available yet.
            </p>
          </section>

          <section v-if="detail.history.length" aria-labelledby="knowledge-history-heading">
            <h3 id="knowledge-history-heading" class="text-sm font-semibold text-highlighted">
              Review history
            </h3>
            <ol class="mt-3 space-y-3 border-l border-default pl-4">
              <li v-for="item in detail.history" :key="`${item.action}-${item.createdAt}`" class="text-sm">
                <p class="font-medium text-highlighted">
                  {{ historyLabel(item.action) }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ item.actorName || 'System' }} · {{ formatDate(item.createdAt) }}
                </p>
              </li>
            </ol>
          </section>
        </div>

        <footer v-if="detail && canReview" class="flex flex-wrap justify-end gap-2 border-t border-default px-5 py-4">
          <UButton
            v-if="canArchive"
            label="Archive"
            variant="ghost"
            color="neutral"
            :loading="pendingAction === 'archive'"
            @click="perform('archive')"
          />
          <UButton
            v-if="canRetry"
            :label="retryIsIndexing ? 'Retry indexing' : 'Retry extraction'"
            icon="i-lucide-refresh-cw"
            variant="soft"
            :loading="pendingAction === 'retry'"
            @click="perform('retry')"
          />
          <UButton
            v-if="canApproveOrReject"
            label="Reject"
            color="error"
            variant="soft"
            @click="openRejection"
          />
          <UButton
            v-if="canApproveOrReject"
            label="Approve"
            icon="i-lucide-check"
            :loading="pendingAction === 'approve'"
            @click="perform('approve')"
          />
        </footer>
      </div>
    </template>
  </USlideover>

  <UModal :open="rejectionOpen" :ui="{ content: 'max-w-lg' }" @update:open="rejectionOpen = $event">
    <template #content>
      <div class="space-y-5 p-5">
        <div>
          <h3 class="text-base font-semibold text-highlighted">
            Reject this extraction?
          </h3>
          <p class="mt-1 text-sm text-muted">
            Record a clear reason so the source owner knows what must be corrected.
          </p>
        </div>
        <UFormField label="Rejection reason" help="Required · 2,000 characters maximum">
          <UTextarea
            v-model="rejectionReason"
            :rows="4"
            maxlength="2000"
            class="w-full"
            autofocus
          />
        </UFormField>
        <div class="flex justify-end gap-2 border-t border-default pt-4">
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            @click="closeRejection"
          />
          <UButton
            label="Reject submission"
            color="error"
            :disabled="!validRejectionReason"
            :loading="pendingAction === 'reject'"
            @click="perform('reject', rejectionReason)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
