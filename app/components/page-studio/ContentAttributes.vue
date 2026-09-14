<script setup lang="ts">
import type { PageStudioContentRecord } from '~~/shared/pageStudio/businessContent'

const model = defineModel<PageStudioContentRecord['attributes']>({ required: true })
defineProps<{ disabled: boolean }>()
const adding = ref(false)
const name = ref('')
const kind = ref('text')
const error = ref('')
const kinds = [{ label: 'Text', value: 'text' }, { label: 'Number', value: 'number' }, { label: 'Yes / no', value: 'boolean' }, { label: 'List of text', value: 'list' }]
function add() {
  const key = name.value.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key)
    || Object.hasOwn(model.value, key) || Object.keys(model.value).length >= 30) {
    error.value = 'Use a unique field name with letters, numbers, underscores or hyphens. Each entry supports 30 fields.'
    return
  }
  model.value = { ...model.value, [key]: kind.value === 'number' ? 0 : kind.value === 'boolean' ? false : kind.value === 'list' ? [] : '' }
  name.value = ''
  error.value = ''
  adding.value = false
}
function update(key: string, value: PageStudioContentRecord['attributes'][string]) {
  model.value = { ...model.value, [key]: value }
}
function remove(key: string) {
  model.value = Object.fromEntries(Object.entries(model.value).filter(([name]) => name !== key))
}
</script>

<template>
  <div class="space-y-4 @lg:col-span-2">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="font-medium text-highlighted">
        Additional details
      </h2>
      <UButton
        label="Add field"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        :disabled="disabled || Object.keys(model).length >= 30"
        @click="() => { adding = true }"
      />
    </div>
    <div v-for="(value, key) in model" :key="key" class="flex min-w-0 items-start gap-2">
      <UFormField :label="String(key).replaceAll('_', ' ')" class="min-w-0 flex-1">
        <UCheckbox
          v-if="typeof value === 'boolean'"
          :model-value="value"
          :disabled="disabled"
          label="Yes"
          @update:model-value="update(String(key), $event === true)"
        />
        <UInput
          v-else-if="typeof value === 'number'"
          type="number"
          :model-value="value"
          :disabled="disabled"
          class="w-full"
          @update:model-value="update(String(key), Number($event))"
        />
        <UTextarea
          v-else-if="Array.isArray(value)"
          :model-value="value.join('\n')"
          :disabled="disabled"
          :rows="3"
          class="w-full"
          placeholder="One value per line"
          @update:model-value="update(String(key), $event ? $event.split('\n') : [])"
        />
        <UTextarea
          v-else
          :model-value="value ?? ''"
          :disabled="disabled"
          :maxlength="4000"
          :rows="2"
          class="w-full"
          @update:model-value="update(String(key), $event)"
        />
      </UFormField>
      <UButton
        :aria-label="`Remove ${key} field`"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        class="mt-6 shrink-0"
        :disabled="disabled"
        @click="remove(String(key))"
      />
    </div>
    <UModal v-model:open="adding" title="Add a detail field" description="Store information such as passenger capacity, service area or a product reference.">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Field name" required>
            <UInput
              v-model="name"
              class="w-full"
              :maxlength="100"
              :disabled="disabled"
            />
          </UFormField>
          <UFormField label="Value type">
            <USelect
              v-model="kind"
              :items="kinds"
              class="w-full"
              :disabled="disabled"
            />
          </UFormField>
          <UAlert
            v-if="error"
            title="Check the field name"
            :description="error"
            color="warning"
          />
        </div>
      </template>
      <template #footer>
        <UButton label="Add field" :disabled="disabled || !name.trim()" @click="add" />
      </template>
    </UModal>
  </div>
</template>
