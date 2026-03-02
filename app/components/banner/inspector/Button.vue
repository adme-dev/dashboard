<script setup lang="ts">
import { FONT_FAMILIES, FONT_WEIGHTS, TEXT_SHADOW_PRESETS, TEXT_STROKE_PRESETS } from '~/utils/banner-constants'

const { selectedLayer, updateLayer } = useBannerStudio()

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

function setNum(key: string, val: string | number) {
  set(key, Number(val))
}

const textTransformOptions = [
  { label: 'None', value: 'none' },
  { label: 'Uppercase', value: 'uppercase' },
  { label: 'Lowercase', value: 'lowercase' },
  { label: 'Capitalize', value: 'capitalize' },
]

const forceCustomShadow = ref(false)
const forceCustomStroke = ref(false)

const shadowPresetValue = computed(() => {
  if (forceCustomShadow.value) return '__custom__'
  const current = selectedLayer.value?.textShadow || 'none'
  const found = TEXT_SHADOW_PRESETS.find(p => p.value === current && p.value !== '__custom__')
  return found ? found.value : '__custom__'
})

const strokePresetValue = computed(() => {
  if (forceCustomStroke.value) return '__custom__'
  const current = selectedLayer.value?.textStroke || 'none'
  const found = TEXT_STROKE_PRESETS.find(p => p.value === current && p.value !== '__custom__')
  return found ? found.value : '__custom__'
})

function setShadowPreset(v: string) {
  if (v === '__custom__') {
    forceCustomShadow.value = true
  } else {
    forceCustomShadow.value = false
    set('textShadow', v === 'none' ? undefined : v)
  }
}

function setStrokePreset(v: string) {
  if (v === '__custom__') {
    forceCustomStroke.value = true
  } else {
    forceCustomStroke.value = false
    set('textStroke', v === 'none' ? undefined : v)
  }
}
</script>

<template>
  <div v-if="selectedLayer" class="space-y-3">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Button</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Label</label>
      <UInput size="xs" :model-value="selectedLayer.text ?? ''" @update:model-value="v => set('text', v)" />
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Font</label>
        <USelectMenu
          size="xs"
          :model-value="selectedLayer.fontFamily ?? 'Barlow Condensed'"
          :items="FONT_FAMILIES.map(f => ({ label: f, value: f }))"
          @update:model-value="v => set('fontFamily', v)"
        />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Weight</label>
        <USelectMenu
          size="xs"
          :model-value="String(selectedLayer.fontWeight ?? 700)"
          :items="FONT_WEIGHTS.map(w => ({ label: w.label, value: String(w.value) }))"
          @update:model-value="v => setNum('fontWeight', v)"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Size</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.fontSize ?? 14" @update:model-value="v => setNum('fontSize', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Radius</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.borderRadius ?? 2" @update:model-value="v => setNum('borderRadius', v)" />
      </div>
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Background</label>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="selectedLayer.bgColor ?? '#e8c84a'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('bgColor', (e.target as HTMLInputElement).value)"
        />
        <UInput size="xs" class="flex-1" :model-value="selectedLayer.bgColor ?? '#e8c84a'" @update:model-value="v => set('bgColor', v)" />
      </div>
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Text Color</label>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="selectedLayer.textColor ?? '#000000'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('textColor', (e.target as HTMLInputElement).value)"
        />
        <UInput size="xs" class="flex-1" :model-value="selectedLayer.textColor ?? '#000000'" @update:model-value="v => set('textColor', v)" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Transform</label>
        <USelectMenu
          size="xs"
          :model-value="selectedLayer.textTransform ?? 'uppercase'"
          :items="textTransformOptions"
          @update:model-value="v => set('textTransform', v)"
        />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Spacing</label>
        <UInput size="xs" :model-value="selectedLayer.letterSpacing ?? '0.1em'" @update:model-value="v => set('letterSpacing', v)" />
      </div>
    </div>

      </div>
    </details>

    <!-- Effects -->
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Effects</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <!-- Italic toggle -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Style</label>
      <div class="flex gap-0.5">
        <UButton
          size="xs"
          icon="i-lucide-italic"
          :variant="selectedLayer.fontStyle === 'italic' ? 'solid' : 'ghost'"
          @click="set('fontStyle', selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic')"
        />
      </div>
    </div>

    <!-- Text Shadow -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Shadow</label>
      <USelectMenu
        size="xs"
        :model-value="shadowPresetValue"
        :items="TEXT_SHADOW_PRESETS.map(p => ({ label: p.label, value: p.value }))"
        @update:model-value="setShadowPreset"
      />
      <UInput
        v-if="shadowPresetValue === '__custom__'"
        size="xs"
        class="mt-1"
        placeholder="2px 2px 4px rgba(0,0,0,0.5)"
        :model-value="selectedLayer.textShadow ?? ''"
        @update:model-value="v => set('textShadow', v || undefined)"
      />
    </div>

    <!-- Text Stroke -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Stroke</label>
      <USelectMenu
        size="xs"
        :model-value="strokePresetValue"
        :items="TEXT_STROKE_PRESETS.map(p => ({ label: p.label, value: p.value }))"
        @update:model-value="setStrokePreset"
      />
      <UInput
        v-if="strokePresetValue === '__custom__'"
        size="xs"
        class="mt-1"
        placeholder="1px #000"
        :model-value="selectedLayer.textStroke ?? ''"
        @update:model-value="v => set('textStroke', v || undefined)"
      />
    </div>
      </div>
    </details>
  </div>
</template>
