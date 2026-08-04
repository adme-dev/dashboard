<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { BoardFileItem, BoardFileListResponse } from '~/types'
import { boardKnowledgeApiError, useBoardKnowledge } from '~/composables/useBoardKnowledge'
import { filterBoardFileItems } from '~/utils/boardFiles'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{ boardId: string }>()
const emit = defineEmits<{ openTask: [taskId: string] }>()
const toast = useToast()

const response = ref<BoardFileListResponse | null>(null)
const loading = ref(true)
const loadError = ref('')
const search = ref('')
const scope = ref<'all' | 'board' | 'task'>('all')
const category = ref<'all' | BoardFileItem['category']>('all')
const knowledge = ref<'all' | 'review' | 'approved' | 'failed' | 'not_submitted'>('all')
const uploadOpen = ref(false)
const uploading = ref(false)
const uploadFileValue = ref<File | null>(null)
const uploadCategory = ref<'reference' | 'policy' | 'template' | 'other'>('reference')
const uploadDescription = ref('')
const deleteTarget = ref<BoardFileItem | null>(null)
const deleting = ref(false)
const reviewSubmissionId = ref<string | null>(null)
const reviewCanReview = ref(false)
const reviewReturnFocus = ref<HTMLElement | undefined>()
const {
  isSubmitting: isSubmittingKnowledge,
  submit: submitKnowledge
} = useBoardKnowledge(() => props.boardId)

const scopeOptions = [
  { label: 'All files', value: 'all' },
  { label: 'Board documents', value: 'board' },
  { label: 'Task attachments', value: 'task' }
]
const categoryOptions = [
  { label: 'All categories', value: 'all' },
  { label: 'Reference', value: 'reference' },
  { label: 'Policy', value: 'policy' },
  { label: 'Template', value: 'template' },
  { label: 'Other', value: 'other' },
  { label: 'Task evidence', value: 'evidence' }
]
const uploadCategoryOptions = categoryOptions.filter(option => option.value !== 'all' && option.value !== 'evidence')
const knowledgeOptions = [
  { label: 'All knowledge states', value: 'all' },
  { label: 'Knowledge review', value: 'review' },
  { label: 'Approved for AI', value: 'approved' },
  { label: 'Extraction or indexing failed', value: 'failed' },
  { label: 'Not submitted', value: 'not_submitted' }
]

const files = computed(() => response.value?.files || [])
const summary = computed(() => response.value?.summary || { total: 0, boardDocuments: 0, taskEvidence: 0 })
const filteredFiles = computed(() => filterBoardFileItems(files.value, {
  search: search.value,
  scope: scope.value,
  category: category.value,
  knowledge: knowledge.value
}))

function apiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const details = error as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
  return details.data?.statusMessage || details.statusMessage || details.message || fallback
}

async function loadFiles() {
  loading.value = true
  loadError.value = ''
  try {
    response.value = await $fetch<BoardFileListResponse>(`/api/agency/boards/${props.boardId}/files`)
  } catch (error) {
    loadError.value = apiErrorMessage(error, 'The board file library is unavailable.')
  } finally {
    loading.value = false
  }
}

function onFileChange(event: Event) {
  uploadFileValue.value = (event.target as HTMLInputElement).files?.[0] || null
}

function resetUploadForm() {
  uploadFileValue.value = null
  uploadCategory.value = 'reference'
  uploadDescription.value = ''
}

function openUpload() {
  uploadOpen.value = true
}

function closeUpload() {
  uploadOpen.value = false
}

function confirmDelete(file: BoardFileItem) {
  deleteTarget.value = file
}

function closeDelete() {
  deleteTarget.value = null
}

function onDeleteModalOpenChange(value: boolean) {
  if (!value) closeDelete()
}

