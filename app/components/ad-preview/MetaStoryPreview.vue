<script setup lang="ts">
import PreviewFrame from './PreviewFrame.vue'

defineProps<{
  image?: string
  html?: string
  htmlWidth?: number
  htmlHeight?: number
  pageName?: string
  primaryText?: string
  headline?: string
  description?: string
  ctaType?: string
  linkUrl?: string
}>()

const { ctaLabel } = useAdPreview()

</script>

<template>
  <PreviewFrame type="phone" label="Meta Story / Reel">
    <div class="relative w-full h-full">
      <!-- Background image -->
      <AdPreviewCreativeMedia
        :html="html" :html-width="htmlWidth" :html-height="htmlHeight"
        :image="image" label="Story Creative" placeholder-bg="#222" placeholder-fg="#555"
      />

      <!-- Gradient overlays -->
      <div class="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

      <!-- Story progress bars -->
      <div class="absolute top-7 left-3 right-3 flex gap-1">
        <div class="flex-1 h-0.5 bg-white/40 rounded-full overflow-hidden">
          <div class="h-full w-1/3 bg-white rounded-full" />
        </div>
        <div class="flex-1 h-0.5 bg-white/40 rounded-full" />
        <div class="flex-1 h-0.5 bg-white/40 rounded-full" />
      </div>

      <!-- Profile header -->
      <div class="absolute top-10 left-3 right-3 flex items-center gap-2">
        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-0.5">
          <div class="w-full h-full rounded-full bg-gray-800 flex items-center justify-center text-white text-xs font-bold">
            {{ (pageName || 'B')[0].toUpperCase() }}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <span class="text-white text-xs font-semibold truncate block">{{ pageName || 'Your Brand' }}</span>
        </div>
        <span class="text-white/60 text-[10px] font-medium">Sponsored</span>
        <UIcon name="i-lucide-more-horizontal" class="w-4 h-4 text-white/60" />
      </div>

      <!-- Bottom CTA -->
      <div class="absolute bottom-4 left-3 right-3 flex flex-col items-center gap-2">
        <p v-if="primaryText" class="text-white text-xs text-center line-clamp-2 drop-shadow">{{ primaryText }}</p>
        <div class="flex items-center gap-1.5 text-white text-xs font-semibold">
          <UIcon name="i-lucide-chevron-up" class="w-4 h-4 animate-bounce" />
          {{ ctaLabel(ctaType || 'LEARN_MORE') }}
        </div>
      </div>
    </div>
  </PreviewFrame>
</template>
