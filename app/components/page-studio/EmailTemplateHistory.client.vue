<script setup lang="ts">
import { ValidatedEmailTemplateSchema, type EmailAudience, type EmailTemplate, type EmailTemplateHistoricalVersion, type EmailTemplateHistoryPage, type EmailTemplateRevisionMetadata } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ url: string, websiteUrl: string, audience: EmailAudience, isForm: boolean, canApply: boolean, currentDefault: EmailTemplate, previewForm: { pageId: string, formId: string } | null }>()
const emit = defineEmits<{ close: [], apply: [version: EmailTemplateHistoricalVersion] }>()
const revisions = ref<EmailTemplateRevisionMetadata[]>([])
const cursor = ref<number | null>(null)
const listLoading = ref(false)
const listError = ref('')
const historyCanEdit = ref(false)
const selectedRevision = ref<number | null>(null)
const selected = ref<EmailTemplateHistoricalVersion | null>(null)
const detailLoading = ref(false)
const detailError = ref('')
let active = true
let listSequence = 0
let detailSequence = 0
let listController: AbortController | undefined
let detailController: AbortController | undefined
const context = () => `${props.url}|${props.websiteUrl}|${props.audience}|${props.isForm}`
function cancel() {
  listSequence++
  detailSequence++
  listController?.abort()
  detailController?.abort()
}
async function loadHistory(older = false) {
  if (listLoading.value || (older && cursor.value === null)) return
  listController?.abort()
  listController = new AbortController()
  const ticket = ++listSequence
  const scope = context()
  listLoading.value = true
  listError.value = ''
  try {
    const page = await $fetch<EmailTemplateHistoryPage>(`${props.url}/history`, { signal: listController.signal, ...(older ? { query: { beforeRevision: cursor.value } } : {}) })
    if (!active || ticket !== listSequence || scope !== context()) return
    if (page.audience !== props.audience) throw new Error('Mismatched audience')
    revisions.value = older ? [...revisions.value, ...page.revisions] : page.revisions
    cursor.value = page.nextBeforeRevision
    historyCanEdit.value = page.canEdit
  } catch {
    if (!active || ticket !== listSequence || scope !== context()) return
    historyCanEdit.value = false
    listError.value = 'History is unavailable. Retry to load saved revisions. Your draft has not changed.'
  } finally {
    if (active && ticket === listSequence && scope === context()) listLoading.value = false
  }
}
async function selectRevision(revision: number) {
  detailController?.abort()
  detailController = new AbortController()
  const ticket = ++detailSequence
  const scope = context()
  selectedRevision.value = revision
  selected.value = null
  detailError.value = ''
  detailLoading.value = true
  try {
    const version = await $fetch<EmailTemplateHistoricalVersion>(`${props.url}/history/${revision}`, { signal: detailController.signal })
    if (!active || ticket !== detailSequence || scope !== context()) return
    if (version.revision !== revision || (version.template === null && !props.isForm) || (version.template !== null && !ValidatedEmailTemplateSchema.safeParse(version.template).success)) throw new Error('Invalid revision')
    selected.value = version
  } catch {
    if (!active || ticket !== detailSequence || scope !== context()) return
    detailError.value = 'Could not load this revision. Retry this version or choose another. Your draft has not changed.'
  } finally {
    if (active && ticket === detailSequence && scope === context()) detailLoading.value = false
  }
}
const previewInput = computed(() => selected.value && props.previewForm
  ? { template: selected.value.template ?? props.currentDefault, pageId: props.previewForm.pageId, formId: props.previewForm.formId }
  : null)
