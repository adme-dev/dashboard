<script setup lang="ts">
import type { Layer } from '~/types/banner-studio'

const { selectedLayer, updateLayer } = useBannerStudio()

function set<K extends keyof Layer>(key: K, val: Layer[K]) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

function setNum(key: 'borderRadius', val: string | number) {
  set(key, Number(val))
}

// The blur control edits only a plain blur; other imported filter chains stay as they are.
const blur = computed(() => {
  const filter = selectedLayer.value?.visualFilter
  if (!filter || filter === 'none') return 0
  const match = /^blur\((\d+(?:\.\d+)?)px\)$/.exec(filter)
  return match ? Number(match[1]) : null
})

function setBlur(val: string | number) {
  const amount = Math.min(128, Math.max(0, Number(val) || 0))
  set('visualFilter', amount ? `blur(${amount}px)` : undefined)
}
</script>

<template>
  <div v-if="selectedLayer">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-accented">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-dimmed transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Rectangle</span>
      </summary>
      <div class="pt-1.5 space-y-3">
        <UFormField label="Fill color" size="xs">
          <div class="flex items-center gap-2">
            <UPopover>
              <UButton
                aria-label="Choose fill color"
                variant="outline"
                size="xs"
                icon="i-lucide-palette"
              />
              <template #content>
                <UColorPicker class="p-3" :model-value="selectedLayer.fillColor ?? '#000000'" @update:model-value="v => set('fillColor', v)" />
              </template>
            </UPopover>
            <UInput
              size="xs"
              class="w-full"
              :model-value="selectedLayer.fillColor ?? '#000000'"
              @update:model-value="v => set('fillColor', v)"
            />
          </div>
        </UFormField>
        <UFormField label="Shape" size="xs">
          <USelect
            size="xs"
            class="w-full"
            :items="[{ label: 'Rectangle', value: 'rect' }, { label: 'Ellipse', value: 'ellipse' }]"
            :model-value="selectedLayer.rectShape ?? 'rect'"
            @update:model-value="v => set('rectShape', v === 'ellipse' ? 'ellipse' : undefined)"
          />
        </UFormField>
        <UFormField v-if="selectedLayer.rectShape !== 'ellipse'" label="Border radius" size="xs">
          <UInput
            type="number"
            size="xs"
            class="w-full"
            min="0"
            :model-value="selectedLayer.borderRadius ?? 0"
            @update:model-value="v => setNum('borderRadius', v)"
          />
        </UFormField>
        <UFormField v-if="blur !== null" label="Blur (px)" size="xs">
          <UInput
            type="number"
            size="xs"
            class="w-full"
            min="0"
            max="128"
            :model-value="blur"
            @update:model-value="v => setBlur(v)"
          />
        </UFormField>
        <p v-else class="text-xs text-dimmed">
          Imported filter: {{ selectedLayer.visualFilter }}
        </p>
        <p class="text-xs text-dimmed">
          Shape and blur apply to this layout.
        </p>
      </div>
    </details>
  </div>
</template>
