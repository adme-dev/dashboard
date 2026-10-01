<script setup lang="ts">
import type { PageStudioSavedPages } from '~~/shared/pageStudio/savedPages'

const props = defineProps<{ siteId: string, pages: PageStudioSavedPages['pages'], checkpointId?: string }>()
const emit = defineEmits<{ dirty: [value: boolean], reload: [], enquiries: [value: { formId: string, pageRoute: string, name: string }] }>()
const selectedKey = ref('__none__')
const dirty = ref(false)
const tab = ref('settings')
const forms = computed(() => props.pages.flatMap(page => page.forms.map(form => ({ ...form, key: `${page.id}:${form.id}`, pageId: page.id, pageTitle: page.title, route: page.route }))))
const selected = computed(() => forms.value.find(form => form.key === selectedKey.value))
const choices = computed(() => forms.value.map(form => ({ label: `${form.name || 'Website form'} — ${form.route}`, value: form.key })))
watch(forms, (value) => {
  if (!value.some(form => form.key === selectedKey.value)) selectedKey.value = value[0]?.key ?? '__none__'
}, { immediate: true })
const destinations = computed(() => props.pages.filter(page => ['public', 'hidden'].includes(page.visibility)))
watch(dirty, value => emit('dirty', value))
watch(selectedKey, () => {
  tab.value = 'settings'
})
</script>

<template>
  <section class="min-w-0 space-y-6" aria-label="Form settings">
    <div>
      <h2 class="text-xl font-semibold tracking-tight text-highlighted">
        Forms
      </h2><p class="mt-1 text-sm text-muted">
        Manage fields and what happens after someone submits a form.
      </p>
    </div>
    <UFormField v-if="forms.length" label="Form placement" :description="dirty ? 'Save or discard your changes before switching forms.' : undefined">
      <USelect
        v-model="selectedKey"
        :items="choices"
        :disabled="dirty"
        class="w-full"
      />
    </UFormField>
    <UAlert
      v-if="!selected"
      title="No saved forms"
      description="Add a form to your website in Page Studio to manage it here."
      color="neutral"
    />
    <template v-else>
      <div class="flex flex-wrap items-start justify-between gap-3 border-b border-default pb-4">
        <div>
          <h3 class="font-semibold text-highlighted">
            {{ selected.name || 'Website form' }}
          </h3><p class="mt-1 text-sm text-muted">
            {{ selected.pageTitle }} · {{ selected.route }}
          </p>
        </div>
        <UButton
          label="View enquiries"
          icon="i-lucide-inbox"
          color="neutral"
          variant="outline"
          :disabled="dirty"
          @click="emit('enquiries', { formId: selected.id, pageRoute: selected.route, name: selected.name || 'Website form' })"
        />
      </div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Form views">
        <UButton
          v-for="item in [{ value: 'settings', label: 'After submission' }, { value: 'fields', label: 'Fields' }]"
          :key="item.value"
          :label="item.label"
          color="neutral"
          :variant="tab === item.value ? 'soft' : 'ghost'"
          :disabled="dirty && tab !== item.value"
          @click="() => { tab = item.value }"
        />
      </div>
      <PageStudioFormSettingsEditor
        v-if="tab === 'settings' && checkpointId && selected.fields"
        :key="`${selected.key}:${checkpointId}`"
        :site-id="siteId"
        :page-id="selected.pageId"
        :form-id="selected.id"
        :checkpoint-id="checkpointId"
        :fields="selected.fields"
        :pages="destinations"
        @dirty="dirty = $event"
        @reload="emit('reload')"
      />
      <div v-else-if="tab === 'fields'" class="divide-y divide-default border-y border-default">
        <div v-for="field in selected.fields || []" :key="field.id" class="flex flex-wrap items-start justify-between gap-3 py-4">
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ field.name }}
            </p><p v-if="field.description" class="mt-1 text-sm text-muted">
              {{ field.description }}
            </p><p v-if="field.options?.length" class="mt-1 text-xs text-muted">
              {{ field.options.join(', ') }}
            </p>
          </div>
          <div class="flex gap-2">
            <UBadge :label="field.type" color="neutral" variant="subtle" /><UBadge
              v-if="field.required"
              label="Required"
              color="neutral"
              variant="outline"
            />
          </div>
        </div>
        <p class="py-4 text-xs text-muted">
          Fields are shown from the saved website. Field editing remains in Page Studio.
        </p>
      </div>
      <UAlert
        v-else
        title="Form details are unavailable"
        color="neutral"
        description="Reload the saved website to check this form."
      />
    </template>
  </section>
</template>
