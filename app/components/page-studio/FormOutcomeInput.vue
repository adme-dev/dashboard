<script setup lang="ts">
import type { FormOutcome } from '~~/shared/pageStudio/formOutcomes'

const props = defineProps<{ label: string, pages: Array<{ title: string, route: string }> }>()
const model = defineModel<FormOutcome>({ required: true })
const choices = [{ label: 'Show a message', value: 'message' }, { label: 'Go to a website page', value: 'redirect' }]
function changeType(type: string) {
  model.value = type === 'redirect' ? { type: 'redirect', path: props.pages[0]?.route ?? '/' } : { type: 'message', message: 'Thank you. Your enquiry has been received.' }
}
</script>

<template>
  <div class="@container space-y-4">
    <UFormField :label="label">
      <USelect
        :model-value="model.type"
        :items="choices"
        class="w-full"
        @update:model-value="changeType"
      />
    </UFormField>
    <UFormField v-if="model.type === 'message'" label="Confirmation message" description="Plain text shown after the enquiry is accepted.">
      <UTextarea
        v-model="model.message"
        :rows="3"
        :maxlength="1000"
        class="w-full"
      />
    </UFormField>
    <UFormField v-else label="Destination page" description="Choose a saved page. Form answers are never added to the URL.">
      <USelect v-model="model.path" :items="pages.map(page => ({ label: `${page.title} — ${page.route}`, value: page.route }))" class="w-full" />
    </UFormField>
  </div>
</template>
