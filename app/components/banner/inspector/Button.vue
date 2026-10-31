<script setup lang="ts">
import { FONT_FAMILIES, TEXT_SHADOW_PRESETS, TEXT_STROKE_PRESETS } from '~/utils/banner-constants'
import { parseBannerFontTags as parseFontTags } from '~~/shared/banner/fonts'
import { bannerFontWeightOptions } from '~/utils/banner-font-weights'

const { state, selectedLayer, updateLayer } = useBannerStudio()
const { getFont, customFonts, fetchCustomFonts } = useBannerFonts(() => state.project?.clientId ?? null)
onMounted(() => {
  void fetchCustomFonts()
})
const fontWeightOptions = computed(() => bannerFontWeightOptions(
  getFont(selectedLayer.value?.fontFamily ?? 'Barlow Condensed')?.weights,
  selectedLayer.value?.fontWeight ?? 700
))

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  if (key === 'fontFamily' || key === 'fontWeight') {
    const family = key === 'fontFamily' ? String(val) : selectedLayer.value.fontFamily
    const weight = key === 'fontWeight' ? Number(val) : selectedLayer.value.fontWeight ?? 700
    const face = customFonts.value.find(face => face.name === family && parseFontTags(face.tags).weight === weight)
    updateLayer(selectedLayer.value.id, { [key]: val, fontAssetId: face?.id })
  } else updateLayer(selectedLayer.value.id, { [key]: val })
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
  <div v-if="selectedLayer" class="@container space-y-3">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-accented">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-dimmed transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Button</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <div>
      <label>Label</label>
      <UInput size="xs" class="w-full" :model-value="selectedLayer.text ?? ''" @update:model-value="v => set('text', v)" />
    </div>

    <div class="grid grid-cols-1 gap-1.5 @lg:grid-cols-2">
      <UFormField label="Font">
        <USelectMenu
          size="xs"
          class="w-full"
          :model-value="selectedLayer.fontFamily ?? 'Barlow Condensed'"
          :items="FONT_FAMILIES.map(f => ({ label: f, value: f }))"
          value-key="value"
          @update:model-value="v => set('fontFamily', v)"
        />
      </UFormField>
          <UFormField label="Weight">
            <USelectMenu
              size="xs"
              class="w-full"
              :model-value="String(selectedLayer.fontWeight ?? 700)"
              :items="fontWeightOptions"
              value-key="value"
              @update:model-value="v => setNum('fontWeight', v)"
            />
          </UFormField>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label>Size</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.fontSize ?? 14" @update:model-value="v => setNum('fontSize', v)" />
      </div>
      <div>
        <label>Radius</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.borderRadius ?? 2" @update:model-value="v => setNum('borderRadius', v)" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label>Background</label>
        <div class="flex items-center gap-1.5">
          <input
            type="color"
            :value="selectedLayer.bgColor ?? '#e8c84a'"
            @input="(e: Event) => set('bgColor', (e.target as HTMLInputElement).value)"
          >
          <UInput size="xs" class="flex-1 min-w-0" :model-value="selectedLayer.bgColor ?? '#e8c84a'" @update:model-value="v => set('bgColor', v)" />
        </div>
      </div>
      <div>
        <label>Text</label>
        <div class="flex items-center gap-1.5">
          <input
            type="color"
            :value="selectedLayer.textColor ?? '#000000'"
            @input="(e: Event) => set('textColor', (e.target as HTMLInputElement).value)"
          >
          <UInput size="xs" class="flex-1 min-w-0" :model-value="selectedLayer.textColor ?? '#000000'" @update:model-value="v => set('textColor', v)" />
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label>Transform</label>
        <USelectMenu
          size="xs"
          class="w-full"
          :model-value="selectedLayer.textTransform ?? 'uppercase'"
          :items="textTransformOptions"
          value-key="value"
          @update:model-value="v => set('textTransform', v)"
        />
      </div>
      <div>
        <label>Spacing</label>
        <UInput size="xs" :model-value="selectedLayer.letterSpacing ?? '0.1em'" @update:model-value="v => set('letterSpacing', v)" />
      </div>
    </div>

      </div>
    </details>

    <!-- Effects -->
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-accented">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-dimmed transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted">Effects</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <!-- Style + Shadow + Stroke on one rhythm: toggle | preset | preset -->
    <div class="grid grid-cols-[auto_1fr_1fr] gap-1.5 items-end">
      <div>
        <label>Style</label>
        <UButton
          size="xs"
          icon="i-lucide-italic"
          color="neutral"
          :variant="selectedLayer.fontStyle === 'italic' ? 'solid' : 'subtle'"
          title="Italic"
          @click="set('fontStyle', selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic')"
        />
      </div>
      <div>
        <label>Shadow</label>
        <USelectMenu
          size="xs"
          class="w-full"
          :model-value="shadowPresetValue"
          :items="TEXT_SHADOW_PRESETS.map(p => ({ label: p.label, value: p.value }))"
          value-key="value"
          @update:model-value="setShadowPreset"
        />
      </div>
      <div>
        <label>Stroke</label>
        <USelectMenu
          size="xs"
          class="w-full"
          :model-value="strokePresetValue"
          :items="TEXT_STROKE_PRESETS.map(p => ({ label: p.label, value: p.value }))"
          value-key="value"
          @update:model-value="setStrokePreset"
        />
      </div>
    </div>
    <div v-if="shadowPresetValue === '__custom__' || strokePresetValue === '__custom__'" class="space-y-1.5">
      <UInput
        v-if="shadowPresetValue === '__custom__'"
        size="xs"
        placeholder="Shadow: 2px 2px 4px rgba(0,0,0,0.5)"
        :model-value="selectedLayer.textShadow ?? ''"
        @update:model-value="v => set('textShadow', v || undefined)"
      />
      <UInput
        v-if="strokePresetValue === '__custom__'"
        size="xs"
        placeholder="Stroke: 1px #000"
        :model-value="selectedLayer.textStroke ?? ''"
        @update:model-value="v => set('textStroke', v || undefined)"
      />
    </div>
      </div>
    </details>
  </div>
</template>
