<script setup lang="ts">
import PreviewFrame from './PreviewFrame.vue'

defineProps<{
  image?: string
  pageName?: string
  primaryText?: string
  headline?: string
  description?: string
  ctaType?: string
  linkUrl?: string
}>()

const { ctaLabel } = useAdPreview()

const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="700" fill="%23181818"><rect width="400" height="700"/><text x="50%" y="50%" text-anchor="middle" fill="%23666" font-size="18" dy=".3em">Snap Creative</text></svg>')
</script>

<template>
  <PreviewFrame type="phone" label="Snapchat">
    <div class="relative w-full bg-black" style="aspect-ratio: 9/16;">
      <!-- Background -->
      <img
        :src="image || placeholderImg"
        alt="Snapchat creative"
        class="absolute inset-0 w-full h-full object-cover"
      >

      <!-- Gradient overlays -->
      <div class="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />
      <div class="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />

      <!-- Top bar -->
      <div class="absolute top-7 left-3 right-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center">
            <span class="text-white text-sm font-bold">{{ (pageName || 'B')[0].toUpperCase() }}</span>
          </div>
          <div>
            <span class="text-white text-xs font-semibold block">{{ pageName || 'Your Brand' }}</span>
            <span class="text-white/50 text-[10px]">Sponsored</span>
          </div>
        </div>
        <UIcon name="i-lucide-more-vertical" class="w-4 h-4 text-white/70" />
      </div>

      <!-- Headline overlay -->
      <div v-if="headline" class="absolute top-1/2 -translate-y-1/2 left-0 right-0 px-4">
        <div class="bg-black/50 backdrop-blur-sm rounded-lg px-4 py-3 text-center">
          <p class="text-white text-base font-bold">{{ headline }}</p>
        </div>
      </div>

      <!-- Bottom CTA -->
      <div class="absolute bottom-4 left-3 right-3 flex flex-col items-center gap-2">
        <p v-if="primaryText" class="text-white text-xs text-center line-clamp-2 drop-shadow-lg">{{ primaryText }}</p>
        <div class="w-full bg-white/20 backdrop-blur rounded-full py-2.5 flex items-center justify-center gap-1.5">
          <UIcon name="i-lucide-chevrons-up" class="w-4 h-4 text-white animate-bounce" />
          <span class="text-white text-sm font-semibold">{{ ctaLabel(ctaType || 'LEARN_MORE') }}</span>
        </div>
      </div>
    </div>
  </PreviewFrame>
</template>
