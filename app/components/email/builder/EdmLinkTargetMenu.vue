<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const open = ref(false)
const target = ref('url')
const url = ref('')
const targets = [
  { label: 'Normal URL', value: 'url' },
  { label: 'Unsubscribe URL', value: 'unsubscribe' },
  { label: 'View online', value: 'web' }
]
function begin(value: boolean) {
  open.value = value
  if (!value) return
  target.value = props.modelValue === '{{web_version_url}}' ? 'web' : props.modelValue === '{{unsubscribe_url}}' ? 'unsubscribe' : 'url'
  url.value = target.value === 'url' ? props.modelValue : ''
}
function apply() {
  emit('update:modelValue', target.value === 'web' ? '{{web_version_url}}' : target.value === 'unsubscribe' ? '{{unsubscribe_url}}' : url.value)
  open.value = false
}
</script>

<template>
  <div class="@container space-y-2">
    <UInput
      :model-value="modelValue"
      placeholder="https://"
      class="w-full"
      @update:model-value="emit('update:modelValue', String($event))"
    />
    <UPopover :open="open" :content="{ side: 'bottom', align: 'start' }" @update:open="begin">
      <UButton
        label="Link target"
        icon="i-lucide-link"
        size="xs"
        color="neutral"
        variant="soft"
      />
      <template #content>
        <div class="@container w-72 max-w-[calc(100vw-2rem)] space-y-4 bg-default p-4 text-default">
          <UFormField label="Link type">
            <USelect v-model="target" :items="targets" class="w-full" />
          </UFormField>
          <UFormField v-if="target === 'url'" label="URL">
            <UInput v-model="url" placeholder="https://" class="w-full" />
          </UFormField>
          <p class="text-xs text-muted">
            View online requires an enabled, configured campaign with independent review. Templates can keep this token; preview links use example.invalid.
          </p>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="open = false"
            />
            <UButton label="Use link" @click="apply" />
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
