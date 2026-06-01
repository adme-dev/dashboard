<script setup lang="ts">
// Instagram feed mockup. Intentionally hardcoded bg-white text-black (platform mockup,
// must NOT change in dark mode) — same convention as the other ad-preview components.
const props = defineProps<{
  image?: string
  pageName?: string
  primaryText?: string
  headline?: string
  description?: string
  ctaType?: string
  linkUrl?: string
}>()

const handle = computed(() => (props.pageName || 'yourbrand').toLowerCase().replace(/\s+/g, ''))
const placeholderImg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" fill="%23333"><rect width="600" height="600"/><text x="50%" y="50%" text-anchor="middle" fill="%23666" font-size="24" dy=".3em">Ad Creative</text></svg>')
</script>

<template>
  <div class="bg-white text-black rounded-lg overflow-hidden shadow-lg" style="width: 380px;">
    <!-- Header -->
    <div class="flex items-center gap-2.5 p-3">
      <div class="w-9 h-9 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-0.5 shrink-0">
        <div class="w-full h-full rounded-full bg-white flex items-center justify-center text-sm font-bold">
          {{ (pageName || 'B')[0].toUpperCase() }}
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm leading-tight truncate">{{ handle }}</div>
        <div class="text-[11px] text-gray-500">Sponsored</div>
      </div>
      <UIcon name="i-lucide-more-horizontal" class="w-5 h-5 text-gray-400" />
    </div>

    <!-- Creative -->
    <div class="relative bg-gray-100">
      <img :src="image || placeholderImg" alt="Post creative" class="w-full object-cover" style="aspect-ratio: 1/1;">
    </div>

    <!-- Action row -->
    <div class="flex items-center justify-between px-3 pt-3">
      <div class="flex items-center gap-4">
        <UIcon name="i-lucide-heart" class="w-6 h-6" />
        <UIcon name="i-lucide-message-circle" class="w-6 h-6" />
        <UIcon name="i-lucide-send" class="w-6 h-6" />
      </div>
      <UIcon name="i-lucide-bookmark" class="w-6 h-6" />
    </div>

    <!-- Likes + caption -->
    <div class="px-3 pt-2 pb-3 text-sm">
      <div class="font-semibold">1,248 likes</div>
      <div class="mt-1 leading-snug">
        <span class="font-semibold mr-1">{{ handle }}</span>
        <span>{{ primaryText || 'Check out our latest offer!' }}</span>
      </div>
      <div v-if="linkUrl" class="mt-1 text-[13px] font-semibold text-sky-700 truncate">
        {{ linkUrl.replace(/https?:\/\//, '').split('/')[0] }}
      </div>
      <div class="mt-1 text-[11px] uppercase text-gray-400">2 hours ago</div>
    </div>
  </div>
</template>
