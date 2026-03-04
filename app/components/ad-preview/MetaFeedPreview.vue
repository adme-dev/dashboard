<script setup lang="ts">
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

const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" fill="%23333"><rect width="600" height="600"/><text x="50%" y="50%" text-anchor="middle" fill="%23666" font-size="24" dy=".3em">Ad Creative</text></svg>')
</script>

<template>
  <div class="bg-white text-black rounded-lg overflow-hidden shadow-lg" style="width: 380px;">
    <!-- Header -->
    <div class="flex items-center gap-2.5 p-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
        {{ (pageName || 'B')[0].toUpperCase() }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm leading-tight truncate">{{ pageName || 'Your Brand' }}</div>
        <div class="text-xs text-gray-500 flex items-center gap-1">
          Sponsored · <UIcon name="i-lucide-globe" class="w-3 h-3" />
        </div>
      </div>
      <UIcon name="i-lucide-more-horizontal" class="w-5 h-5 text-gray-400" />
    </div>

    <!-- Primary text -->
    <div class="px-3 pb-2 text-sm leading-snug">
      {{ primaryText || 'Check out our latest offer!' }}
    </div>

    <!-- Ad creative -->
    <div class="relative bg-gray-100">
      <img
        :src="image || placeholderImg"
        alt="Ad creative"
        class="w-full object-cover"
        style="aspect-ratio: 1/1;"
      >
    </div>

    <!-- Link / CTA bar -->
    <div class="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-t border-gray-200">
      <div class="flex-1 min-w-0 mr-3">
        <div class="text-[10px] text-gray-500 uppercase truncate">{{ linkUrl?.replace(/https?:\/\//, '').split('/')[0] || 'example.com' }}</div>
        <div class="text-sm font-semibold truncate leading-tight">{{ headline || 'Amazing Product' }}</div>
        <div class="text-xs text-gray-500 truncate">{{ description || 'Shop the best deals online today.' }}</div>
      </div>
      <button class="shrink-0 bg-gray-200 hover:bg-gray-300 text-sm font-semibold px-4 py-1.5 rounded transition-colors">
        {{ ctaLabel(ctaType || 'LEARN_MORE') }}
      </button>
    </div>

    <!-- Engagement row -->
    <div class="flex items-center justify-between px-3 py-2 border-t border-gray-200">
      <div class="flex items-center gap-1 text-gray-500 text-xs">
        <div class="flex -space-x-1">
          <div class="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
            <UIcon name="i-lucide-thumbs-up" class="w-2.5 h-2.5 text-white" />
          </div>
          <div class="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
            <UIcon name="i-lucide-heart" class="w-2.5 h-2.5 text-white" />
          </div>
        </div>
        <span>1.2K</span>
      </div>
      <div class="text-xs text-gray-500">48 comments · 12 shares</div>
    </div>

    <div class="flex items-center border-t border-gray-200">
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-500 hover:bg-gray-50 text-sm">
        <UIcon name="i-lucide-thumbs-up" class="w-4 h-4" /> Like
      </button>
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-500 hover:bg-gray-50 text-sm">
        <UIcon name="i-lucide-message-circle" class="w-4 h-4" /> Comment
      </button>
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-500 hover:bg-gray-50 text-sm">
        <UIcon name="i-lucide-share" class="w-4 h-4" /> Share
      </button>
    </div>
  </div>
</template>
