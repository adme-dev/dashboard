<script setup lang="ts">
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

</script>

<template>
  <div class="rounded-2xl overflow-hidden shadow-lg bg-white" style="width: 260px;">
    <!-- Pin image -->
    <div class="relative">
      <div class="relative w-full" style="aspect-ratio: 2/3;">
        <AdPreviewCreativeMedia
          :html="html" :html-width="htmlWidth" :html-height="htmlHeight"
          :image="image" label="Pin Creative" placeholder-bg="#f0e6e6" placeholder-fg="#c88"
        />
      </div>
      <!-- Promoted badge -->
      <div class="absolute top-2.5 left-2.5 bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full backdrop-blur-sm">
        Promoted
      </div>
      <!-- Save button -->
      <div class="absolute top-2.5 right-2.5 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-full">
        Save
      </div>
      <!-- Action buttons on hover area -->
      <div class="absolute bottom-2.5 right-2.5 flex gap-1.5">
        <div class="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
          <UIcon name="i-lucide-upload" class="w-4 h-4 text-gray-700" />
        </div>
        <div class="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
          <UIcon name="i-lucide-more-horizontal" class="w-4 h-4 text-gray-700" />
        </div>
      </div>
    </div>

    <!-- Pin info -->
    <div class="p-3">
      <div v-if="linkUrl" class="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <UIcon name="i-lucide-arrow-up-right" class="w-3 h-3" />
        {{ linkUrl.replace(/https?:\/\//, '').split('/')[0] }}
      </div>
      <h3 class="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{{ headline || 'Amazing Product' }}</h3>
      <p v-if="description" class="text-xs text-gray-500 mt-1 line-clamp-2">{{ description }}</p>

      <!-- Author row -->
      <div class="flex items-center gap-2 mt-2.5">
        <div class="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center text-red-600 text-[10px] font-bold">
          {{ (pageName || 'B')[0].toUpperCase() }}
        </div>
        <span class="text-xs text-gray-700 font-medium truncate">{{ pageName || 'Your Brand' }}</span>
      </div>
    </div>
  </div>
</template>
