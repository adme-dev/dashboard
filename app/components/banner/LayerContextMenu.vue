<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer | null
  x: number
  y: number
  isDecomposing: boolean
  isAiEditing?: boolean
  multiSelectCount?: number
}>()

const emit = defineEmits<{
  close: []
  decompose: [layer: Layer]
  editWithAi: [layer: Layer]
  mergeLayers: []
  duplicate: [layer: Layer]
  remove: [layer: Layer]
  bringToFront: [layer: Layer]
  sendToBack: [layer: Layer]
}>()

const isImageLayer = computed(() => {
  return props.layer?.type === 'image' && !!props.layer.src
})

const items = computed(() => {
  if (!props.layer) return []
  const groups: any[][] = []

  const group1: any[] = []

  // Edit with AI (image layers only)
  if (isImageLayer.value) {
    group1.push({
      label: props.isAiEditing ? 'Editing...' : 'Edit with AI',
      icon: props.isAiEditing ? 'i-lucide-loader-2' : 'i-lucide-wand-2',
      disabled: props.isAiEditing,
      onSelect: () => emit('editWithAi', props.layer!),
    })
  }

  // Decompose (image layers only)
  if (isImageLayer.value) {
    group1.push({
      label: props.isDecomposing ? 'Decomposing...' : 'Decompose to Layers',
      icon: props.isDecomposing ? 'i-lucide-loader-2' : 'i-lucide-layers',
      disabled: props.isDecomposing,
      onSelect: () => emit('decompose', props.layer!),
    })
  }

  // Merge Layers (multi-select only)
  if ((props.multiSelectCount ?? 0) >= 2) {
    group1.push({
      label: `Merge ${props.multiSelectCount} Layers`,
      icon: 'i-lucide-combine',
      onSelect: () => emit('mergeLayers'),
    })
  }

  group1.push(
    {
      label: 'Duplicate',
      icon: 'i-lucide-copy',
      onSelect: () => emit('duplicate', props.layer!),
    },
    {
      label: 'Bring to Front',
      icon: 'i-lucide-arrow-up-to-line',
      onSelect: () => emit('bringToFront', props.layer!),
    },
    {
      label: 'Send to Back',
      icon: 'i-lucide-arrow-down-to-line',
      onSelect: () => emit('sendToBack', props.layer!),
    },
  )
  groups.push(group1)

  groups.push([
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('remove', props.layer!),
    },
  ])

  return groups
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :open="!!layer"
    @update:open="(v: boolean) => { if (!v) emit('close') }"
  >
    <template #default>
      <span
        class="fixed w-px h-px pointer-events-none"
        :style="{ left: `${x}px`, top: `${y}px` }"
      />
    </template>
  </UDropdownMenu>
</template>
