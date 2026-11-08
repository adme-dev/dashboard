<script setup lang="ts">
import PreviewFrame from './PreviewFrame.vue'

withDefaults(defineProps<{
  showDefaultCta?: boolean
  showLabel?: boolean
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
}>(), { showDefaultCta: true, showLabel: true })

const { ctaLabel } = useAdPreview()
</script>

<template>
  <PreviewFrame type="phone" :label="showLabel ? 'Meta Story / Reel' : undefined" inset-chrome>
    <div class="w-full bg-[#111114] text-white">
      <!-- Keep contextual controls outside the creative, including its logo and legal copy. -->
      <div data-testid="story-header" class="flex h-11 flex-col justify-center gap-1.5 px-3">
        <div class="h-0.5 rounded-full bg-white/25" aria-hidden="true" />
        <div class="flex min-w-0 items-center gap-2">
          <div class="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[9px] font-semibold">
            {{ (pageName || 'B')[0].toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <span class="block truncate text-[10px] font-semibold">{{ pageName || 'Your Brand' }}</span>
            <span class="block text-[8px] text-white/50">Sponsored</span>
          </div>
          <UIcon name="i-lucide-more-horizontal" class="size-3.5 shrink-0 text-white/60" />
        </div>
      </div>

      <!-- An explicit 9:16 box prevents device chrome from changing the artwork's height. -->
      <div data-testid="story-creative" class="relative w-full overflow-hidden bg-black" style="aspect-ratio: 9 / 16;">
        <slot name="creative">
          <AdPreviewCreativeMedia
            :html="html"
            :html-width="htmlWidth"
            :html-height="htmlHeight"
            :image="image"
            label="Story Creative"
            placeholder-bg="#222"
            placeholder-fg="#555"
            fit="contain"
          />
        </slot>
      </div>

      <!-- Bottom CTA -->
      <div data-testid="story-footer" class="flex min-h-9 flex-col items-center justify-center gap-1 px-3 py-2">
        <p v-if="primaryText" class="text-[10px] text-center line-clamp-2">
          {{ primaryText }}
        </p>
        <div v-if="showDefaultCta || ctaType" class="flex items-center gap-1.5 text-[10px] font-semibold">
          <UIcon name="i-lucide-chevron-up" class="size-3" />
          {{ ctaLabel(ctaType || 'LEARN_MORE') }}
        </div>
        <div v-else class="flex w-full items-center gap-3 text-white/50" aria-hidden="true">
          <div class="h-5 flex-1 rounded-full border border-white/15" />
          <UIcon name="i-lucide-heart" class="size-3.5" />
          <UIcon name="i-lucide-send" class="size-3.5" />
        </div>
      </div>
    </div>
  </PreviewFrame>
</template>
