<script setup lang="ts">
const props = defineProps<{
  url: string
}>()

interface LinkPreviewData {
  url: string
  title?: string | null
  description?: string | null
  image?: string | null
  favicon?: string | null
  siteName?: string | null
}

const preview = ref<LinkPreviewData | null>(null)
const loading = ref(true)
const failed = ref(false)
const safeSourceUrl = computed(() => safePreviewUrl(props.url))
const apiFetch = $fetch as <T = unknown>(request: string, options?: { params?: Record<string, unknown> }) => Promise<T>

const hostname = computed(() => {
  const url = safeSourceUrl.value
  if (!url) return props.url
  try {
    return new globalThis.URL(url).hostname
  } catch {
    return props.url
  }
})

async function fetchPreview() {
  if (!safeSourceUrl.value) {
    failed.value = true
    loading.value = false
    return
  }
  try {
    const data = await apiFetch<LinkPreviewData>('/api/chat/link-preview', {
      params: { url: safeSourceUrl.value }
    })
    const safeUrl = safePreviewUrl(data?.url) ?? safeSourceUrl.value
    const safeImage = safePreviewUrl(data?.image)
    const safeFavicon = safePreviewUrl(data?.favicon)
    if (data?.title || data?.description || safeImage) {
      preview.value = {
        ...data,
        url: safeUrl,
        image: safeImage,
        favicon: safeFavicon
      }
    } else {
      failed.value = true
    }
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(fetchPreview)

function safePreviewUrl(value?: string | null) {
  return safePublicUrl(value)
}
</script>

<template>
  <!-- Don't render anything if no useful preview data -->
  <a
    v-if="preview && !failed"
    :href="preview.url"
    target="_blank"
    rel="noopener noreferrer"
    class="block mt-2 max-w-md rounded-lg border border-default overflow-hidden hover:border-primary/40 transition-colors group"
  >
    <!-- Image -->
    <div v-if="preview.image" class="w-full h-40 overflow-hidden bg-elevated">
      <img
        :src="preview.image"
        :alt="preview.title || ''"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      >
    </div>

    <div class="px-3 py-2.5">
      <!-- Site name -->
      <div v-if="preview.siteName || preview.favicon" class="flex items-center gap-1.5 mb-1">
        <img
          v-if="preview.favicon"
          :src="preview.favicon"
          class="w-3.5 h-3.5 rounded-sm"
          loading="lazy"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        >
        <span class="text-[11px] text-muted font-medium">{{ preview.siteName || hostname }}</span>
      </div>

      <!-- Title -->
      <p v-if="preview.title" class="text-sm font-semibold text-primary line-clamp-2">
        {{ preview.title }}
      </p>

      <!-- Description -->
      <p v-if="preview.description" class="text-xs text-muted mt-0.5 line-clamp-2">
        {{ preview.description }}
      </p>
    </div>
  </a>
</template>
