<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'

interface ClaimDraft {
  claim: string
  sourceType: 'sales_interview' | 'manufacturer' | 'provider_evidence'
  sourceReference: string
  expiresAt: string | null
}

interface DetailResponse {
  asset: Record<string, unknown>
  versions: Array<Record<string, unknown>>
  interviews: Array<Record<string, unknown>>
  claims: Array<Record<string, unknown>>
}

const props = defineProps<{
  clientId: string
  siteId: string
  assetId: string | null
  versionRoute: string | null
}>()
const emit = defineEmits<{ saved: [] }>()
const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const saving = ref(false)
const loading = ref(false)
const interviewDate = shallowRef<CalendarDate>(today(getLocalTimeZone()))
const sourceVersionId = ref<string | null>(null)
const sourceInterviewIds = ref<string[]>([])
const form = reactive({
  topic: '',
  title: '',
  slug: '',
  intervieweeName: '',
  intervieweeRole: 'Sales Manager',
  interviewNotes: '',
  excerpt: '',
  bodyMarkdown: '',
  disclaimer: 'Vehicle specifications, availability, pricing and eligibility can change. Confirm current details with Knox GWM before purchase.',
  schemaType: 'Article' as 'Article' | 'FAQPage',
  consentConfirmed: false,
  claims: [{ claim: '', sourceType: 'sales_interview', sourceReference: '' as string, expiresAt: null }] as ClaimDraft[]
})

const sourceTypeOptions = [
  { label: 'Sales interview', value: 'sales_interview' },
  { label: 'Manufacturer source', value: 'manufacturer' },
  { label: 'Provider evidence', value: 'provider_evidence' }
]
const schemaOptions = [
  { label: 'Article', value: 'Article' },
  { label: 'FAQ page', value: 'FAQPage' }
]
const isExisting = computed(() => Boolean(props.assetId))

function field(row: Record<string, unknown> | undefined, camel: string, snake: string): string {
  return String(row?.[camel] ?? row?.[snake] ?? '')
}

function errorMessage(error: unknown): string {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate?.data?.statusMessage || candidate?.message || 'The content version could not be saved.'
}

function reset() {
  sourceVersionId.value = null
  sourceInterviewIds.value = []
  interviewDate.value = today(getLocalTimeZone())
  Object.assign(form, {
    topic: '', title: '', slug: '', intervieweeName: '', intervieweeRole: 'Sales Manager',
    interviewNotes: '', excerpt: '', bodyMarkdown: '',
    disclaimer: 'Vehicle specifications, availability, pricing and eligibility can change. Confirm current details with Knox GWM before purchase.',
    schemaType: 'Article', consentConfirmed: false,
    claims: [{ claim: '', sourceType: 'sales_interview', sourceReference: '', expiresAt: null }]
  })
}

