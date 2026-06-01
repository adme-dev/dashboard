<script setup lang="ts">
// Google Business Profile "What's new" local post mockup. Hardcoded light styling
// (platform mockup, must NOT change in dark mode) — matches the other ad-preview components.
const props = defineProps<{
  image?: string
  pageName?: string
  primaryText?: string
  headline?: string
  description?: string
  ctaType?: string
  linkUrl?: string
}>()

const { ctaLabel } = useAdPreview()
const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" fill="%23e8e8e8"><rect width="600" height="400"/><text x="50%" y="50%" text-anchor="middle" fill="%23999" font-size="20" dy=".3em">Post Image</text></svg>')
</script>

<template>
  <div class="bg-white text-black rounded-xl overflow-hidden shadow-lg border border-gray-200" style="width: 380px;">
    <!-- Header -->
    <div class="flex items-center gap-2.5 p-3">
      <div class="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
        {{ (pageName || 'B')[0].toUpperCase() }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-sm leading-tight truncate">{{ pageName || 'Your Business' }}</div>
        <div class="text-[11px] text-gray-500">Just now · Local post</div>
      </div>
      <div class="flex items-center gap-1 text-[11px] text-gray-400">
        <UIcon name="i-lucide-search" class="w-3.5 h-3.5" />
        <span>Google</span>
      </div>
    </div>

    <!-- Creative -->
    <div class="bg-gray-100">
      <img :src="image || placeholderImg" alt="Post image" class="w-full object-cover" style="aspect-ratio: 4/3;">
    </div>

    <!-- Body -->
    <div class="p-3">
      <p class="text-sm leading-snug whitespace-pre-wrap">{{ primaryText || 'Share an update, offer, or event with customers on Google Search & Maps.' }}</p>
      <a class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
        {{ ctaLabel(ctaType || 'LEARN_MORE') }}
        <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
      </a>
    </div>
  </div>
</template>
