<script setup lang="ts">
import type { EmailImage } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ modelValue: EmailImage }>()
const emit = defineEmits<{ 'update:modelValue': [value: EmailImage], 'replace': [] }>()
function update(changes: Partial<EmailImage>) {
  emit('update:modelValue', { ...props.modelValue, ...changes })
}
function setAlignment(value: string) {
  if (value === 'left' || value === 'center' || value === 'right') update({ alignment: value })
}
</script>

<template>
  <div class="@container space-y-3">
    <UButton
      label="Change image"
      icon="i-lucide-image"
      color="neutral"
      variant="outline"
      @click="emit('replace')"
    />
    <UFormField label="Alt text" description="Describe what the image shows. For a logo, use the business name.">
      <UInput :model-value="modelValue.alt" class="w-full" @update:model-value="value => update({ alt: String(value) })" />
    </UFormField>
    <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
      <UFormField label="Width (px)" description="40–600 px. Scales down on small screens.">
        <UInput
          :model-value="modelValue.width"
          type="number"
          :min="40"
          :max="600"
          class="w-full"
          @update:model-value="value => update({ width: Number(value) })"
        />
      </UFormField>
      <UFormField label="Alignment">
        <USelect
          :model-value="modelValue.alignment"
          :items="[{ label: 'Left', value: 'left' }, { label: 'Centre', value: 'center' }, { label: 'Right', value: 'right' }]"
          class="w-full"
          @update:model-value="setAlignment"
        />
      </UFormField>
    </div>
  </div>
</template>