async function loadAsset() {
  reset()
  if (!props.assetId) return
  loading.value = true
  try {
    const detail = await $fetch<DetailResponse>(
      `/api/agency/search-authority/content/${props.assetId}?clientId=${encodeURIComponent(props.clientId)}`
    )
    const asset = detail.asset
    const currentId = field(asset, 'currentVersionId', 'current_version_id')
    const version = detail.versions.find(item => field(item, 'id', 'id') === currentId) || detail.versions[0]
    const interview = detail.interviews[0]
    sourceVersionId.value = field(version, 'id', 'id') || null
    sourceInterviewIds.value = Array.isArray(version?.source_interview_ids)
      ? version.source_interview_ids.map(String)
      : (field(interview, 'id', 'id') ? [field(interview, 'id', 'id')] : [])
    form.topic = field(asset, 'topic', 'topic')
    form.title = field(asset, 'title', 'title')
    form.slug = field(asset, 'slug', 'slug')
    form.intervieweeName = field(interview, 'intervieweeName', 'interviewee_name')
    form.intervieweeRole = field(interview, 'intervieweeRole', 'interviewee_role')
    form.interviewNotes = field(interview, 'sourceSummary', 'source_summary')
    form.excerpt = field(version, 'excerpt', 'excerpt')
    form.bodyMarkdown = field(version, 'bodyMarkdown', 'body_markdown')
    form.disclaimer = field(version, 'disclaimer', 'disclaimer') || form.disclaimer
    form.schemaType = (field(version, 'schemaType', 'schema_type') || 'Article') as 'Article' | 'FAQPage'
    const sourceDate = field(interview, 'occurredAt', 'occurred_at').slice(0, 10)
    if (sourceDate) {
      const [year, month, day] = sourceDate.split('-').map(Number)
      interviewDate.value = new CalendarDate(year!, month!, day!)
    }
    const claims = detail.claims.filter(item => field(item, 'versionId', 'version_id') === sourceVersionId.value)
    form.claims = claims.length
      ? claims.map(item => ({
          claim: field(item, 'claim', 'claim'),
          sourceType: field(item, 'sourceType', 'source_type') as ClaimDraft['sourceType'],
          sourceReference: field(item, 'sourceReference', 'source_reference'),
          expiresAt: field(item, 'expiresAt', 'expires_at') || null
        }))
      : [{ claim: '', sourceType: 'sales_interview', sourceReference: '', expiresAt: null }]
  } catch (error: unknown) {
    toast.add({ title: 'Draft could not be loaded', description: errorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}

function addClaim() {
  form.claims.push({ claim: '', sourceType: 'sales_interview', sourceReference: '', expiresAt: null })
}

function removeClaim(index: number) {
  if (form.claims.length > 1) form.claims.splice(index, 1)
}

async function save() {
  saving.value = true
  try {
    let assetId = props.assetId
    let interviewIds = sourceInterviewIds.value
    let endpoint = props.versionRoute
    if (!assetId) {
      const created = await $fetch<{ id: string, interviewId: string }>(
        '/api/agency/search-authority/content',
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey('search-authority-content') },
          body: {
            clientId: props.clientId,
            siteId: props.siteId,
            slug: form.slug,
            title: form.title,
            topic: form.topic,
            interview: {
              intervieweeName: form.intervieweeName,
              intervieweeRole: form.intervieweeRole,
              occurredAt: `${interviewDate.value.toString()}T12:00:00.000Z`,
              sourceSummary: form.interviewNotes,
              consentConfirmed: form.consentConfirmed
            }
          }
        }
      )
      assetId = created.id
      interviewIds = [created.interviewId]
      endpoint = `/api/agency/search-authority/content/${assetId}/versions`
    }
    if (!assetId || !endpoint) throw new Error('Content version route is unavailable')
    await $fetch(endpoint, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('search-authority-content') },
      body: {
        clientId: props.clientId,
        bodyMarkdown: form.bodyMarkdown,
        excerpt: form.excerpt,
        disclaimer: form.disclaimer,
        schemaType: form.schemaType,
        sourceInterviewIds: interviewIds,
        sourceVersionId: sourceVersionId.value,
        claims: form.claims
      }
    })
    toast.add({ title: 'New immutable version saved', color: 'success' })
    open.value = false
    emit('saved')
  } catch (error: unknown) {
    toast.add({ title: 'Version not saved', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

watch(open, (isOpen) => {
  if (isOpen) void loadAsset()
})

function closeEditor() {
  open.value = false
}
</script>

<template>
  <USlideover v-model:open="open" title="Governed content version" description="Capture one source-backed guide without editing approved history.">
    <template #body>
      <div class="@container space-y-6 pb-8">
        <UAlert
          v-if="isExisting"
          title="Creating a new version"
          description="The current version remains unchanged and keeps its approval history."
          icon="i-lucide-git-commit-horizontal"
          color="neutral"
          variant="subtle"
        />
        <div v-if="loading" class="space-y-3">
          <USkeleton class="h-10 w-full" />
          <USkeleton class="h-36 w-full" />
        </div>
        <template v-else>
          <section class="space-y-4">
            <div>
              <h3 class="font-semibold text-highlighted">
                Question and guide
              </h3>
              <p class="mt-1 text-sm text-muted">
                Frame the real buyer question before drafting the answer.
              </p>
            </div>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Customer question" class="@lg:col-span-2" required>
                <UInput
                  v-model="form.topic"
                  class="w-full"
                  :disabled="isExisting"
                  placeholder="What do buyers ask the sales team?"
                />
              </UFormField>
              <UFormField label="Guide title" required>
                <UInput v-model="form.title" class="w-full" :disabled="isExisting" />
              </UFormField>
              <UFormField label="URL slug" required>
                <UInput
                  v-model="form.slug"
                  class="w-full"
                  :disabled="isExisting"
                  placeholder="cannon-alpha-towing-guide"
                />
              </UFormField>
              <UFormField label="Summary" class="@lg:col-span-2" required>
                <UTextarea v-model="form.excerpt" class="w-full" :rows="3" />
              </UFormField>
              <UFormField label="Schema preview">
                <USelectMenu
                  v-model="form.schemaType"
                  :items="schemaOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
            </div>
          </section>

          <section class="space-y-4 border-t border-default pt-6">
            <div>
              <h3 class="font-semibold text-highlighted">
                Sales source
              </h3>
              <p class="mt-1 text-sm text-muted">
                Record the human source and consent behind the guide.
              </p>
            </div>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField label="Interviewee" required>
                <UInput v-model="form.intervieweeName" class="w-full" :disabled="isExisting" />
              </UFormField>
              <UFormField label="Role" required>
                <UInput v-model="form.intervieweeRole" class="w-full" :disabled="isExisting" />
              </UFormField>
              <UFormField label="Interview date">
                <UPopover>
                  <UButton
                    :label="interviewDate.toString()"
                    icon="i-lucide-calendar"
                    color="neutral"
                    variant="outline"
                    class="w-full justify-start"
                    :disabled="isExisting"
                  />
                  <template #content>
                    <UCalendar v-model="interviewDate" class="p-2" />
                  </template>
                </UPopover>
              </UFormField>
              <UFormField label="Source consent" help="Required for a new interview record.">
                <UCheckbox v-model="form.consentConfirmed" label="Consent confirmed" :disabled="isExisting" />
              </UFormField>
              <UFormField label="Interview notes" class="@lg:col-span-2" required>
                <UTextarea
                  v-model="form.interviewNotes"
                  class="w-full"
                  :rows="7"
                  :disabled="isExisting"
                />
              </UFormField>
            </div>
          </section>

          <section class="space-y-4 border-t border-default pt-6">
            <div>
              <h3 class="font-semibold text-highlighted">
                Draft and guardrails
              </h3>
              <p class="mt-1 text-sm text-muted">
                Markdown stays visible, portable and safe to render deterministically.
              </p>
            </div>
            <UFormField label="Markdown body" required>
              <UTextarea v-model="form.bodyMarkdown" class="w-full font-mono" :rows="16" />
            </UFormField>
            <UFormField label="Disclaimer" required>
              <UTextarea v-model="form.disclaimer" class="w-full" :rows="4" />
            </UFormField>
          </section>

          <section class="space-y-4 border-t border-default pt-6">
            <div class="flex items-start justify-between gap-4">
              <div>
                <h3 class="font-semibold text-highlighted">
                  Claims and sources
                </h3>
                <p class="mt-1 text-sm text-muted">
                  Every material claim needs a reviewable source reference.
                </p>
              </div>
              <UButton
                label="Add claim"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                size="sm"
                @click="addClaim"
              />
            </div>
            <UCard v-for="(claim, index) in form.claims" :key="index" variant="subtle">
              <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
                <UFormField :label="`Claim ${index + 1}`" class="@lg:col-span-2" required>
                  <UTextarea v-model="claim.claim" class="w-full" :rows="3" />
                </UFormField>
                <UFormField label="Source type" required>
                  <USelectMenu
                    v-model="claim.sourceType"
                    :items="sourceTypeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Source reference" required>
                  <UInput v-model="claim.sourceReference" class="w-full" placeholder="Document, URL, or interview passage" />
                </UFormField>
              </div>
              <template #footer>
                <div class="flex justify-end">
                  <UButton
                    label="Remove claim"
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="sm"
                    :disabled="form.claims.length === 1"
                    @click="removeClaim(index)"
                  />
                </div>
              </template>
            </UCard>
          </section>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="closeEditor"
        />
        <UButton
          label="Save new version"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="loading"
          @click="save"
        />
      </div>
    </template>
  </USlideover>
</template>
