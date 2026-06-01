<script setup lang="ts">
import type { SocialPlatform } from '~/types'

const props = defineProps<{
  platforms: SocialPlatform[]
  pageName?: string
  // (platform) => { content, mediaUrls } — resolved base+override from the composer
  resolve: (platform: string) => { content: string; mediaUrls: string[] }
}>()

const META = {
  facebook: { label: 'Facebook', icon: 'i-lucide-facebook', comp: 'AdPreviewMetaFeedPreview' },
  instagram: { label: 'Instagram', icon: 'i-lucide-instagram', comp: 'AdPreviewMetaFeedPreview' },
  linkedin: { label: 'LinkedIn', icon: 'i-lucide-linkedin', comp: 'AdPreviewLinkedInPreview' },
  tiktok: { label: 'TikTok', icon: 'i-lucide-music', comp: 'AdPreviewTikTokPreview' },
  youtube: { label: 'YouTube', icon: 'i-lucide-youtube', comp: 'AdPreviewYouTubePreview' },
  'google-business': { label: 'Google Business', icon: 'i-lucide-store', comp: null },
} as const

const cards = computed(() =>
  props.platforms.map((p) => {
    const r = props.resolve(p)
    return { platform: p, meta: META[p], content: r.content, image: r.mediaUrls?.[0] }
  }),
)
</script>

<template>
  <div class="space-y-5">
    <p v-if="!platforms.length" class="text-sm text-muted">
      Select one or more networks to preview the post.
    </p>

    <div v-for="card in cards" :key="card.platform" class="space-y-2">
      <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
        <UIcon :name="card.meta.icon" class="size-4" />
        {{ card.meta.label }}
      </div>

      <component
        :is="card.meta.comp"
        v-if="card.meta.comp"
        :page-name="pageName"
        :primary-text="card.content"
        :image="card.image"
      />

      <!-- Google Business has no dedicated preview component yet -->
      <div
        v-else
        class="rounded-lg border border-default bg-elevated p-4 text-sm"
      >
        <div class="mb-1 font-semibold">{{ pageName || 'Your Business' }}</div>
        <p class="whitespace-pre-wrap text-muted">{{ card.content || 'Your update will appear here.' }}</p>
      </div>
    </div>
  </div>
</template>
