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
  <PreviewFrame type="phone" label="TikTok">
    <div class="relative w-full h-full bg-black">
      <!-- Background creative -->
      <AdPreviewCreativeMedia
        :html="html" :html-width="htmlWidth" :html-height="htmlHeight"
        :image="image" label="TikTok Creative" placeholder-bg="#111" placeholder-fg="#444"
      />

      <!-- Gradient bottom -->
      <div class="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 to-transparent" />

      <!-- Right side action buttons -->
      <div class="absolute right-3 bottom-24 flex flex-col items-center gap-4">
        <!-- Profile -->
        <div class="relative">
          <div class="w-10 h-10 rounded-full bg-gray-700 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
            {{ (pageName || 'B')[0].toUpperCase() }}
          </div>
          <div class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
            <UIcon name="i-lucide-plus" class="w-3 h-3 text-white" />
          </div>
        </div>
        <!-- Heart -->
        <div class="flex flex-col items-center">
          <div class="w-10 h-10 flex items-center justify-center">
            <UIcon name="i-lucide-heart" class="w-7 h-7 text-white drop-shadow" />
          </div>
          <span class="text-white text-[10px]">24.5K</span>
        </div>
        <!-- Comment -->
        <div class="flex flex-col items-center">
          <div class="w-10 h-10 flex items-center justify-center">
            <UIcon name="i-lucide-message-circle" class="w-7 h-7 text-white drop-shadow" />
          </div>
          <span class="text-white text-[10px]">892</span>
        </div>
        <!-- Share -->
        <div class="flex flex-col items-center">
          <div class="w-10 h-10 flex items-center justify-center">
            <UIcon name="i-lucide-share" class="w-7 h-7 text-white drop-shadow" />
          </div>
          <span class="text-white text-[10px]">Share</span>
        </div>
        <!-- Spinning music disc -->
        <div class="w-10 h-10 rounded-full bg-gray-800 border-[3px] border-gray-600 flex items-center justify-center animate-spin" style="animation-duration: 3s;">
          <div class="w-3 h-3 rounded-full bg-gray-400" />
        </div>
      </div>

      <!-- Bottom info -->
      <div class="absolute bottom-4 left-3 right-16">
        <div class="flex items-center gap-1.5 mb-1.5">
          <span class="text-white text-sm font-bold">@{{ pageName?.toLowerCase().replace(/\s+/g, '') || 'yourbrand' }}</span>
          <span class="text-white/60 text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-center">Sponsored</span>
        </div>
        <p class="text-white text-xs line-clamp-2 mb-2">{{ primaryText || 'Check out our latest offer!' }}</p>
        <!-- CTA button -->
        <button class="bg-red-500 text-white text-xs font-semibold px-4 py-1.5 rounded flex items-center gap-1.5">
          <UIcon name="i-lucide-external-link" class="w-3 h-3" />
          {{ ctaLabel(ctaType || 'LEARN_MORE') }}
        </button>
        <!-- Music track -->
        <div class="flex items-center gap-1.5 mt-2">
          <UIcon name="i-lucide-music" class="w-3 h-3 text-white" />
          <span class="text-white text-[10px]">Original Sound - {{ pageName || 'Your Brand' }}</span>
        </div>
      </div>
    </div>
  </PreviewFrame>
</template>
