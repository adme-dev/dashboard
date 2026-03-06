<template>
  <div class="space-y-3">
    <!-- Info Section -->
    <div class="border border-gray-200 dark:border-neutral-700 rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        @click="showInfo = !showInfo"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-info" class="w-4 h-4 text-gray-500 dark:text-neutral-400" />
          <span>Info</span>
        </div>
        <UIcon
          :name="showInfo ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400 dark:text-neutral-500"
        />
      </button>
      <div v-if="showInfo" class="px-4 pt-4 pb-4 border-t border-gray-200 dark:border-neutral-700">
        <TaskInfo :task-id="taskId" />
      </div>
    </div>

    <!-- Files Section -->
    <div class="border border-gray-200 dark:border-neutral-700 rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        @click="toggleFiles"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-paperclip" class="w-4 h-4 text-gray-500 dark:text-neutral-400" />
          <span>Files</span>
          <span v-if="attachments.length > 0" class="text-xs text-gray-400 dark:text-neutral-500">({{ attachments.length }})</span>
        </div>
        <UIcon
          :name="showFiles ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400 dark:text-neutral-500"
        />
      </button>
      <div v-if="showFiles" class="px-4 pb-4 border-t border-gray-200 dark:border-neutral-700 space-y-3">
        <!-- Search & Upload -->
        <div class="flex items-center gap-3 pt-3">
          <UButton icon="i-lucide-plus" variant="outline" size="sm" @click="triggerUpload">Add file</UButton>
          <UInput
            v-if="attachments.length > 3"
            v-model="fileSearch"
            placeholder="Search files..."
            icon="i-lucide-search"
            size="sm"
            class="flex-1"
          />
        </div>

        <!-- Loading State -->
        <div v-if="loadingFiles" class="flex items-center justify-center py-4">
          <XfLoader size="sm" />
        </div>

        <!-- File List -->
        <div v-else-if="filteredAttachments.length > 0" class="space-y-2">
          <div
            v-for="file in filteredAttachments"
            :key="file.id"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 group"
          >
            <!-- File Icon -->
            <div class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" :class="fileIconBg(file.fileType)">
              <UIcon :name="fileIcon(file.fileType)" class="w-4 h-4 text-white" />
            </div>

            <!-- File Info -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-neutral-100 truncate">{{ file.fileName }}</p>
              <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-neutral-400">
                <span>{{ formatFileSize(file.fileSize) }}</span>
                <span v-if="file.uploadedBy">&middot; {{ file.uploadedBy.name }}</span>
                <span>&middot; {{ formatDate(file.createdAt) }}</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <UButton
                v-if="file.fileUrl"
                icon="i-lucide-download"
                variant="ghost"
                color="neutral"
                size="xs"
                :href="file.fileUrl"
                target="_blank"
              />
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                color="error"
                size="xs"
                @click="deleteAttachment(file.id)"
              />
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <p v-else class="text-sm text-gray-500 dark:text-neutral-400">No files attached yet.</p>

        <!-- Hidden file input -->
        <input
          ref="fileInputRef"
          type="file"
          class="hidden"
          multiple
          @change="handleFileUpload"
        />
      </div>
    </div>

    <!-- Activity Log Section -->
    <div class="border border-gray-200 dark:border-neutral-700 rounded-lg">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-900 dark:text-neutral-100 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
        @click="showActivity = !showActivity"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-activity" class="w-4 h-4 text-gray-500 dark:text-neutral-400" />
          <span>Activity Log</span>
        </div>
        <UIcon
          :name="showActivity ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="w-4 h-4 text-gray-400 dark:text-neutral-500"
        />
      </button>
      <div v-if="showActivity" class="px-4 pt-4 pb-4 border-t border-gray-200 dark:border-neutral-700">
        <TaskActivityLog :task-id="taskId" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  taskId: string
}

interface Attachment {
  id: string
  taskId: string
  fileName: string
  fileUrl: string
  fileType: string | null
  fileSize: number | null
  storageKey: string | null
  thumbnailUrl: string | null
  createdAt: string
  uploadedBy: { id: string; name: string; email: string } | null
}

const props = defineProps<Props>()
const toast = useToast()

const showInfo = ref(true)
const showFiles = ref(false)
const showActivity = ref(false)

// Files state
const attachments = ref<Attachment[]>([])
const loadingFiles = ref(false)
const fileSearch = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

const filteredAttachments = computed(() => {
  if (!fileSearch.value.trim()) return attachments.value
  const q = fileSearch.value.toLowerCase()
  return attachments.value.filter(f => f.fileName.toLowerCase().includes(q))
})

// Fetch attachments when Files section is opened
async function toggleFiles() {
  showFiles.value = !showFiles.value
  if (showFiles.value && attachments.value.length === 0 && !loadingFiles.value) {
    await fetchAttachments()
  }
}

async function fetchAttachments() {
  loadingFiles.value = true
  try {
    const data = await $fetch<Attachment[]>(`/api/agency/tasks/${props.taskId}/attachments`)
    attachments.value = data
  } catch (err) {
    console.error('Failed to fetch attachments:', err)
  } finally {
    loadingFiles.value = false
  }
}

function triggerUpload() {
  fileInputRef.value?.click()
}

async function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  for (const file of Array.from(files)) {
    const formData = new FormData()
    formData.append('file', file)

    try {
      const result = await $fetch<Attachment>(`/api/agency/tasks/${props.taskId}/attachments`, {
        method: 'POST',
        body: formData,
      })
      attachments.value.unshift(result)
      toast.add({ title: 'File uploaded', description: file.name, color: 'success' })
    } catch (err: any) {
      toast.add({ title: 'Upload failed', description: err.data?.statusMessage || file.name, color: 'error' })
    }
  }

  // Reset input
  input.value = ''
}

async function deleteAttachment(attachmentId: string) {
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/attachments/${attachmentId}`, { method: 'DELETE' })
    attachments.value = attachments.value.filter(a => a.id !== attachmentId)
    toast.add({ title: 'File removed', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Delete failed', description: err.data?.statusMessage || 'Unknown error', color: 'error' })
  }
}

// File display helpers
function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString()
}

function fileIcon(type: string | null): string {
  if (!type) return 'i-lucide-file'
  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type.includes('pdf')) return 'i-lucide-file-text'
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'i-lucide-table'
  if (type.includes('document') || type.includes('word')) return 'i-lucide-file-text'
  if (type.includes('presentation') || type.includes('powerpoint')) return 'i-lucide-presentation'
  if (type.startsWith('video/')) return 'i-lucide-video'
  if (type.startsWith('audio/')) return 'i-lucide-music'
  if (type.includes('zip') || type.includes('archive') || type.includes('rar')) return 'i-lucide-archive'
  return 'i-lucide-file'
}

function fileIconBg(type: string | null): string {
  if (!type) return 'bg-gray-500'
  if (type.startsWith('image/')) return 'bg-purple-500'
  if (type.includes('pdf')) return 'bg-red-500'
  if (type.includes('spreadsheet') || type.includes('excel') || type.includes('csv')) return 'bg-green-500'
  if (type.includes('document') || type.includes('word')) return 'bg-blue-500'
  if (type.startsWith('video/')) return 'bg-orange-500'
  return 'bg-gray-500'
}

// Re-fetch when taskId changes
watch(() => props.taskId, () => {
  attachments.value = []
  fileSearch.value = ''
  if (showFiles.value) {
    fetchAttachments()
  }
})
</script>