const { preview, status, error: previewError, refresh: refreshPreview } = useEmailTemplatePreview(
  () => previewInput.value,
  (body, signal) => $fetch(`${props.websiteUrl}/preview`, { method: 'POST', body, signal })
)
function apply() {
  if (!active || !props.canApply || !historyCanEdit.value || !selected.value || detailLoading.value || listError.value) return
  emit('apply', JSON.parse(JSON.stringify(selected.value)))
}
function dateLabel(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
watch(context, () => {
  cancel()
  revisions.value = []
  cursor.value = null
  selectedRevision.value = null
  selected.value = null
  detailError.value = ''
  detailLoading.value = false
  listLoading.value = false
  historyCanEdit.value = false
  void loadHistory()
})
onBeforeUnmount(() => {
  active = false
  cancel()
})
void loadHistory()
</script>

<template>
  <USlideover
    :open="true"
    title="Saved template revisions"
    description="Review a saved version before using it as an unsaved draft."
    :ui="{ content: 'w-full sm:max-w-4xl', body: 'min-h-0 overflow-y-auto' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <div class="@container space-y-5">
        <p class="text-sm text-muted">
          This is the {{ audience === 'team' ? 'team notification' : 'customer reply' }} revision log. It includes saves to the website default and other form templates in this audience. Only this template will be restored.
        </p>
        <div class="grid min-w-0 grid-cols-1 gap-5 @2xl:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Saved revisions" class="space-y-2">
            <UAlert v-if="listError" color="error" :title="listError">
              <template #actions>
                <UButton
                  label="Retry history"
                  color="neutral"
                  variant="outline"
                  @click="loadHistory(revisions.length > 0)"
                />
              </template>
            </UAlert>
            <div
              v-for="item in revisions"
              :key="item.revision"
              class="rounded-lg"
              :class="selectedRevision === item.revision ? 'bg-elevated' : ''"
            >
              <UButton
                :label="`Revision ${item.revision}`"
                color="neutral"
                :variant="selectedRevision === item.revision ? 'soft' : 'ghost'"
                class="w-full justify-start"
                :aria-pressed="selectedRevision === item.revision"
                @click="selectRevision(item.revision)"
              />
              <p class="px-3 pb-2 text-xs text-muted">
                {{ dateLabel(item.updatedAt) }}
              </p>
            </div>
            <USkeleton v-if="listLoading" class="h-20 w-full" />
            <p v-else-if="!revisions.length && !listError" class="text-sm text-muted">
              No saved revisions yet. Save a template draft to start its history.
            </p>
            <UButton
              v-if="cursor !== null"
              label="Load older"
              color="neutral"
              variant="outline"
              class="w-full"
              :loading="listLoading"
              @click="loadHistory(true)"
            />
          </nav>
          <section aria-label="Selected saved revision" class="min-w-0 space-y-4">
            <USkeleton v-if="detailLoading" class="h-80 w-full" />
            <UAlert v-if="detailError" color="error" :title="detailError">
              <template #actions>
                <UButton
                  label="Retry revision"
                  color="neutral"
                  variant="outline"
                  @click="selectedRevision !== null && selectRevision(selectedRevision)"
                />
              </template>
            </UAlert>
            <template v-if="selected">
              <h4 class="text-sm font-medium text-highlighted">
                Revision {{ selected.revision }}
              </h4>
              <UAlert
                v-if="selected.template === null"
                color="neutral"
                title="Uses the current website default"
                description="This revision had no custom template for this form. Using it restores inheritance of today's website default, including future changes."
              />
              <p class="break-words text-sm font-medium">
                {{ (selected.template ?? currentDefault).subject }}
              </p>
              <UAlert v-if="previewError" color="error" :title="previewError">
                <template #actions>
                  <UButton
                    label="Retry preview"
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
              <iframe
                v-if="preview"
                :srcdoc="preview.html"
                sandbox=""
                referrerpolicy="no-referrer"
                title="Saved revision preview with example answers"
                class="h-[560px] w-full rounded-lg border border-default"
              />
              <p v-else class="text-sm text-muted">
                {{ status === 'waiting' || status === 'loading' ? 'Loading preview…' : !previewForm ? 'This form has no page placement to preview. You can still restore its template.' : 'Refresh the preview to try again.' }}
              </p>
              <p class="text-xs text-muted">
                Example answers and current website images. Links are inactive.
              </p>
            </template>
            <p v-else-if="!detailLoading && !detailError" class="text-sm text-muted">
              Choose a revision to preview it. Your current edits stay in the editor.
            </p>
          </section>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="w-full space-y-3">
        <UAlert
          v-if="canApply && historyCanEdit"
          color="warning"
          title="Replaces your unsaved template edits"
          description="Use this version replaces this template in the editor. Save template draft to keep it as a new revision. Pending removals of templates for removed forms are kept. Nothing is sent or published."
        />
        <p v-else class="text-sm text-muted">
          Browsing is available. Applying a revision requires current edit access and a saved draft ready to edit.
        </p>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            label="Close history"
            color="neutral"
            variant="outline"
            @click="emit('close')"
          />
          <UButton label="Use this version" :disabled="!canApply || !historyCanEdit || !selected || detailLoading || Boolean(listError)" @click="apply" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
