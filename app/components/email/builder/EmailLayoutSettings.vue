<!-- app/components/email/builder/EmailLayoutSettings.vue -->
<script setup lang="ts">
import type { EdmEmailLayoutSettings } from '~/types/edm'

const props = defineProps<{ settings: EdmEmailLayoutSettings }>()
const emit = defineEmits<{ update: [Partial<EdmEmailLayoutSettings>] }>()

const FONT_OPTIONS = [
  { label: 'Modern Sans', value: 'MODERN_SANS' },
  { label: 'Book Sans', value: 'BOOK_SANS' },
  { label: 'Geometric Sans', value: 'GEOMETRIC_SANS' },
  { label: 'Modern Serif', value: 'MODERN_SERIF' },
  { label: 'Monospace', value: 'MONOSPACE' }
]

function update<K extends keyof EdmEmailLayoutSettings>(key: K, value: EdmEmailLayoutSettings[K]) {
  emit('update', { [key]: value } as Partial<EdmEmailLayoutSettings>)
}
</script>

<template>
  <div class="space-y-4">
    <UFormField label="Background color">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.backdropColor"
          class="w-12"
          @update:model-value="(v: string) => update('backdropColor', v)"
        />
        <UInput
          :model-value="props.settings.backdropColor"
          class="flex-1"
          @update:model-value="(v: string) => update('backdropColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Content background">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.canvasColor"
          class="w-12"
          @update:model-value="(v: string) => update('canvasColor', v)"
        />
        <UInput
          :model-value="props.settings.canvasColor"
          class="flex-1"
          @update:model-value="(v: string) => update('canvasColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Text color">
      <div class="flex gap-2">
        <UInput
          type="color"
          :model-value="props.settings.textColor"
          class="w-12"
          @update:model-value="(v: string) => update('textColor', v)"
        />
        <UInput
          :model-value="props.settings.textColor"
          class="flex-1"
          @update:model-value="(v: string) => update('textColor', v)"
        />
      </div>
    </UFormField>

    <UFormField label="Font family">
      <USelect
        :model-value="props.settings.fontFamily"
        :items="FONT_OPTIONS"
        value-key="value"
        class="w-full"
        @update:model-value="(v: string) => update('fontFamily', v)"
      />
    </UFormField>
  </div>
</template>
