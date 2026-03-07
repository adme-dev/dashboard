<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { state, CTA_OPTIONS, PLATFORM_LIST } = useAdPreview()

// Media upload via drag & drop or file input
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) processFile(input.files[0])
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function processFile(file: File) {
  // Revoke previous blob URL to prevent memory leak
  if (state.mediaUrl.startsWith('blob:')) URL.revokeObjectURL(state.mediaUrl)
  const isVideo = file.type.startsWith('video/')
  state.mediaType = isVideo ? 'video' : 'image'
  state.mediaUrl = URL.createObjectURL(file)
}

onBeforeUnmount(() => {
  if (state.mediaUrl.startsWith('blob:')) URL.revokeObjectURL(state.mediaUrl)
})

// Published banners from Banner Studio
const { data: publishedBanners } = useFetch('/api/agency/banner-studio/published', {
  query: { limit: 20 },
  default: () => [],
})

function selectPublishedBanner(url: string) {
  state.mediaUrl = url
  state.mediaType = 'image'
}

const visibleCount = computed(() => {
  return Object.values(state.visiblePlatforms).filter(Boolean).length
})
</script>

<template>
  <div class="flex h-[calc(100vh-4rem)] overflow-hidden">
    <!-- Left Panel: Config -->
    <div class="w-80 shrink-0 border-r border-default bg-elevated overflow-y-auto">
      <div class="p-5 space-y-5">
        <h1 class="text-lg font-bold">Ad Preview</h1>
        <p class="text-sm text-muted">See how your ad looks across all platforms.</p>

        <!-- Media Upload -->
        <div class="w-full">
          <label class="text-xs font-medium text-muted uppercase tracking-wider mb-2 block">Creative</label>
          <div
            class="w-full border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors"
            :class="isDragging ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
            @click="fileInput?.click()"
            @dragover.prevent="isDragging = true"
            @dragleave="isDragging = false"
            @drop.prevent="handleDrop"
          >
            <template v-if="state.mediaUrl">
              <img
                v-if="state.mediaType === 'image'"
                :src="state.mediaUrl"
                alt="Preview"
                class="w-full rounded mb-2"
              >
              <video
                v-else
                :src="state.mediaUrl"
                class="w-full rounded mb-2"
                muted
              />
              <UButton
                label="Change"
                variant="ghost"
                size="xs"
                icon="i-lucide-replace"
              />
            </template>
            <template v-else>
              <UIcon name="i-lucide-upload" class="w-8 h-8 text-muted mx-auto mb-2" />
              <p class="text-sm text-muted">Drop image or video</p>
              <p class="text-xs text-muted mt-1">or click to browse</p>
            </template>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept="image/*,video/*"
            class="hidden"
            @change="handleFileSelect"
          >
        </div>

        <!-- Published Banners -->
        <div v-if="publishedBanners && (publishedBanners as any[]).length > 0">
          <label class="text-xs font-medium text-muted uppercase tracking-wider mb-2 block">From Banner Studio</label>
          <div class="flex gap-2 flex-wrap">
            <button
              v-for="banner in (publishedBanners as any[]).slice(0, 6)"
              :key="banner.id"
              class="w-14 h-14 rounded border border-default overflow-hidden hover:border-primary transition-colors"
              @click="selectPublishedBanner(banner.url)"
            >
              <img :src="banner.url" alt="" class="w-full h-full object-cover">
            </button>
          </div>
        </div>

        <div class="h-px bg-default" />

        <!-- Ad Copy -->
        <div class="space-y-3">
          <label class="text-xs font-medium text-muted uppercase tracking-wider block">Ad Copy</label>

          <UInput v-model="state.pageName" placeholder="Page / Brand name" size="sm" class="w-full">
            <template #leading>
              <UIcon name="i-lucide-building-2" class="w-4 h-4 text-muted" />
            </template>
          </UInput>

          <UTextarea
            v-model="state.primaryText"
            placeholder="Primary text..."
            :rows="3"
            size="sm"
            class="w-full"
          />

          <UInput v-model="state.headline" placeholder="Headline" size="sm" class="w-full">
            <template #leading>
              <UIcon name="i-lucide-type" class="w-4 h-4 text-muted" />
            </template>
          </UInput>

          <UInput v-model="state.description" placeholder="Description" size="sm" class="w-full">
            <template #leading>
              <UIcon name="i-lucide-align-left" class="w-4 h-4 text-muted" />
            </template>
          </UInput>

          <USelect
            v-model="state.ctaType"
            :items="CTA_OPTIONS"
            value-key="value"
            placeholder="Call to Action"
            size="sm"
            class="w-full"
          />

          <UInput v-model="state.linkUrl" placeholder="https://example.com" size="sm" class="w-full">
            <template #leading>
              <UIcon name="i-lucide-link" class="w-4 h-4 text-muted" />
            </template>
          </UInput>
        </div>

        <div class="h-px bg-default" />

        <!-- Platform Toggles -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs font-medium text-muted uppercase tracking-wider">Platforms</label>
            <span class="text-xs text-muted">{{ visibleCount }} of {{ PLATFORM_LIST.length }}</span>
          </div>
          <div class="space-y-1.5">
            <label
              v-for="p in PLATFORM_LIST"
              :key="p.key"
              class="flex items-center gap-2.5 py-1.5 px-2 rounded hover:bg-elevated/50 cursor-pointer"
            >
              <UCheckbox v-model="state.visiblePlatforms[p.key]" />
              <UIcon :name="p.icon" class="w-4 h-4 text-muted" />
              <span class="text-sm">{{ p.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Panel: Preview Grid -->
    <div class="flex-1 overflow-y-auto bg-[#111114] p-6">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-[960px] mx-auto">
        <!-- Meta Feed -->
        <div v-if="state.visiblePlatforms.metaFeed" class="flex flex-col items-center gap-2">
          <span class="text-xs font-medium text-[#888]">Meta Feed (FB/IG)</span>
          <AdPreviewMetaFeedPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- Meta Story -->
        <div v-if="state.visiblePlatforms.metaStory" class="flex justify-center">
          <AdPreviewMetaStoryPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- TikTok -->
        <div v-if="state.visiblePlatforms.tiktok" class="flex justify-center">
          <AdPreviewTikTokPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- YouTube -->
        <div v-if="state.visiblePlatforms.youtube" class="flex justify-center">
          <AdPreviewYouTubePreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- LinkedIn -->
        <div v-if="state.visiblePlatforms.linkedin" class="flex flex-col items-center gap-2">
          <span class="text-xs font-medium text-[#888]">LinkedIn</span>
          <AdPreviewLinkedInPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- Snapchat -->
        <div v-if="state.visiblePlatforms.snapchat" class="flex justify-center">
          <AdPreviewSnapchatPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- Pinterest -->
        <div v-if="state.visiblePlatforms.pinterest" class="flex flex-col items-center gap-2">
          <span class="text-xs font-medium text-[#888]">Pinterest</span>
          <AdPreviewPinterestPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>

        <!-- X -->
        <div v-if="state.visiblePlatforms.x" class="flex flex-col items-center gap-2">
          <span class="text-xs font-medium text-[#888]">X (Twitter)</span>
          <AdPreviewXPreview
            :image="state.mediaUrl || undefined"
            :page-name="state.pageName"
            :primary-text="state.primaryText"
            :headline="state.headline"
            :description="state.description"
            :cta-type="state.ctaType"
            :link-url="state.linkUrl"
          />
        </div>
      </div>
    </div>
  </div>
</template>
