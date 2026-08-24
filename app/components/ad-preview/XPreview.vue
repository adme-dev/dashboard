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

const { ctaLabel } = useAdPreview()

</script>

<template>
  <div class="bg-black text-white border border-[#2f3336] rounded-xl overflow-hidden" style="width: 380px;">
    <!-- Post header -->
    <div class="flex items-start gap-2.5 p-3 pb-1">
      <div class="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
        {{ (pageName || 'B')[0].toUpperCase() }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="font-bold text-sm truncate">{{ pageName || 'Your Brand' }}</span>
          <UIcon name="i-lucide-badge-check" class="w-4 h-4 text-blue-400 shrink-0" />
          <span class="text-gray-500 text-sm truncate">@{{ pageName?.toLowerCase().replace(/\s+/g, '') || 'yourbrand' }}</span>
        </div>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-medium">Ad</span>
        </div>
      </div>
      <UIcon name="i-lucide-more-horizontal" class="w-5 h-5 text-gray-500 shrink-0" />
    </div>

    <!-- Tweet text -->
    <div class="px-3 pb-2.5 pl-[3.75rem]">
      <p class="text-sm leading-relaxed">{{ primaryText || 'Check out our latest offer!' }}</p>
    </div>

    <!-- Media card -->
    <div class="mx-3 mb-2 ml-[3.75rem] rounded-xl overflow-hidden border border-[#2f3336]">
      <div class="relative w-full" style="aspect-ratio: 16/9;">
        <AdPreviewCreativeMedia
          :html="html" :html-width="htmlWidth" :html-height="htmlHeight"
          :image="image" label="Ad Creative" placeholder-bg="#222" placeholder-fg="#555"
        />
      </div>
      <div class="bg-[#16181c] px-3 py-2.5 border-t border-[#2f3336]">
        <div class="text-xs text-gray-500 truncate">{{ linkUrl?.replace(/https?:\/\//, '').split('/')[0] || 'example.com' }}</div>
        <div class="text-sm font-medium text-white truncate leading-tight mt-0.5">{{ headline || 'Amazing Product' }}</div>
        <div class="text-xs text-gray-500 truncate mt-0.5">{{ description || 'Shop the best deals online today.' }}</div>
      </div>
    </div>

    <!-- CTA button -->
    <div class="mx-3 mb-2.5 ml-[3.75rem]">
      <button class="w-full bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold py-2 rounded-full transition-colors">
        {{ ctaLabel(ctaType || 'LEARN_MORE') }}
      </button>
    </div>

    <!-- Engagement row -->
    <div class="flex items-center justify-between px-3 py-2 pl-[3.75rem] border-t border-[#2f3336]">
      <div class="flex items-center gap-1.5 text-gray-500">
        <UIcon name="i-lucide-message-circle" class="w-4 h-4" />
        <span class="text-xs">142</span>
      </div>
      <div class="flex items-center gap-1.5 text-gray-500">
        <UIcon name="i-lucide-repeat" class="w-4 h-4" />
        <span class="text-xs">89</span>
      </div>
      <div class="flex items-center gap-1.5 text-gray-500">
        <UIcon name="i-lucide-heart" class="w-4 h-4" />
        <span class="text-xs">1.2K</span>
      </div>
      <div class="flex items-center gap-1.5 text-gray-500">
        <UIcon name="i-lucide-bar-chart-2" class="w-4 h-4" />
        <span class="text-xs">45K</span>
      </div>
      <div class="flex items-center gap-1.5 text-gray-500">
        <UIcon name="i-lucide-bookmark" class="w-4 h-4" />
        <UIcon name="i-lucide-upload" class="w-4 h-4" />
      </div>
    </div>
  </div>
</template>
