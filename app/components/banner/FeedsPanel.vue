<script setup lang="ts">
const { state } = useBannerStudio()
const { feedsState, loadFeeds, uploadFeed, deleteFeed, setActiveFeed, togglePreview } = useBannerFeeds()
const toast = useToast()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)

const projectId = computed(() => state.project?.id)

// Load feeds when project is available
watch(projectId, (id) => {
  if (id) loadFeeds(id)
}, { immediate: true })

async function handleUpload(files: FileList | File[]) {
  if (!projectId.value) {
    toast.add({ title: 'Save first', description: 'Save the project before uploading feeds', color: 'warning' })
    return
  }
  isUploading.value = true
  try {
    for (const file of files) {
      const name = file.name.replace(/\.[^/.]+$/, '')
      await uploadFeed(projectId.value, file, name)
      toast.add({ title: 'Feed uploaded', description: `"${name}" — ${file.name}`, color: 'success' })
    }
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.data?.statusMessage || 'Failed to upload feed', color: 'error' })
  } finally {
    isUploading.value = false
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) handleUpload(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files?.length) handleUpload(e.dataTransfer.files)
}

async function handleDelete(feedId: string) {
  try {
    await deleteFeed(feedId)
    toast.add({ title: 'Deleted', description: 'Feed removed', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete feed', color: 'error' })
  }
}

function handleFeedClick(feedId: string) {
  setActiveFeed(feedId)
  if (!feedsState.isPreviewMode) {
    togglePreview()
  }
}
</script>

<template>
  <div class="p-3 space-y-3">
    <!-- Upload Zone -->
    <div
      class="border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer"
      :class="isDragging ? 'border-(--ui-primary) bg-(--ui-primary)/5' : 'border-(--ui-border) hover:border-(--ui-primary)/40'"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <UIcon name="i-lucide-database" class="w-6 h-6 text-(--ui-text-muted) mx-auto mb-1" />
      <p class="text-xs text-(--ui-text-muted)">
        {{ isUploading ? 'Uploading...' : 'Drop CSV or JSON file' }}
      </p>
      <input
        ref="fileInput"
        type="file"
        accept=".csv,.json,text/csv,application/json"
        class="hidden"
        @change="onFileSelect"
      >
    </div>

    <!-- Preview Toggle -->
    <div v-if="feedsState.feeds.length" class="flex items-center justify-between">
      <span class="text-xs font-medium text-(--ui-text-muted)">Data Feeds</span>
      <UButton
        :icon="feedsState.isPreviewMode ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :label="feedsState.isPreviewMode ? 'Exit Preview' : 'Preview'"
        variant="soft"
        size="xs"
        @click="togglePreview()"
      />
    </div>

    <!-- Feeds List -->
    <div v-if="feedsState.feeds.length" class="space-y-1.5">
      <div
        v-for="feed in feedsState.feeds"
        :key="feed.id"
        class="group flex items-center gap-2 p-2 rounded-lg border transition-all cursor-pointer"
        :class="feedsState.activeFeedId === feed.id
          ? 'border-(--ui-primary) bg-(--ui-primary)/5'
          : 'border-(--ui-border) hover:border-(--ui-primary)/30'"
        @click="handleFeedClick(feed.id)"
      >
        <UIcon
          :name="feed.sourceType === 'json' ? 'i-lucide-braces' : 'i-lucide-file-spreadsheet'"
          class="w-4 h-4 shrink-0 text-(--ui-text-muted)"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs font-medium truncate">{{ feed.name }}</div>
          <div class="text-[10px] text-(--ui-text-muted)">
            {{ feed.rowCount }} rows · {{ feed.columns.length }} cols
          </div>
        </div>
        <UButton
          icon="i-lucide-trash-2"
          variant="ghost"
          size="xs"
          color="error"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop="handleDelete(feed.id)"
        />
      </div>
    </div>

    <div v-else-if="!isUploading" class="text-center py-6 text-xs text-(--ui-text-muted)">
      No data feeds yet
    </div>
  </div>
</template>
