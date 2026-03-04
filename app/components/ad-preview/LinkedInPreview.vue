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

const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" fill="%23e8e8e8"><rect width="600" height="400"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="20" dy=".3em">Ad Creative</text></svg>')
</script>

<template>
  <div class="bg-white text-black rounded-lg overflow-hidden shadow-lg" style="width: 380px;">
    <!-- Header -->
    <div class="flex items-center gap-2.5 p-3">
      <div class="w-12 h-12 rounded bg-blue-700 flex items-center justify-center text-white text-lg font-bold shrink-0">
        {{ (pageName || 'B')[0].toUpperCase() }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm leading-tight truncate">{{ pageName || 'Your Brand' }}</div>
        <div class="text-xs text-gray-500">12,345 followers</div>
        <div class="text-xs text-gray-400 flex items-center gap-1">
          Promoted · <UIcon name="i-lucide-globe" class="w-3 h-3" />
        </div>
      </div>
      <UIcon name="i-lucide-more-horizontal" class="w-5 h-5 text-gray-400" />
    </div>

    <!-- Primary text -->
    <div class="px-3 pb-2 text-sm leading-snug">
      {{ primaryText || 'Check out our latest offer!' }}
    </div>

    <!-- Ad creative -->
    <div class="bg-gray-100">
      <img
        :src="image || placeholderImg"
        alt="Ad creative"
        class="w-full object-cover"
        style="aspect-ratio: 1.2/1;"
      >
    </div>

    <!-- Link bar -->
    <div class="px-3 py-2.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
      <div class="flex-1 min-w-0 mr-3">
        <div class="text-sm font-semibold truncate leading-tight">{{ headline || 'Amazing Product' }}</div>
        <div class="text-xs text-gray-500 truncate">{{ linkUrl?.replace(/https?:\/\//, '').split('/')[0] || 'example.com' }}</div>
      </div>
      <button class="shrink-0 border border-blue-600 text-blue-600 hover:bg-blue-50 text-sm font-semibold px-4 py-1.5 rounded-full transition-colors">
        {{ ctaLabel(ctaType || 'LEARN_MORE') }}
      </button>
    </div>

    <!-- Engagement row -->
    <div class="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 border-t border-gray-100">
      <span>2,847 reactions</span>
      <span>64 comments · 23 reposts</span>
    </div>

    <div class="flex items-center border-t border-gray-200">
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
        <UIcon name="i-lucide-thumbs-up" class="w-4 h-4" /> Like
      </button>
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
        <UIcon name="i-lucide-message-circle" class="w-4 h-4" /> Comment
      </button>
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
        <UIcon name="i-lucide-repeat" class="w-4 h-4" /> Repost
      </button>
      <button class="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-gray-600 hover:bg-gray-50 text-xs font-semibold">
        <UIcon name="i-lucide-send" class="w-4 h-4" /> Send
      </button>
    </div>
  </div>
</template>
