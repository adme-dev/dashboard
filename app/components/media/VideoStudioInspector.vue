<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  assetCount?: number
  voiceAssetCount?: number
  overlayAssetCount?: number
  renderJobCount?: number
  modelReady?: boolean
}>(), {
  assetCount: 0,
  voiceAssetCount: 0,
  overlayAssetCount: 0,
  renderJobCount: 0,
  modelReady: false,
})

type InspectorTab = 'details' | 'produce' | 'review'

const activeTab = ref<InspectorTab>('details')

const tabItems = computed(() => [
  {
    label: 'Details',
    icon: 'i-lucide-panel-right',
    value: 'details',
  },
  {
    label: 'Produce',
    icon: 'i-lucide-wand-sparkles',
    value: 'produce',
  },
  {
    label: 'Review',
    icon: 'i-lucide-list-checks',
    value: 'review',
    badge: props.renderJobCount ? String(props.renderJobCount) : undefined,
  },
])

const summaryItems = computed(() => [
  { label: 'Assets', value: props.assetCount, icon: 'i-lucide-library' },
  { label: 'Voice', value: props.voiceAssetCount, icon: 'i-lucide-mic-2' },
  { label: 'Overlays', value: props.overlayAssetCount, icon: 'i-lucide-shapes' },
])
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-panel-right" class="size-4 text-muted" />
          <h3 class="text-xs font-medium uppercase text-muted">Inspector</h3>
        </div>
        <p class="mt-0.5 text-[11px] leading-snug text-muted">
          Context controls for selected media, production, and review.
        </p>
      </div>
      <UBadge
        :label="props.modelReady ? 'AI ready' : 'AI unavailable'"
        :color="props.modelReady ? 'primary' : 'warning'"
        size="xs"
        variant="subtle"
      />
    </div>

    <UTabs
      v-model="activeTab"
      :items="tabItems"
      :content="false"
      size="sm"
      variant="link"
      color="primary"
      aria-label="Video Studio inspector"
    />

    <div class="grid grid-cols-3 divide-x divide-default rounded-md border border-default bg-default/30">
      <div
        v-for="item in summaryItems"
        :key="item.label"
        class="min-w-0 px-2 py-1.5"
      >
        <div class="flex items-center gap-1 text-[10px] uppercase text-muted">
          <UIcon :name="item.icon" class="size-3 shrink-0" />
          <span class="truncate">{{ item.label }}</span>
        </div>
        <p class="mt-0.5 text-sm font-medium text-highlighted">{{ item.value }}</p>
      </div>
    </div>

    <div v-if="activeTab === 'details'" class="min-w-0">
      <slot name="details">
        <div class="rounded-md border border-dashed border-default px-3 py-4 text-center">
          <UIcon name="i-lucide-mouse-pointer-square" class="mx-auto size-4 text-muted" />
          <p class="mt-2 text-xs font-medium text-highlighted">No selection</p>
          <p class="mt-1 text-[11px] text-muted">Select an asset or clip to inspect production details.</p>
        </div>
      </slot>
    </div>

    <div v-else-if="activeTab === 'produce'" class="min-w-0 space-y-3">
      <slot name="produce" />
    </div>

    <div v-else class="min-w-0 space-y-3">
      <slot name="review" />
    </div>
  </section>
</template>
