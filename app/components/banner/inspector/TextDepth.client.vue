<script setup lang="ts">
import { DEFAULT_TEXT_DEPTH, bannerTextDepthSchema, type BannerTextDepth } from '~~/shared/bannerEffects'

const props = defineProps<{ modelValue?: BannerTextDepth, disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: BannerTextDepth | undefined] }>()
const fields = [
  { key: 'size', label: 'Depth', max: 24, step: 1, unit: 'px' },
  { key: 'angle', label: 'Depth direction', min: -180, max: 180, step: 1, unit: '°' },
  { key: 'bevel', label: 'Bevel', max: 3, step: 0.25, unit: 'px' },
  { key: 'lightAngle', label: 'Light direction', min: -180, max: 180, step: 1, unit: '°' },
  { key: 'shadow', label: 'Shadow softness', max: 32, step: 1, unit: 'px' },
  { key: 'shadowOpacity', label: 'Shadow opacity', max: 1, step: 0.05, unit: '' }
] as const
function update(key: keyof BannerTextDepth, value: unknown) {
  if (props.disabled || !props.modelValue) return
  const next = bannerTextDepthSchema.safeParse({ ...props.modelValue, [key]: value })
  if (next.success) emit('update:modelValue', next.data)
}
</script>

<template>
  <section class="space-y-3 border-t border-white/10 pt-3">
    <UFormField label="Dimensional lettering">
      <UCheckbox
        :model-value="!!modelValue"
        label="3D heading · keep my font"
        :disabled="disabled"
        @update:model-value="emit('update:modelValue', $event ? { ...DEFAULT_TEXT_DEPTH } : undefined)"
      />
    </UFormField>
    <p class="text-muted leading-relaxed">
      Depth follows your original lettering. The surrounding area stays transparent; text and motion remain editable.
    </p>
    <template v-if="modelValue">
      <UFormField v-for="field in fields" :key="field.key" :label="`${field.label} · ${modelValue[field.key]}${field.unit}`">
        <USlider
          :model-value="modelValue[field.key]"
          :min="'min' in field ? field.min : 0"
          :max="field.max"
          :step="field.step"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update(field.key, $event)"
        />
      </UFormField>
      <UFormField label="Depth colour">
        <UInput
          :model-value="modelValue.color"
          type="color"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update('color', $event)"
        />
      </UFormField>
    </template>
  </section>
</template>
