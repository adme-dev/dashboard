<!-- app/components/email/builder/EmailLayoutSettings.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { EdmEmailLayoutSettings } from '~/types/edm'
import { resolveEmailContentWidth } from '~~/shared/emailRendering/layout'

const props = defineProps<{ settings: EdmEmailLayoutSettings }>()
const emit = defineEmits<{ update: [Partial<EdmEmailLayoutSettings>] }>()
const widthDraft = ref<string | number>(resolveEmailContentWidth(props.settings.contentWidth))
watch(() => props.settings.contentWidth, (value) => {
  widthDraft.value = resolveEmailContentWidth(value)
})

function updateWidthDraft(value: string | number) {
  widthDraft.value = value
  const width = Number(value)
  if (Number.isInteger(width) && width >= 320 && width <= 960) update('contentWidth', resolveEmailContentWidth(width))
}

function commitWidth() {
  const width = resolveEmailContentWidth(widthDraft.value)
  widthDraft.value = width
  update('contentWidth', width)
}

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
  <div class="space-y-4 @container">
    <UFormField label="Email width" help="Generated email content, from 320 to 960 pixels.">
      <UInput
        type="number"
        :model-value="widthDraft"
        :min="320"
        :max="960"
        class="w-full"
        @update:model-value="updateWidthDraft"
        @blur="commitWidth"
        @keydown.enter="commitWidth"
      />
    </UFormField>
    <div class="space-y-3 border-b border-default pb-4">
      <UFormField label="Dark email styling" help="Opt in for generated emails. Imported full documents keep their own styles. Support varies by email app.">
        <UCheckbox
          :model-value="props.settings.darkMode === true"
          label="Enable dark styling"
          @update:model-value="(v: boolean | 'indeterminate') => update('darkMode', v === true)"
        />
      </UFormField>
      <template v-if="props.settings.darkMode === true">
        <UFormField label="Dark background">
          <UInput
            type="color"
            :model-value="props.settings.darkBackdropColor || '#111827'"
            class="w-full"
            @update:model-value="(v: string) => update('darkBackdropColor', v)"
          />
        </UFormField>
        <UFormField label="Dark content background">
          <UInput
            type="color"
            :model-value="props.settings.darkCanvasColor || '#1f2937'"
            class="w-full"
            @update:model-value="(v: string) => update('darkCanvasColor', v)"
          />
        </UFormField>
        <UFormField label="Dark default text" help="Custom block text colors remain as authored.">
          <UInput
            type="color"
            :model-value="props.settings.darkTextColor || '#f3f4f6'"
            class="w-full"
            @update:model-value="(v: string) => update('darkTextColor', v)"
          />
        </UFormField>
      </template>
    </div>
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
