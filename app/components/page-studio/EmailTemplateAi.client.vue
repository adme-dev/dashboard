<script setup lang="ts">
import { EmailTemplateAiOptionsSchema, type EmailTemplateProposalDraft } from '~~/shared/pageStudio/emailTemplateProposals'
import type { EmailTemplate } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ url: string, websiteUrl: string, draft: EmailTemplateProposalDraft | null, canEdit: boolean, native: boolean }>()
const emit = defineEmits<{ apply: [template: EmailTemplate], dirty: [value: boolean], busy: [value: boolean] }>()
const open = ref(false)
const { data: options, status: optionsStatus, error: optionsError, refresh: refreshOptions } = useFetch(`${props.url}/ai`, {
  immediate: false, watch: false, retry: 0, getCachedData: () => undefined,
  transform: value => EmailTemplateAiOptionsSchema.parse(value)
})
const { prompt, modelId, pending, error, proposal, requested, dirty, canGenerate, canApply, generate, discard, apply } = useEmailTemplateProposal(
  () => props.draft, () => props.canEdit && !props.native,
  body => $fetch(`${props.url}/ai`, { method: 'POST', body, retry: 0 })
)
const models = computed(() => options.value?.models ?? [])
watch(models, (items) => {
  if (!items.some(item => item.id === modelId.value)) modelId.value = items[0]?.id ?? ''
}, { immediate: true })
const allowance = computed(() => options.value?.available ? options.value.allowance : null)
const generationAvailable = computed(() => canGenerate.value && !optionsError.value && optionsStatus.value !== 'pending'
  && Boolean(allowance.value && allowance.value.remaining > 0) && models.value.some(item => item.id === modelId.value))
watch(open, (value) => {
  if (value && !props.native && props.canEdit) void refreshOptions()
})
watch(dirty, value => emit('dirty', value), { immediate: true, flush: 'sync' })
watch(pending, value => emit('busy', value), { immediate: true, flush: 'sync' })
const previewInput = computed(() => {
  if (!proposal.value || !requested.value) return null
  const draft: EmailTemplateProposalDraft = JSON.parse(requested.value.canonical)
  return { template: proposal.value.template, pageId: draft.pageId, formId: draft.formId }
})
const { preview, status: previewStatus, error: previewError, refresh: refreshPreview } = useEmailTemplatePreview(
  () => previewInput.value, (body, signal) => $fetch(`${props.websiteUrl}/preview`, { method: 'POST', body, signal, retry: 0 })
)
async function requestProposal() {
  if (!generationAvailable.value) return
  await generate()
  if (!props.native && props.canEdit) await refreshOptions()
}
function applyProposal() {
  if (previewStatus.value !== 'ready' || !preview.value) return
  const value = apply()
  if (value) emit('apply', value)
}
</script>

<template>
  <section class="@container rounded-lg border border-default bg-default" aria-label="AI email design">
    <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <UButton
        label="AI design"
        icon="i-lucide-sparkles"
        color="neutral"
        variant="ghost"
        :aria-expanded="open"
        @click="() => { open = !open }"
      />
      <p class="text-xs text-muted">
        {{ dirty ? 'Proposal not saved' : 'Describe a change, then review it' }}
      </p>
    </div>
    <div v-show="open" class="space-y-4 border-t border-default p-4">
      <p v-if="native" class="text-sm text-muted">
        AI email design is not available in this preview. You can edit the template manually.
      </p>
      <p v-else-if="!canEdit && !dirty" class="text-sm text-muted">
        Open an editable custom template to use AI design.
      </p>
      <template v-else>
        <UAlert
          v-if="optionsError"
          color="warning"
          variant="soft"
          title="AI availability could not be checked"
        >
          <template #actions>
            <UButton
              label="Check availability"
              color="neutral"
              variant="outline"
              :loading="optionsStatus === 'pending'"
              @click="refreshOptions()"
            />
          </template>
        </UAlert>
        <p v-else-if="options && !options.available" class="text-sm text-muted">
          {{ options.reason }}
        </p>
        <p v-else-if="optionsStatus === 'pending'" class="text-sm text-muted" role="status">
          Checking models and allowance…
        </p>
        <div v-if="options?.available || dirty" class="grid grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)]">
          <UFormField label="Describe your change" description="For example: shorten the heading and make the contact details easier to scan.">
            <UTextarea
              v-model="prompt"
              :rows="3"
              :maxlength="4000"
              class="w-full"
              :disabled="!canEdit || pending || Boolean(proposal) || Boolean(error)"
            />
          </UFormField>
          <div class="space-y-3">
            <UFormField label="Model">
              <USelect
                v-model="modelId"
                :items="models"
                value-key="id"
                class="w-full"
                :disabled="!canEdit || pending || Boolean(proposal) || Boolean(error) || !models.length"
              />
            </UFormField>
            <p v-if="allowance" class="text-xs text-muted">
              {{ allowance.remaining }} of {{ allowance.limit }} AI operations remaining this month. Each generation uses one operation.
            </p>
          </div>
        </div>
        <UAlert
          v-if="error"
          color="warning"
          variant="soft"
          title="Proposal unavailable"
          :description="error"
        />
        <div v-if="proposal" class="space-y-4 border-t border-default pt-4">
          <p class="text-sm font-medium text-highlighted">
            {{ proposal.summary }}
          </p>
          <UAlert
            v-if="proposal.warnings.length"
            color="warning"
            variant="soft"
            title="Review these details"
            :description="proposal.warnings.join(' ')"
          />
          <UAlert
            v-if="!canApply"
            color="warning"
            variant="soft"
            title="This proposal cannot be applied"
            description="The draft, form or edit access has changed. Discard this proposal and start again from the current draft."
          />
          <UAlert v-if="previewError" color="warning" :title="previewError">
            <template #actions>
              <UButton
                label="Refresh proposal preview"
                color="neutral"
                variant="outline"
                @click="refreshPreview"
              />
            </template>
          </UAlert>
          <UAlert
            v-if="preview?.warnings?.length"
            color="warning"
            title="Check your images"
            :description="preview.warnings.join(' ')"
          />
          <template v-if="preview">
            <p class="break-words text-sm font-medium">
              {{ preview.subject }}
            </p>
            <p class="break-words text-xs text-muted">
              {{ preview.preheader }}
            </p>
            <iframe
              :srcdoc="preview.html"
              sandbox=""
              referrerpolicy="no-referrer"
              title="AI proposal preview with example answers"
              class="h-[480px] w-full rounded-lg border border-default"
            />
          </template>
          <p v-else-if="!previewError" class="text-sm text-muted" role="status">
            Preparing proposal preview…
          </p>
          <p class="text-xs text-muted">
            Apply adds an unsaved edit. Undo and Save work as usual. Example answers are shown; links are inactive.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton
            v-if="!proposal && !error && options?.available"
            label="Generate proposal"
            icon="i-lucide-sparkles"
            :loading="pending"
            :disabled="!generationAvailable"
            @click="requestProposal"
          />
          <UButton
            v-if="proposal"
            label="Apply to draft"
            :disabled="!canApply || previewStatus !== 'ready' || !preview"
            @click="applyProposal"
          />
          <UButton
            v-if="dirty"
            label="Discard"
            color="neutral"
            variant="outline"
            :disabled="pending"
            @click="discard"
          />
        </div>
      </template>
    </div>
  </section>
</template>
