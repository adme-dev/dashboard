<script setup lang="ts">
import { format } from 'date-fns'
import type { TaskAttachment } from '~/types'

const props = defineProps<{
  taskId: string
}>()

const emit = defineEmits<{
  uploaded: []
}>()

// Fetch attachments
const { data: attachmentsData, pending: loading, refresh } = await useAsyncData(
  `task-attachments-${props.taskId}`,
  () => fetch(`/api/agency/tasks/${props.taskId}/attachments`).then(r => r.json()) as Promise<TaskAttachment[]>,
  { watch: [() => props.taskId] }
)

const attachments = computed(() => attachmentsData.value || [])

// File type icons
const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return 'i-lucide-image'
  if (fileType.startsWith('video/')) return 'i-lucide-video'
  if (fileType.startsWith('audio/')) return 'i-lucide-music'
  if (fileType.includes('pdf')) return 'i-lucide-file-text'
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'i-lucide-file-spreadsheet'
  if (fileType.includes('document') || fileType.includes('word')) return 'i-lucide-file-text'
  if (fileType.includes('presentation') || fileType.includes('powerpoint')) return 'i-lucide-presentation'
  if (fileType.includes('zip') || fileType.includes('archive')) return 'i-lucide-archive'
  return 'i-lucide-file'
}

// Format file size
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Upload handling
const uploading = ref(false)
const uploadProgress = ref(0)
const fileInputRef = ref<HTMLInputElement | null>(null)

const triggerFileInput = () => {
  fileInputRef.value?.click()
}

const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const files = target.files

  if (!files || files.length === 0) return

  uploading.value = true
  uploadProgress.value = 0

  try {
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)

      await fetch(`/api/agency/tasks/${props.taskId}/attachments`, {
        method: 'POST',
        body: formData
      })

      uploadProgress.value += 100 / files.length
    }

    await refresh()
    emit('uploaded')
  } catch (error) {
    console.error('Failed to upload file:', error)
  } finally {
    uploading.value = false
    uploadProgress.value = 0
    // Reset input
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  }
}

// Delete attachment
const deletingId = ref<string | null>(null)

const deleteAttachment = async (attachmentId: string) => {
  deletingId.value = attachmentId

  try {
    await ($fetch as any)(`/api/agency/tasks/${props.taskId}/attachments/${attachmentId}`, {
      method: 'DELETE'
    })
    await refresh()
  } catch (error) {
    console.error('Failed to delete attachment:', error)
  } finally {
    deletingId.value = null
  }
}

// Preview
const previewUrl = ref<string | null>(null)
const previewName = ref('')

const openPreview = (attachment: TaskAttachment) => {
  if (attachment.fileType.startsWith('image/')) {
    previewUrl.value = attachment.fileUrl
    previewName.value = attachment.fileName
  } else {
    // Download non-image files
    window.open(attachment.fileUrl, '_blank')
  }
}

// Expose refresh
defineExpose({ refresh })
</script>

<template>
  <div class="space-y-4">
    <!-- Upload area -->
    <div
      class="border-2 border-dashed border-neutral-300 dark:border-neutral-600 rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer"
      @click="triggerFileInput"
      @dragover.prevent
      @drop.prevent="(e) => handleFileSelect({ target: { files: e.dataTransfer?.files } } as any)"
    >
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="hidden"
        @change="handleFileSelect"
      />

      <template v-if="uploading">
        <UIcon name="i-lucide-loader-2" class="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
        <p class="text-sm text-muted">Uploading... {{ Math.round(uploadProgress) }}%</p>
      </template>

      <template v-else>
        <UIcon name="i-lucide-upload-cloud" class="h-8 w-8 text-muted mx-auto mb-2" />
        <p class="text-sm text-muted">
          Drop files here or <span class="text-primary">browse</span>
        </p>
        <p class="text-xs text-muted mt-1">Max 10MB per file</p>
      </template>
    </div>

    <!-- Loading state -->
    <template v-if="loading">
      <div v-for="i in 2" :key="i" class="flex gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
        <USkeleton class="h-10 w-10 rounded" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-4 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>
    </template>

    <!-- Attachments list -->
    <template v-else>
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="flex items-center gap-3 p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg group hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
      >
        <!-- File icon/preview -->
        <div
          class="w-10 h-10 rounded bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center cursor-pointer"
          @click="openPreview(attachment)"
        >
          <img
            v-if="attachment.fileType.startsWith('image/')"
            :src="attachment.fileUrl"
            :alt="attachment.fileName"
            class="w-full h-full object-cover rounded"
          />
          <UIcon
            v-else
            :name="getFileIcon(attachment.fileType)"
            class="h-5 w-5 text-muted"
          />
        </div>

        <!-- File info -->
        <div class="flex-1 min-w-0">
          <p
            class="text-sm font-medium text-highlighted truncate cursor-pointer hover:text-primary"
            @click="openPreview(attachment)"
          >
            {{ attachment.fileName }}
          </p>
          <p class="text-xs text-muted">
            {{ formatFileSize(attachment.fileSize) }}
            <span v-if="attachment.uploadedByName">
              • {{ attachment.uploadedByName }}
            </span>
            • {{ format(new Date(attachment.createdAt), 'MMM d, yyyy') }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <UTooltip text="Download">
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              size="xs"
              :href="attachment.fileUrl"
              target="_blank"
            />
          </UTooltip>
          <UTooltip text="Delete">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              :loading="deletingId === attachment.id"
              @click="deleteAttachment(attachment.id)"
            />
          </UTooltip>
        </div>
      </div>

      <!-- Empty state -->
      <div v-if="attachments.length === 0" class="text-center py-4">
        <p class="text-sm text-muted">No attachments yet</p>
      </div>
    </template>

    <!-- Image preview modal -->
    <UModal :open="!!previewUrl" @update:open="(v: boolean) => { if (!v) previewUrl = null }">
      <template #header>
        <span class="font-medium truncate">{{ previewName }}</span>
      </template>
      <template #body>
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="previewName"
          class="max-w-full max-h-[70vh] mx-auto rounded"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            label="Download"
            icon="i-lucide-download"
            color="primary"
            :href="previewUrl || undefined"
            target="_blank"
          />
          <UButton
            label="Close"
            color="neutral"
            @click="previewUrl = null"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
