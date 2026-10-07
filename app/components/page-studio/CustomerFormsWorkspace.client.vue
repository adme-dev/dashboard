<script setup lang="ts">
import type { FormApiAudience } from '~/utils/pageStudioFormApi'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'
import type { PageStudioSavedPages } from '~~/shared/pageStudio/savedPages'

const props = withDefaults(defineProps<{ siteId: string, apiAudience?: FormApiAudience, canEdit?: boolean, assets: StandaloneSiteWorkspace['assets'], pages: PageStudioSavedPages['pages'], checkpointId?: string, formLibrary?: PageStudioSavedPages['formLibrary'], reloadWorkspace: () => Promise<unknown> }>(), { canEdit: undefined })
// Every editor uses an immutable request scope and is remounted when its session/site changes.
const scopeKey = computed(() => `${props.apiAudience ?? 'portal'}:${props.siteId}`)
const emit = defineEmits<{ dirty: [value: boolean], reload: [], enquiries: [value: { placements: Array<{ formId: string, pageRoute?: string }>, name: string }] }>()
const selectedKey = ref('__none__')
const dirty = ref(false)
const tab = ref('settings')
const websiteDefaults = ref(false)
const emailView = ref('recipients')
const previewForms = computed(() => forms.value.flatMap(item => item.placements[0] ? [{ key: item.key, name: item.form.name || 'Website form', pageId: item.placements[0].pageId, formId: item.placements[0].formId }] : []))
const recipientForms = computed(() => forms.value.map(item => ({ definitionId: item.definitionId, name: item.form.name || 'Website form' })))
const forms = computed(() => formCatalogue(props.pages, props.formLibrary))
const selected = computed(() => forms.value.find(form => form.key === selectedKey.value))
const firstPlacement = computed(() => selected.value?.placements[0])
const choices = computed(() => forms.value.map(entry => ({ label: entry.definitionId ? `${entry.form.name || 'Website form'} (${entry.placements.length} ${entry.placements.length === 1 ? 'page' : 'pages'})` : `${entry.form.name || 'Website form'} — ${entry.placements[0]?.route}`, value: entry.key })))
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
    <UButton
      v-if="checkpointId"
      :label="websiteDefaults ? 'Back to forms' : 'Website email defaults'"
      icon="i-lucide-mail"
      color="neutral"
      variant="outline"
      :disabled="dirty"
      @click="() => { websiteDefaults = !websiteDefaults }"
    />
    <template v-if="websiteDefaults && checkpointId">
      <div class="flex flex-wrap gap-2" role="group" aria-label="Website email settings">
        <UButton
          v-for="item in [{ value: 'recipients', label: 'Team recipients' }, { value: 'team', label: 'Team template' }, { value: 'customer', label: 'Customer template' }]"
          :key="item.value"
          :label="item.label"
          color="neutral"
          :variant="emailView === item.value ? 'soft' : 'ghost'"
          :disabled="dirty && emailView !== item.value"
          @click="() => { emailView = item.value }"
        />
      </div>
      <PageStudioFormRecipientsEditor
        v-if="emailView === 'recipients'"
        :key="`${scopeKey}:website-recipients`"
        :site-id="siteId"
        :api-audience="apiAudience"
        :can-edit="canEdit"
        :checkpoint-id="checkpointId"
        :forms="recipientForms"
        :reload-workspace="reloadWorkspace"
        @dirty="dirty = $event"
      />
      <PageStudioEmailTemplateEditor
        v-else
        :key="`${scopeKey}:website:${emailView}`"
        :assets="assets"
        :site-id="siteId"
        :api-audience="apiAudience"
        :can-edit="canEdit"
        :checkpoint-id="checkpointId"
        :audience="emailView === 'team' ? 'team' : 'customer'"
        :forms="previewForms"
        :reload-workspace="reloadWorkspace"
        @dirty="dirty = $event"
      />
    </template>
    <template v-else>
      <UFormField v-if="forms.length" :label="formLibrary ? 'Form' : 'Form placement'" :description="dirty ? 'Save or discard your changes before switching forms.' : undefined">
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
              {{ selected.form.name || 'Website form' }}
            </h3><p class="mt-1 text-sm text-muted">
              {{ selected.definitionId ? `Used on ${selected.placements.length} ${selected.placements.length === 1 ? 'page' : 'pages'}` : firstPlacement?.route }}
            </p>
          </div>
          <UButton
            v-if="apiAudience !== 'customer'"
            label="View enquiries"
            icon="i-lucide-inbox"
            color="neutral"
            variant="outline"
            :disabled="dirty || !selected.placements.length"
            @click="emit('enquiries', { placements: selected.placements.map(item => ({ formId: item.formId, pageRoute: selected.definitionId ? undefined : item.route })), name: selected.form.name || 'Website form' })"
          />
        </div>
        <p v-if="apiAudience === 'customer'" class="text-sm text-muted">
          Enquiries are not available in this workspace yet. Form and email settings are saved as drafts.
        </p>
        <UAccordion v-if="selected.definitionId && selected.placements.length" :items="[{ label: 'Pages using this form', slot: 'placements' }]">
          <template #placements>
            <ul class="space-y-2 pb-3 text-sm text-muted">
              <li v-for="placement in selected.placements" :key="`${placement.pageId}:${placement.formId}`">
                {{ placement.title }} <span class="ml-2">{{ placement.route }}</span>
              </li>
            </ul>
          </template>
        </UAccordion>
        <p v-if="selected.placements.length > 1" class="text-sm text-muted">
          Changes to these settings apply wherever this form appears.
        </p>
        <div class="flex flex-wrap gap-2" role="group" aria-label="Form views">
          <UButton
            v-for="item in [{ value: 'settings', label: 'After submission' }, { value: 'fields', label: 'Fields' }, ...(selected.definitionId ? [{ value: 'emails', label: 'Email recipients' }, { value: 'team-template', label: 'Team template' }, { value: 'customer-template', label: 'Customer template' }] : [])]"
            :key="item.value"
            :label="item.label"
            color="neutral"
            :variant="tab === item.value ? 'soft' : 'ghost'"
            :disabled="dirty && tab !== item.value"
            @click="() => { tab = item.value }"
          />
        </div>
        <PageStudioFormSettingsEditor
          v-if="tab === 'settings' && checkpointId && selected.form.fields && firstPlacement"
          :key="`${scopeKey}:${selected.key}:${checkpointId}`"
          :site-id="siteId"
          :api-audience="apiAudience"
          :can-edit="canEdit"
          :page-id="firstPlacement.pageId"
          :form-id="firstPlacement.formId"
          :checkpoint-id="checkpointId"
          :fields="selected.form.fields"
          :pages="destinations"
          @dirty="dirty = $event"
          @reload="emit('reload')"
        />
        <PageStudioFormRecipientsEditor
          v-else-if="tab === 'emails' && checkpointId && selected.definitionId"
          :key="`${scopeKey}:${selected.key}:recipients`"
          :site-id="siteId"
          :api-audience="apiAudience"
          :can-edit="canEdit"
          :checkpoint-id="checkpointId"
          :definition-id="selected.definitionId"
          :forms="recipientForms"
          :reload-workspace="reloadWorkspace"
          @dirty="dirty = $event"
        />
        <PageStudioEmailTemplateEditor
          v-else-if="(tab === 'team-template' || tab === 'customer-template') && checkpointId && selected.definitionId"
          :key="`${scopeKey}:${selected.key}:${tab}`"
          :assets="assets"
          :site-id="siteId"
          :api-audience="apiAudience"
          :can-edit="canEdit"
          :checkpoint-id="checkpointId"
          :definition-id="selected.definitionId"
          :placement-count="selected.placements.length"
          :audience="tab === 'team-template' ? 'team' : 'customer'"
          :forms="previewForms.filter(item => item.key === selected.key)"
          :reload-workspace="reloadWorkspace"
          @dirty="dirty = $event"
        />
        <div v-else-if="tab === 'fields'" class="divide-y divide-default border-y border-default">
          <div v-for="field in selected.form.fields || []" :key="field.id" class="flex flex-wrap items-start justify-between gap-3 py-4">
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
    </template>
  </section>
</template>
