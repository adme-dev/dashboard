<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
// Reviewed, explicit conversion of a complete imported email into a separate
// FigFlow-editable draft. The original template is never changed here; the
// server re-derives the copy from the exact stored source it previewed and
// fences the insert on that source.
interface ConversionSection { id: string, kind: 'Image' | 'Text' | 'Spacer' | 'Html', variant: 'both' | 'desktop' | 'mobile', label: string, reason?: string }
interface ConversionReport { width: number, sections: ConversionSection[], native: number, protected: number, responsivePairs: number, limitations: string[] }
interface Preview { html: string, original_html: string, report: ConversionReport, source_id: string, source_digest: string }
interface SaveBody { save: true, request_key: string, name: string, source_digest: string }
/** An outcome-unknown or conflicting request, bound to its own source. */
interface PendingCopy { sourceId: string, body: SaveBody, conflict?: boolean }

const props = defineProps<{ templateId: string, templateName: string, unsavedChanges: boolean }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [id: string], busy: [value: boolean] }>()

// The pending request survives close, unmount and reload for this tab, keyed
// by its own source, until a receipt or an explicit abandonment resolves it.
// No refusal is treated as proof that nothing was committed. It is never
// retargeted to another source.
const storageKey = (sourceId: string) => `xeroflow:editable-copy-pending:${sourceId}`
function readPending(sourceId: string): PendingCopy | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(sourceId)) ?? 'null') as PendingCopy | null
    return value?.sourceId === sourceId && value.body?.save === true ? value : null
  } catch {
    return null
  }
}
function writePending(value: PendingCopy | null, sourceId: string) {
  try {
    if (value) sessionStorage.setItem(storageKey(sourceId), JSON.stringify(value))
    else sessionStorage.removeItem(storageKey(sourceId))
  } catch { /* Storage is best effort; the in-memory request is still retained. */ }
}

const preview = ref<Preview | null>(null)
const loading = ref(false)
const creating = ref(false)
const error = ref('')
const copyName = ref('')
const confirmedId = ref<string | null>(null)
const view = ref<'copy' | 'original'>('copy')
const device = ref<'desktop' | 'mobile'>('desktop')
const pending = ref<PendingCopy | null>(null)
// Each load belongs to one source and generation; late replies are ignored.
let generation = 0

const createUnconfirmed = computed(() => pending.value?.sourceId === props.templateId)
const views = [{ label: 'Editable copy', value: 'copy' }, { label: 'Original', value: 'original' }]
const frameHtml = computed(() => view.value === 'copy' ? preview.value?.html : preview.value?.original_html)
// The chosen viewport is kept exactly; the region scrolls instead of clamping.
const frameWidth = computed(() => device.value === 'mobile' ? 390 : Math.max(600, preview.value?.report.width ?? 600) + 40)
const canCreate = computed(() => !loading.value && !creating.value && !confirmedId.value && (createUnconfirmed.value
  ? !pending.value?.conflict
  : !!preview.value && preview.value.source_id === props.templateId && !props.unsavedChanges
    && !!copyName.value.trim() && copyName.value.trim().length <= 200 && preview.value.report.native > 0))
const variantLabel = (section: ConversionSection) => section.variant === 'desktop' ? 'Desktop only' : section.variant === 'mobile' ? 'Mobile only' : ''
const outcomeOf = (cause: unknown) => (cause as { data?: { data?: { outcome?: string } } })?.data?.data?.outcome
const messageOf = (cause: unknown, fallback: string) => {
  const failure = cause as { statusMessage?: string, data?: { statusMessage?: string } }
  return failure?.data?.statusMessage || failure?.statusMessage || fallback
}

// Results settle only their own source and request key; another source's
// pending request is never read, cleared or replaced by them.
const confirmedBySource = new Map<string, string>()
function settle(request: PendingCopy, next: PendingCopy | null) {
  const stored = readPending(request.sourceId)
  if (!stored || stored.body.request_key === request.body.request_key) writePending(next, request.sourceId)
  if (pending.value?.sourceId === request.sourceId && pending.value.body.request_key === request.body.request_key) pending.value = next
}
function setPending(value: PendingCopy) {
  pending.value = value
  writePending(value, value.sourceId)
}

async function load() {
  const sourceId = props.templateId
  const ticket = ++generation
  loading.value = true
  preview.value = null
  if (!createUnconfirmed.value) error.value = ''
  try {
    const result = await $fetch<Preview>(`/api/email/templates/${sourceId}/editable-copy`, { method: 'POST', body: { save: false } })
    if (ticket !== generation || sourceId !== props.templateId) return
    preview.value = result
  } catch (cause) {
    if (ticket !== generation || sourceId !== props.templateId) return
    error.value = messageOf(cause, 'The editable copy could not be prepared. Try again.')
  } finally {
    if (ticket === generation) loading.value = false
  }
}