async function uploadBoardFile() {
  if (!uploadFileValue.value) return
  uploading.value = true
  try {
    const body = new FormData()
    body.append('file', uploadFileValue.value)
    body.append('category', uploadCategory.value)
    body.append('description', uploadDescription.value.trim())
    await $fetch(`/api/agency/boards/${props.boardId}/files`, { method: 'POST', body })
    uploadOpen.value = false
    resetUploadForm()
    await loadFiles()
    toast.add({ title: 'Board file uploaded', description: 'The document is available to everyone with access to this board.', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Upload failed', description: apiErrorMessage(error, 'The file could not be uploaded.'), color: 'error' })
  } finally {
    uploading.value = false
  }
}

async function deleteBoardFile() {
  if (!deleteTarget.value) return
  deleting.value = true
  try {
    await $fetch(`/api/agency/boards/${props.boardId}/files/${deleteTarget.value.id}`, { method: 'DELETE' })
    deleteTarget.value = null
    await loadFiles()
    toast.add({ title: 'Board file deleted', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Delete failed', description: apiErrorMessage(error, 'The file could not be deleted.'), color: 'error' })
  } finally {
    deleting.value = false
  }
}

async function submitFileForKnowledge(file: BoardFileItem) {
  if (!file.knowledge.canSubmit || isSubmittingKnowledge(file)) return
  try {
    await submitKnowledge(file)
    await loadFiles()
    toast.add({
      title: 'Submitted for knowledge review',
      description: 'Extraction has been queued. The status will update here as processing completes.',
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: 'Submission failed',
      description: boardKnowledgeApiError(error, 'The source could not be submitted for review.'),
      color: 'error'
    })
  }
}

function openKnowledgeReview(file: BoardFileItem, event: MouseEvent) {
  if (!file.knowledge.submissionId) return
  reviewSubmissionId.value = file.knowledge.submissionId
  reviewCanReview.value = file.knowledge.canReview
  reviewReturnFocus.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
}

function closeKnowledgeReview() {
  reviewSubmissionId.value = null
  reviewCanReview.value = false
}

function handleKnowledgeReviewOpen(value: boolean) {
  if (!value) closeKnowledgeReview()
}

async function handleKnowledgeChanged() {
  await loadFiles()
}

function formatFileSize(bytes: number) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

function fileIcon(type: string) {
  if (type.includes('pdf') || type.includes('document')) return 'i-lucide-file-text'
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) return 'i-lucide-file-spreadsheet'
  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type.includes('presentation')) return 'i-lucide-presentation'
  return 'i-lucide-file'
}

function categoryLabel(value: BoardFileItem['category']) {
  return categoryOptions.find(option => option.value === value)?.label || value
}

function knowledgeColor(label: BoardFileItem['knowledge']['label']) {
  if (label === 'Used by AI') return 'success'
  if (label === 'Ready for review') return 'warning'
  if (label === 'Extraction failed' || label === 'Rejected') return 'error'
  if (label === 'Approved · indexing' || label === 'Extracting') return 'info'
  return 'neutral'
}

onMounted(loadFiles)
</script>

<template>
  <section class="flex-1 overflow-auto bg-muted/30 p-4 md:p-6" aria-labelledby="board-files-heading">
    <div class="mx-auto max-w-[1500px] space-y-4">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 id="board-files-heading" class="text-lg font-semibold text-highlighted">
            Board files
          </h2>
          <p class="mt-1 max-w-2xl text-sm text-muted">
            Board documents live here for the whole team. Task attachments remain attached to their task and appear here for discovery.
          </p>
        </div>
        <UButton label="Upload board file" icon="i-lucide-upload" @click="openUpload" />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted" aria-live="polite">
        <span class="font-medium text-highlighted">{{ summary.total }} files</span>
        <span>{{ summary.boardDocuments }} board document{{ summary.boardDocuments === 1 ? '' : 's' }}</span>
        <span>{{ summary.taskEvidence }} task attachment{{ summary.taskEvidence === 1 ? '' : 's' }}</span>
      </div>

      <div class="grid grid-cols-1 gap-3 rounded-lg border border-default bg-default p-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_11rem_11rem_14rem]">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="Search names, tasks, people or sources"
          class="w-full"
        />
        <USelect
          v-model="scope"
          :items="scopeOptions"
          value-key="value"
          class="w-full"
          aria-label="Filter file scope"
        />
        <USelect
          v-model="category"
          :items="categoryOptions"
          value-key="value"
          class="w-full"
          aria-label="Filter file category"
        />
        <USelect
          v-model="knowledge"
          :items="knowledgeOptions"
          value-key="value"
          class="w-full"
          aria-label="Filter knowledge status"
        />
      </div>

      <div
        v-if="loading"
        class="space-y-2 rounded-lg border border-default bg-default p-4"
        aria-busy="true"
        aria-label="Loading board files"
      >
        <USkeleton v-for="index in 4" :key="index" class="h-14 w-full" />
      </div>

      <UAlert
        v-else-if="loadError"
        title="Files could not be loaded"
        :description="loadError"
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
      >
        <template #actions>
          <UButton
            label="Try again"
            color="error"
            variant="soft"
            size="sm"
            @click="loadFiles"
          />
        </template>
      </UAlert>

      <div
        v-else-if="filteredFiles.length"
        role="table"
        aria-label="Board file library"
        class="overflow-hidden rounded-lg border border-default bg-default"
      >
        <div role="row" class="hidden grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_7rem_minmax(9rem,1fr)_7rem_6rem] gap-4 border-b border-default bg-elevated/50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted lg:grid">
          <span role="columnheader">File</span>
          <span role="columnheader">Location</span>
          <span role="columnheader">Type</span>
          <span role="columnheader">Knowledge</span>
          <span role="columnheader">Added</span>
          <span role="columnheader" class="text-right">Actions</span>
        </div>
        <div
          v-for="file in filteredFiles"
          :key="`${file.scope}-${file.id}`"
          role="row"
          class="grid grid-cols-1 gap-3 border-b border-default px-4 py-3 last:border-b-0 lg:grid-cols-[minmax(12rem,2fr)_minmax(8rem,1fr)_7rem_minmax(9rem,1fr)_7rem_6rem] lg:items-center lg:gap-4"
        >
          <div role="cell" class="flex min-w-0 items-start gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-elevated text-muted">
              <UIcon :name="fileIcon(file.fileType)" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ file.fileName }}
              </p>
              <p class="mt-0.5 truncate text-xs text-muted">
                {{ file.description || `${formatFileSize(file.fileSize)} · ${file.uploadedBy?.name || 'Unknown uploader'}` }}
              </p>
            </div>
          </div>
          <div role="cell" class="min-w-0">
            <UBadge :color="file.scope === 'board' ? 'primary' : 'neutral'" variant="subtle" size="sm">
              {{ file.scope === 'board' ? 'Board document' : 'Task attachment' }}
            </UBadge>
            <UButton
              v-if="file.task"
              :label="file.task.title"
              variant="link"
              color="neutral"
              size="xs"
              class="mt-1 block max-w-full truncate p-0 text-left"
              @click="emit('openTask', file.task.id)"
            />
          </div>
          <div role="cell" class="flex items-center gap-2 text-sm text-muted">
            <span class="lg:hidden">Type:</span>
            <span>{{ categoryLabel(file.category) }} · {{ file.source }}</span>
          </div>
          <div role="cell" class="flex min-w-0 items-center gap-2">
            <span class="text-sm text-muted lg:hidden">Knowledge:</span>
            <UButton
              v-if="file.knowledge.canSubmit"
              :data-testid="`submit-knowledge-${file.id}`"
              label="Submit for review"
              icon="i-lucide-sparkles"
              variant="soft"
              color="neutral"
              size="xs"
              :loading="isSubmittingKnowledge(file)"
              @click.stop="submitFileForKnowledge(file)"
            />
            <UButton
              v-else-if="file.knowledge.submissionId"
              :data-testid="`review-knowledge-${file.id}`"
              :label="file.knowledge.label"
              :color="knowledgeColor(file.knowledge.label)"
              variant="soft"
              size="xs"
              class="max-w-full"
              @click.stop="openKnowledgeReview(file, $event)"
            />
            <UBadge
              v-else
              :label="file.knowledge.label"
              :color="knowledgeColor(file.knowledge.label)"
              variant="subtle"
              size="sm"
            />
          </div>
          <div role="cell" class="text-sm text-muted">
            <span class="lg:hidden">Added: </span>{{ formatDate(file.createdAt) }}
          </div>
          <div role="cell" class="flex items-center justify-end gap-1">
            <UTooltip text="Download">
              <UButton
                aria-label="Download file"
                icon="i-lucide-download"
                variant="ghost"
                color="neutral"
                size="xs"
                :href="safeMediaUrl(file.fileUrl)"
                target="_blank"
                external
              />
            </UTooltip>
            <UTooltip v-if="file.canDelete" text="Delete board file">
              <UButton
                aria-label="Delete file"
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                @click="confirmDelete(file)"
              />
            </UTooltip>
          </div>
        </div>
      </div>

      <div v-else class="rounded-lg border border-dashed border-default bg-default px-6 py-12 text-center">
        <UIcon :name="files.length ? 'i-lucide-search-x' : 'i-lucide-folder-open'" class="mx-auto size-8 text-muted" />
        <h3 class="mt-3 text-sm font-medium text-highlighted">
          {{ files.length ? 'No files match these filters' : 'No files on this board yet' }}
        </h3>
        <p class="mt-1 text-sm text-muted">
          {{ files.length ? 'Clear or change the search filters.' : 'Upload a board reference, or attach evidence to a task.' }}
        </p>
      </div>
    </div>

    <UModal v-model:open="uploadOpen" :ui="{ content: 'max-w-lg' }">
      <template #content>
        <div class="space-y-5 p-5">
          <div>
            <h3 class="text-base font-semibold text-highlighted">
              Upload board file
            </h3>
            <p class="mt-1 text-sm text-muted">
              This document will be visible from the board to everyone who can access it.
            </p>
          </div>
          <div class="grid grid-cols-1 gap-4">
            <UFormField label="File" help="PDF, Office, image, text, CSV, JSON or archive · 50 MB maximum" required>
              <UInput type="file" class="w-full" @change="onFileChange" />
            </UFormField>
            <UFormField label="Category" required>
              <USelect
                v-model="uploadCategory"
                :items="uploadCategoryOptions"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Description" help="Optional context to help the team understand when to use this file.">
              <UTextarea
                v-model="uploadDescription"
                :rows="3"
                maxlength="2000"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2 border-t border-default pt-4">
            <UButton
              label="Cancel"
              variant="ghost"
              color="neutral"
              @click="closeUpload"
            />
            <UButton
              label="Upload file"
              icon="i-lucide-upload"
              :loading="uploading"
              :disabled="!uploadFileValue"
              @click="uploadBoardFile"
            />
          </div>
        </div>
      </template>
    </UModal>

    <UModal :open="!!deleteTarget" :ui="{ content: 'max-w-md' }" @update:open="onDeleteModalOpenChange">
      <template #content>
        <div class="space-y-4 p-5">
          <div>
            <h3 class="text-base font-semibold text-highlighted">
              Delete board file?
            </h3>
            <p class="mt-1 text-sm text-muted">
              {{ deleteTarget?.fileName }} will be removed from this board and storage. Task attachments are not affected.
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="ghost"
              color="neutral"
              @click="closeDelete"
            />
            <UButton
              label="Delete board file"
              color="error"
              :loading="deleting"
              @click="deleteBoardFile"
            />
          </div>
        </div>
      </template>
    </UModal>

    <BoardKnowledgeReviewSlideover
      :open="!!reviewSubmissionId"
      :board-id="boardId"
      :submission-id="reviewSubmissionId"
      :can-review="reviewCanReview"
      :return-focus="reviewReturnFocus"
      @update:open="handleKnowledgeReviewOpen"
      @changed="handleKnowledgeChanged"
    />
  </section>
</template>
