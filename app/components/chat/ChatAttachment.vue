<script setup lang="ts">
const props = defineProps<{
  attachments: Array<{ url: string, name: string, type: string, size: number, key?: string }>
}>()

const safeAttachments = computed(() =>
  props.attachments
    .map(attachment => ({
      ...attachment,
      url: safeAttachmentUrl(attachment.url)
    }))
    .filter((attachment): attachment is typeof attachment & { url: string } => Boolean(attachment.url))
)

function isImage(type: string) {
  return type.startsWith('image/')
}

function safeAttachmentUrl(value?: string | null) {
  return safeMediaUrl(value)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'i-lucide-image'
  if (type === 'application/pdf') return 'i-lucide-file-text'
  if (type.includes('word') || type.includes('document')) return 'i-lucide-file-text'
  if (type.includes('sheet') || type.includes('excel')) return 'i-lucide-file-spreadsheet'
  if (type.includes('presentation') || type.includes('powerpoint')) return 'i-lucide-presentation'
  if (type === 'application/zip' || type.includes('rar')) return 'i-lucide-file-archive'
  if (type.startsWith('text/')) return 'i-lucide-file-code'
  return 'i-lucide-file'
}
</script>

<template>
  <div v-if="safeAttachments.length > 0" class="flex flex-wrap gap-2 mt-1.5">
    <!-- Image attachments: show preview -->
    <template v-for="att in safeAttachments" :key="att.url">
      <a
        v-if="isImage(att.type)"
        :href="att.url"
        target="_blank"
        rel="noopener noreferrer"
        class="block rounded-lg overflow-hidden border border-default hover:border-primary/50 transition-colors max-w-xs"
      >
        <img
          :src="att.url"
          :alt="att.name"
          class="max-w-full max-h-64 object-contain bg-elevated"
          loading="lazy"
        >
        <div class="px-2 py-1 text-xs text-muted truncate bg-elevated/50">
          {{ att.name }} &middot; {{ formatSize(att.size) }}
        </div>
      </a>

      <!-- Non-image: file card -->
      <a
        v-else
        :href="att.url"
        target="_blank"
        rel="noopener noreferrer"
        class="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-default hover:border-primary/50 hover:bg-elevated/50 transition-colors max-w-xs"
      >
        <div class="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <UIcon :name="getFileIcon(att.type)" class="w-5 h-5 text-primary" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">{{ att.name }}</p>
          <p class="text-xs text-muted">{{ formatSize(att.size) }}</p>
        </div>
        <UIcon name="i-lucide-download" class="w-4 h-4 text-muted shrink-0" />
      </a>
    </template>
  </div>
</template>
