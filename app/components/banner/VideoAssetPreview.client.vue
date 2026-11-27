<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import { safeMediaUrl } from '~/utils/safe-url'

const props = defineProps<{ asset: BannerAsset, selectionOnly?: boolean }>()
const emit = defineEmits<{ close: [], insert: [] }>()
const player = ref<HTMLVideoElement | null>(null)
const failed = ref(false)
const source = computed(() => safeMediaUrl(props.asset.url))
const poster = computed(() => safeMediaUrl(props.asset.thumbnailUrl))

watch(source, () => {
  player.value?.pause()
  failed.value = false
}, { flush: 'sync' })
onBeforeUnmount(() => {
  player.value?.pause()
})
</script>

<template>
  <UModal
    :open="true"
    title="Video preview"
    :description="asset.name"
    :ui="{ content: 'sm:max-w-3xl', description: 'break-all', footer: 'justify-end' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <video
        v-if="source && !failed"
        ref="player"
        :key="source"
        :src="source"
        :poster="poster"
        :aria-label="`Preview of ${asset.name}`"
        controls
        autoplay
        muted
        playsinline
        preload="metadata"
        class="aspect-video max-h-[60dvh] w-full rounded-md bg-black object-contain"
        @error="failed = true"
      />
      <UAlert
        v-else
        color="warning"
        title="Could not play this video"
        :actions="source ? [{ label: 'Retry preview', onClick: () => { failed = false } }] : []"
      />
    </template>
    <template #footer>
      <UButton
        label="Close"
        color="neutral"
        variant="ghost"
        @click="emit('close')"
      />
      <UButton
        :label="selectionOnly ? 'Choose video' : 'Insert video'"
        :disabled="!source"
        icon="i-lucide-plus"
        @click="emit('insert')"
      />
    </template>
  </UModal>
</template>
