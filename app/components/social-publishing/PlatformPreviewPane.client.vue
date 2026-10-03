<script setup lang="ts">
import type { SocialPublishPlatform } from '~/types'
import { isVideoMediaUrl } from '~/utils/social/videoMedia'

const props = defineProps<{
  platforms: SocialPublishPlatform[]
  pageName?: string
  resolve: (platform: string) => { content: string, mediaUrls: string[] }
}>()
const networks = {
  'facebook': { label: 'Facebook', icon: 'i-lucide-facebook' },
  'instagram': { label: 'Instagram', icon: 'i-lucide-instagram' },
  'linkedin': { label: 'LinkedIn', icon: 'i-lucide-linkedin' },
  'tiktok': { label: 'TikTok', icon: 'i-lucide-music' },
  'youtube': { label: 'YouTube', icon: 'i-lucide-youtube' },
  'google-business': { label: 'Google Business', icon: 'i-lucide-store' }
}
const cards = computed(() => props.platforms.map(platform => ({
  platform, ...networks[platform], ...props.resolve(platform)
})))
</script>

<template>
  <div class="w-full min-w-0 space-y-5">
    <p v-if="!platforms.length" class="text-sm text-muted">
      Select one or more networks to preview the post.
    </p>
    <article v-for="card in cards" :key="card.platform" class="min-w-0 overflow-hidden rounded-lg border border-default bg-default">
      <div class="flex items-center gap-3 border-b border-default p-4">
        <UAvatar :alt="pageName || 'Your business'" size="sm" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-semibold">
            {{ pageName || 'Your business' }}
          </p>
          <p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <UIcon :name="card.icon" class="size-3.5" />
            {{ card.label }} · Organic post preview
          </p>
        </div>
      </div>
      <p class="whitespace-pre-wrap p-4 text-sm leading-6 [overflow-wrap:anywhere]">
        {{ card.content || 'Your post copy will appear here.' }}
      </p>
      <div v-if="card.mediaUrls?.length" class="space-y-3 bg-elevated p-3">
        <figure v-for="(media, index) in card.mediaUrls" :key="`${index}-${media}`" class="min-w-0">
          <video
            v-if="isVideoMediaUrl(media)"
            :src="media"
            controls
            playsinline
            preload="metadata"
            class="block max-h-96 w-full rounded-md bg-default object-contain"
            :aria-label="`${card.label} video ${index + 1} preview`"
          />
          <a
            v-else
            :href="media"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`Open attachment ${index + 1} at full size`"
            class="block"
          >
            <img
              :src="media"
              :alt="`Post artwork ${index + 1}`"
              loading="lazy"
              class="max-h-96 w-full rounded-md object-contain"
            >
          </a>
          <figcaption v-if="card.mediaUrls.length > 1" class="mt-1 text-center text-xs text-muted">
            {{ index + 1 }} of {{ card.mediaUrls.length }}
          </figcaption>
        </figure>
      </div>
      <p class="border-t border-default p-3 text-xs text-muted">
        Layout preview. The network controls the final appearance.
      </p>
    </article>
  </div>
</template>