async function create() {
  if (!canCreate.value) return
  const request: PendingCopy = createUnconfirmed.value
    ? pending.value!
    : { sourceId: preview.value!.source_id, body: { save: true, request_key: crypto.randomUUID(), name: copyName.value.trim(), source_digest: preview.value!.source_digest } }
  const ticket = generation
  setPending(request)
  creating.value = true
  emit('busy', true)
  error.value = ''
  // Visible state belongs to the request's own source while it is current.
  const active = () => props.templateId === request.sourceId && (!pending.value || pending.value.body.request_key === request.body.request_key)
  try {
    // Always the request's own source, never the current props.
    const result = await $fetch<{ template: { id: string } }>(`/api/email/templates/${request.sourceId}/editable-copy`, { method: 'POST', body: request.body })
    settle(request, null)
    confirmedBySource.set(request.sourceId, result.template.id)
    if (active()) {
      confirmedId.value = result.template.id
      // Open automatically only in the same clean, unchanged review.
      if (ticket === generation && !props.unsavedChanges && open.value) emit('created', result.template.id)
    }
  } catch (cause) {
    const outcome = outcomeOf(cause)
    if (outcome === 'conflict') settle(request, { ...request, conflict: true })
    // Every other failure, including `stale`, keeps the exact request: an
    // earlier attempt may still commit, and only a receipt or explicit
    // abandonment resolves it.
    if (active()) {
      error.value = outcome === 'conflict'
        ? messageOf(cause, 'This request is bound to a different copy.')
        : outcome === 'stale'
          ? messageOf(cause, 'The original changed. Retry to check, or abandon this request.')
          : 'The copy may have been created. Retry to confirm it; the same request will not create a second copy.'
    }
  } finally {
    creating.value = false
    emit('busy', false)
  }
}

/** Explicit decision to stop tracking an unresolved request. */
function abandon() {
  if (pending.value) settle(pending.value, null)
  error.value = 'The previous request is no longer tracked. Check Drafts in the template library for a copy before creating another one.'
}

function resetForSource(fresh = false) {
  generation++
  // A fresh review starts clean; switching sources keeps per-source results.
  if (fresh) confirmedBySource.delete(props.templateId)
  loading.value = false
  preview.value = null
  confirmedId.value = confirmedBySource.get(props.templateId) ?? null
  view.value = 'copy'
  device.value = 'desktop'
  pending.value = readPending(props.templateId)
  if (pending.value) {
    copyName.value = pending.value.body.name
    error.value = pending.value.conflict
      ? 'A previous copy request is bound to a different copy. Check the template library, then abandon it to start again.'
      : 'A previous copy request is unconfirmed. Retry to confirm it before creating another copy.'
  } else {
    copyName.value = `${props.templateName || 'Imported email'} (editable)`.slice(0, 200)
    error.value = ''
  }
}

onMounted(() => {
  pending.value ??= readPending(props.templateId)
})
watch(() => props.templateId, () => {
  // A different source invalidates the preview; its own pending is reloaded.
  resetForSource()
  if (open.value) void load()
})
watch(open, (value) => {
  if (!value) return
  resetForSource(true)
  void load()
}, { immediate: true })
</script>

