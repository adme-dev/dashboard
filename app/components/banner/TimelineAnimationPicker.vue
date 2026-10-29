<script setup lang="ts">
import { ANIM_IN, ANIM_OUT } from '~/utils/banner-constants'
import type { AnimInType, AnimOutType, Layer } from '~/types/banner-studio'

const props = defineProps<{
  layer: Layer
  direction: 'in' | 'out'
  compact?: boolean
}>()

const { selectLayer, updateLayer } = useBannerStudio()
const { inspectorTab } = useBannerInspector()
const open = ref(false)

const presets = computed(() => props.direction === 'in' ? ANIM_IN : ANIM_OUT)
const selectedId = computed(() => props.direction === 'in' && props.layer.wordPop ? 'wordPop' : props.direction === 'in' ? props.layer.animIn : (props.layer.animOut ?? 'fadeOut'))
const selectedPreset = computed(() => presets.value.find(preset => preset.id === selectedId.value))
const selectedLabel = computed(() => selectedId.value === 'wordPop' ? 'Words Pop' : (selectedPreset.value?.label ?? 'None'))
const selectedIcon = computed(() => selectedId.value === 'wordPop' ? 'W' : (selectedPreset.value?.icon ?? '○'))
const foreground = computed(() => ['text', 'image', 'button'].includes(props.layer.type) ? '#111827' : '#ffffff')

function focusAnimation() {
  selectLayer(props.layer.id)
  inspectorTab.value = 'animation'
}

function choosePreset(id: AnimInType | AnimOutType) {
  updateLayer(props.layer.id, props.direction === 'in' ? { animIn: id as AnimInType, wordPop: undefined } : { animOut: id as AnimOutType })
  focusAnimation()
  open.value = false
}

function chooseWordPop() {
  updateLayer(props.layer.id, {
    animIn: 'none',
    wordPop: props.layer.wordPop ?? { duration: 0.5, stagger: 0.1, ease: 'cubic-bezier(.21,.79,.09,.97)' }
  })
  focusAnimation()
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ side: 'top', align: direction === 'in' ? 'start' : 'end', sideOffset: 8 }">
    <UButton
      :aria-label="`Edit ${direction === 'in' ? 'entrance' : 'exit'} animation for ${layer.name}: ${selectedLabel}`"
      :aria-expanded="open"
      color="neutral"
      variant="ghost"
      size="xs"
      class="h-5 w-full min-w-0 justify-start gap-1 overflow-hidden rounded-sm px-1 text-[9px] font-semibold hover:bg-white/20"
      :style="{ color: foreground }"
      @mousedown.stop
      @click.stop="focusAnimation"
    >
      <span aria-hidden="true" class="shrink-0 text-sm leading-none">{{ selectedIcon }}</span>
      <span v-if="!compact" class="truncate">{{ selectedLabel }}</span>
    </UButton>

    <template #content>
      <div class="w-[340px] max-w-[calc(100vw-2rem)] rounded-lg border border-default bg-elevated p-3 shadow-xl" @click.stop>
        <div class="mb-3 flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted">
              {{ direction === 'in' ? 'Build In' : 'Build Out' }}
            </p>
            <p class="truncate text-xs text-muted">
              {{ layer.name }} · {{ layer.type }}
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            aria-label="Close animation picker"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="open = false"
          />
        </div>

        <div class="grid grid-cols-3 gap-1.5">
          <UButton
            v-if="direction === 'in' && layer.type === 'text' && !layer.textRuns?.length"
            aria-label="Words Pop entrance animation"
            :aria-pressed="selectedId === 'wordPop'"
            color="neutral"
            variant="ghost"
            class="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 text-center"
            :class="selectedId === 'wordPop' ? 'border-primary bg-primary/10 text-primary' : 'border-default bg-default hover:bg-accented'"
            @click="chooseWordPop"
          >
            <span aria-hidden="true" class="text-xl leading-none">W</span>
            <span class="w-full truncate text-[10px] font-medium">Words Pop</span>
          </UButton>
          <UButton
            v-for="preset in presets"
            :key="preset.id"
            :aria-label="`${preset.label} ${direction === 'in' ? 'entrance' : 'exit'} animation`"
            :aria-pressed="selectedId === preset.id"
            color="neutral"
            variant="ghost"
            class="flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-md border px-1 text-center"
            :class="selectedId === preset.id ? 'border-primary bg-primary/10 text-primary' : 'border-default bg-default hover:bg-accented'"
            @click="choosePreset(preset.id)"
          >
            <span aria-hidden="true" class="text-xl leading-none">{{ preset.icon }}</span>
            <span class="w-full truncate text-[10px] font-medium">{{ preset.label }}</span>
          </UButton>
        </div>

        <div class="mt-3 flex items-center justify-between gap-2 border-t border-default pt-2">
          <span class="text-[11px] text-muted">Timing, easing and keyframes</span>
          <UButton
            label="Open details"
            icon="i-lucide-panel-right-open"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="focusAnimation(); open = false"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
