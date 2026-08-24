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
  <PreviewFrame type="desktop" label="YouTube">
    <div class="w-full">
      <!-- Video player area -->
      <div class="relative bg-black" style="aspect-ratio: 16/9;">
        <AdPreviewCreativeMedia
          :html="html" :html-width="htmlWidth" :html-height="htmlHeight"
          :image="image" label="Video Ad Creative" placeholder-bg="#111" placeholder-fg="#444"
        />

        <!-- Ad badge -->
        <div class="absolute top-3 left-3 bg-yellow-400 text-black text-[10px] font-bold px-1.5 py-0.5 rounded-sm">
          Ad
        </div>

        <!-- Skip button -->
        <div class="absolute bottom-12 right-0 bg-black/80 text-white text-xs px-3 py-1.5 flex items-center gap-1.5 rounded-l border border-r-0 border-white/20">
          Skip Ad
          <UIcon name="i-lucide-skip-forward" class="w-3.5 h-3.5" />
        </div>

        <!-- Progress bar -->
        <div class="absolute bottom-0 left-0 right-0">
          <div class="h-1 bg-gray-700">
            <div class="h-full w-1/4 bg-yellow-400" />
          </div>
          <!-- Controls bar -->
          <div class="h-9 bg-black/90 flex items-center px-3 gap-3">
            <UIcon name="i-lucide-play" class="w-4 h-4 text-white" />
            <UIcon name="i-lucide-skip-forward" class="w-3.5 h-3.5 text-white" />
            <UIcon name="i-lucide-volume-2" class="w-4 h-4 text-white" />
            <span class="text-white text-[10px]">0:05 / 0:30</span>
            <div class="flex-1" />
            <UIcon name="i-lucide-settings" class="w-3.5 h-3.5 text-white" />
            <UIcon name="i-lucide-maximize" class="w-3.5 h-3.5 text-white" />
          </div>
        </div>
      </div>

      <!-- Companion banner -->
      <div class="p-3 bg-[#0f0f0f]">
        <div class="flex items-start gap-2.5">
          <div class="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
            {{ (pageName || 'B')[0].toUpperCase() }}
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-white text-sm font-medium leading-tight truncate">{{ headline || 'Amazing Product' }}</div>
            <div class="text-gray-400 text-xs mt-0.5">{{ pageName || 'Your Brand' }} · Ad</div>
            <p class="text-gray-400 text-xs mt-1 line-clamp-2">{{ description || primaryText || 'Shop the best deals online today.' }}</p>
          </div>
          <button class="shrink-0 bg-white text-black text-xs font-semibold px-3 py-1.5 rounded-full">
            {{ ctaLabel(ctaType || 'LEARN_MORE') }}
          </button>
        </div>
      </div>
    </div>
  </PreviewFrame>
</template>
