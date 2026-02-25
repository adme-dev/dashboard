<script setup lang="ts">
const props = defineProps<{
  channelId: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'uploaded': [attachment: { url: string; name: string; type: string; size: number; key: string }]
}>()

const toast = useToast()
const uploading = ref(false)
const uploadProgress = ref(0)
const dragOver = ref(false)

const fileInput = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInput.value?.click()
}

async function handleFiles(files: FileList | null) {
  if (!files || files.length === 0 || uploading.value) return

  for (const file of Array.from(files)) {
    await uploadFile(file)
  }
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  handleFiles(e.dataTransfer?.files ?? null)
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function uploadFile(file: File) {
  uploading.value = true
  uploadProgress.value = 0

  try {
    // 1. Get presigned URL from our API
    const presigned = await $fetch(`/api/chat/channels/${props.channelId}/upload`, {
      method: 'POST',
      body: {
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        fileSize: file.size
      }
    }) as { uploadUrl: string; key: string; downloadUrl: string; fileName: string; contentType: string; fileSize: number }

    // 2. Upload directly to R2 via presigned URL
    await fetch(presigned.uploadUrl, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type || 'application/octet-stream'
      }
    })

    uploadProgress.value = 100

    // 3. Emit the attachment metadata
    emit('uploaded', {
      url: presigned.downloadUrl,
      name: presigned.fileName,
      type: presigned.contentType,
      size: presigned.fileSize,
      key: presigned.key
    })
  } catch (err: any) {
    toast.add({
      title: 'Upload failed',
      description: err?.data?.statusMessage || 'Could not upload file',
      color: 'error'
    })
  } finally {
    uploading.value = false
    uploadProgress.value = 0
  }
}

defineExpose({ openFilePicker })
</script>

<template>
  <div>
    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden"
      @change="handleFiles(($event.target as HTMLInputElement).files)"
    />

    <!-- Drop zone overlay (shown when dragging over the chat input area) -->
    <div
      v-if="dragOver"
      class="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
    >
      <div class="text-center">
        <UIcon name="i-lucide-upload-cloud" class="w-8 h-8 text-primary mb-1" />
        <p class="text-sm font-medium text-primary">Drop files to upload</p>
      </div>
    </div>

    <!-- Upload button -->
    <UTooltip text="Attach file">
      <UButton
        icon="i-lucide-paperclip"
        variant="ghost"
        color="neutral"
        size="sm"
        :loading="uploading"
        :disabled="disabled"
        @click="openFilePicker"
      />
    </UTooltip>

    <!-- Upload progress -->
    <div v-if="uploading" class="absolute bottom-full left-0 right-0 mb-1 px-2">
      <div class="flex items-center gap-2 px-3 py-1.5 bg-elevated rounded-lg border border-default">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 text-primary animate-spin" />
        <span class="text-xs text-muted">Uploading...</span>
      </div>
    </div>
  </div>
</template>
