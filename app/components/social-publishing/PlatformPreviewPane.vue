<script setup lang="ts">
import type { SocialPublishPlatform } from '~/types'
import { isVideoMediaUrl } from '~/utils/social/videoMedia'
import MetaFeedPreview from '~/components/ad-preview/MetaFeedPreview.vue'
import InstagramPreview from '~/components/ad-preview/InstagramPreview.vue'
import LinkedInPreview from '~/components/ad-preview/LinkedInPreview.vue'
import TikTokPreview from '~/components/ad-preview/TikTokPreview.vue'
import YouTubePreview from '~/components/ad-preview/YouTubePreview.vue'
import GoogleBusinessPreview from '~/components/ad-preview/GoogleBusinessPreview.vue'

const props = defineProps<{
  platforms: SocialPublishPlatform[]
  pageName?: string
  // (platform) => { content, mediaUrls } — resolved base+override from the composer
  resolve: (platform: string) => { content: string; mediaUrls: string[] }
}>()

const META = {
  facebook: { label: 'Facebook', icon: 'i-lucide-facebook', comp: MetaFeedPreview },
  instagram: { label: 'Instagram', icon: 'i-lucide-instagram', comp: InstagramPreview },
  linkedin: { label: 'LinkedIn', icon: 'i-lucide-linkedin', comp: LinkedInPreview },
  tiktok: { label: 'TikTok', icon: 'i-lucide-music', comp: TikTokPreview },
  youtube: { label: 'YouTube', icon: 'i-lucide-youtube', comp: YouTubePreview },
  'google-business': { label: 'Google Business', icon: 'i-lucide-store', comp: GoogleBusinessPreview },
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

      <div v-if="isVideoMediaUrl(card.image)" class="overflow-hidden rounded-lg border border-default bg-elevated">
        <div class="flex items-center gap-3 p-3">
          <UAvatar :alt="pageName || 'Your business'" size="sm" />
          <div>
            <p class="text-sm font-semibold">{{ pageName || 'Your business' }}</p>
            <p class="text-xs text-muted">Post preview</p>
          </div>
        </div>
        <p class="whitespace-pre-wrap px-3 pb-3 text-sm">{{ card.content }}</p>
        <video :src="card.image" controls playsinline preload="metadata" class="aspect-video w-full bg-default object-contain" :aria-label="`${card.meta.label} video preview`" />
      </div>

      <component
        :is="card.meta.comp"
        v-else-if="card.meta.comp"
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