<template>
  <UModal
    v-model:open="open"
    title="Create an editable FigFlow copy"
    description="The original import stays exactly as it is. A separate draft is created where supported sections become FigFlow layers."
    :dismissible="!creating"
    :ui="{ content: 'sm:max-w-6xl' }"
  >
    <template #body>
      <div class="@container space-y-4">
        <UAlert
          v-if="unsavedChanges"
          color="warning"
          icon="i-lucide-triangle-alert"
          title="Save the composer first"
          description="The copy is made from the saved template. Save or discard your current changes, then reopen this review."
        />
        <UAlert
          v-if="confirmedId"
          color="success"
          title="Editable copy created"
          description="Your composer changes are kept here. Open the copy when you are ready."
          :actions="[{ label: 'Open copy in FigFlow', onClick: () => emit('created', confirmedId!) }]"
        />
        <div v-if="loading" class="py-10 text-center text-sm text-muted" role="status">
          Preparing the editable copy…
        </div>
        <UAlert
          v-else-if="error && !preview"
          :color="createUnconfirmed ? 'warning' : 'error'"
          :title="error"
          :actions="[{ label: 'Try again', onClick: load }]"
        />
        <div v-if="preview" class="grid grid-cols-1 gap-6 @5xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section class="min-w-0 space-y-3" aria-label="Before and after preview">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <UTabs
                v-model="view"
                :items="views"
                :content="false"
                size="sm"
              />
              <div class="flex gap-1" role="group" aria-label="Preview width">
                <UButton
                  icon="i-lucide-monitor"
                  label="Desktop"
                  size="xs"
                  :color="device === 'desktop' ? 'primary' : 'neutral'"
                  :variant="device === 'desktop' ? 'soft' : 'ghost'"
                  :aria-pressed="device === 'desktop'"
                  @click="device = 'desktop'"
                />
                <UButton
                  icon="i-lucide-smartphone"
                  label="Mobile"
                  size="xs"
                  :color="device === 'mobile' ? 'primary' : 'neutral'"
                  :variant="device === 'mobile' ? 'soft' : 'ghost'"
                  :aria-pressed="device === 'mobile'"
                  @click="device = 'mobile'"
                />
              </div>
            </div>
            <div class="h-[60vh] overflow-auto rounded-md border border-default bg-elevated">
              <iframe
                :key="`${view}-${device}`"
                :srcdoc="frameHtml"
                sandbox=""
                referrerpolicy="no-referrer"
                :title="view === 'copy' ? 'Editable copy preview' : 'Original import preview'"
                class="mx-auto block h-full max-w-none border-0 bg-white"
                :style="{ width: `${frameWidth}px`, minWidth: `${frameWidth}px` }"
              />
            </div>
          </section>

          <aside class="min-w-0 space-y-4" aria-label="Conversion report">
            <dl class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-md border border-default p-2">
                <dt class="text-xs text-muted">
                  Editable in FigFlow
                </dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {{ preview.report.native }}
                </dd>
              </div>
              <div class="rounded-md border border-default p-2">
                <dt class="text-xs text-muted">
                  Protected HTML
                </dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {{ preview.report.protected }}
                </dd>
              </div>
              <div class="rounded-md border border-default p-2">
                <dt class="text-xs text-muted">
                  Device pairs
                </dt>
                <dd class="text-xl font-semibold tabular-nums">
                  {{ preview.report.responsivePairs }}
                </dd>
              </div>
            </dl>
            <p class="text-sm text-muted">
              Protected sections keep their original HTML. You can still edit their text and links in the composer, but FigFlow shows them as locked content.
            </p>
            <ul class="max-h-64 divide-y divide-default overflow-auto rounded-md border border-default text-sm">
              <li v-for="section in preview.report.sections" :key="section.id" class="flex items-start gap-2 px-3 py-2">
                <UBadge
                  :label="section.kind === 'Html' ? 'Protected' : section.kind"
                  :color="section.kind === 'Html' ? 'neutral' : 'primary'"
                  variant="subtle"
                  size="sm"
                  class="mt-0.5 shrink-0"
                />
                <div class="min-w-0">
                  <p class="truncate">
                    {{ section.label }}
                  </p>
                  <p v-if="section.reason || variantLabel(section)" class="text-xs text-muted">
                    {{ [variantLabel(section), section.reason].filter(Boolean).join(' · ') }}
                  </p>
                </div>
              </li>
            </ul>
            <UAlert
              v-if="preview.report.limitations.length"
              color="info"
              variant="subtle"
              title="Differences from the original"
            >
              <template #description>
                <ul class="list-disc space-y-1 pl-4">
                  <li v-for="item in preview.report.limitations" :key="item">
                    {{ item }}
                  </li>
                </ul>
              </template>
            </UAlert>
            <UAlert
              v-if="preview.report.native === 0"
              color="warning"
              title="No sections could become FigFlow layers"
              description="Keep editing this email in the composer, or start from a structured template."
            />
            <UFormField label="Copy name" required>
              <UInput
                v-model="copyName"
                :maxlength="200"
                :disabled="creating || createUnconfirmed || !!confirmedId"
                class="w-full"
              />
            </UFormField>
            <UAlert v-if="error && preview" :color="createUnconfirmed ? 'warning' : 'error'" :title="error" />
          </aside>
        </div>
      </div>
    </template>
    <template #footer>
      <UButton
        label="Cancel"
        color="neutral"
        variant="outline"
        :disabled="creating"
        @click="open = false"
      />
      <UButton
        v-if="createUnconfirmed && !creating"
        label="Abandon unconfirmed request"
        color="neutral"
        variant="ghost"
        @click="abandon"
      />
      <UButton
        :label="createUnconfirmed ? 'Retry and confirm copy' : 'Create copy and open in FigFlow'"
        icon="i-lucide-copy-plus"
        :disabled="!canCreate"
        :loading="creating"
        @click="create"
      />
    </template>
  </UModal>
</template>
