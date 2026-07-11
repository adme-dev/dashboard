<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'

definePageMeta({ title: 'HR Knowledge Base', middleware: ['auth'] })

type SourceRef = { sourceType: string; sourceId: string; label: string; sourceUrl?: string }
type KnowledgeEntry = {
  id: string; entry_key: string; entry_type: string; title: string; status: string; version: number;
  content: string; source_refs: SourceRef[]; provenance_note: string; confidentiality: string;
  permitted_uses: string[]; limitations: string[]; effective_from: string; review_due_at: string;
  retention_review_at: string | null; dispute_note: string | null; general_ai_excluded: boolean;
  owner_name: string | null; created_by_name: string | null; approved_at: string | null;
  established_version_id: string | null; established_version: number | null; established_content: string | null;
}
type KnowledgeResponse = { entries: KnowledgeEntry[]; policy: { prohibitedContent: string[] } }

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const entries = ref<KnowledgeEntry[]>([])
const policy = ref<KnowledgeResponse['policy'] | null>(null)
const loading = ref(true)
const saving = ref(false)
const showEditor = ref(false)
const editingId = ref<string | null>(null)
const expectedVersion = ref<number | null>(null)
const today = () => new Date().toISOString().slice(0, 10)
const futureDate = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10) }

const entryTypeItems = [
  'business_context', 'role_profile', 'process_profile', 'responsibility_map', 'policy_standard',
  'evidence_definition', 'question_bank', 'blocker_taxonomy', 'validated_theme', 'published_finding',
  'completed_action', 'measured_outcome', 'solution_playbook', 'source_governance', 'privacy_notice',
  'retention_policy', 'limitation',
].map(value => ({ value, label: value.replaceAll('_', ' ') }))
const statusItems = [{ value: 'draft', label: 'Draft' }, { value: 'disputed', label: 'Disputed' }, { value: 'approved', label: 'Approved' }]
const sourceTypeItems = ['business_context', 'role_profile', 'process_profile', 'responsibility_map', 'policy', 'standard', 'evidence_definition', 'questionnaire_template', 'published_finding', 'completed_action', 'measured_outcome', 'source_governance', 'external_reference'].map(value => ({ value, label: value.replaceAll('_', ' ') }))
const useItems = ['questionnaire_design', 'role_clarity', 'evidence_interpretation', 'review_context', 'solution_recommendation', 'aggregate_reporting']

const form = reactive({
  entryType: 'business_context', title: '', content: '', status: 'draft', provenanceNote: '',
  confidentiality: 'restricted_hr', permittedUses: ['questionnaire_design'] as string[], limitations: '',
  effectiveFrom: today(), reviewDueAt: futureDate(180), retentionReviewAt: '', disputeNote: '',
  sourceRefs: [] as SourceRef[], sourceType: 'business_context', sourceId: '', sourceLabel: '', sourceUrl: '',
})
const effectiveModel = computed({ get: () => parseDate(form.effectiveFrom) as DateValue, set: value => { form.effectiveFrom = value?.toString() || '' } })
const reviewModel = computed({ get: () => parseDate(form.reviewDueAt) as DateValue, set: value => { form.reviewDueAt = value?.toString() || '' } })
const retentionModel = computed({ get: () => form.retentionReviewAt ? parseDate(form.retentionReviewAt) as DateValue : undefined, set: value => { form.retentionReviewAt = value?.toString() || '' } })
const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const displayDate = (value: string) => dateFormat.format(new Date(`${value.slice(0, 10)}T00:00:00`))
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean)
const statusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => status === 'approved' ? 'success' : status === 'disputed' ? 'error' : status === 'draft' ? 'warning' : 'neutral'

async function refresh() {
  loading.value = true
  try { const data = await apiFetch<KnowledgeResponse>('/api/agency/hr/knowledge'); entries.value = data.entries; policy.value = data.policy }
  catch (error: any) { toast.add({ title: 'HR knowledge unavailable', description: error?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}
onMounted(() => void refresh())

function resetForm() {
  Object.assign(form, { entryType: 'business_context', title: '', content: '', status: 'draft', provenanceNote: '', confidentiality: 'restricted_hr', permittedUses: ['questionnaire_design'], limitations: '', effectiveFrom: today(), reviewDueAt: futureDate(180), retentionReviewAt: '', disputeNote: '', sourceRefs: [], sourceType: 'business_context', sourceId: '', sourceLabel: '', sourceUrl: '' })
}
function createEntry() { editingId.value = null; expectedVersion.value = null; resetForm(); showEditor.value = true }
function reviseEntry(entry: KnowledgeEntry) {
  editingId.value = entry.id; expectedVersion.value = Number(entry.version)
  Object.assign(form, { entryType: entry.entry_type, title: entry.title, content: entry.content, status: entry.status === 'approved' ? 'draft' : entry.status, provenanceNote: entry.provenance_note, confidentiality: entry.confidentiality, permittedUses: [...entry.permitted_uses], limitations: entry.limitations.join('\n'), effectiveFrom: entry.effective_from.slice(0, 10), reviewDueAt: entry.review_due_at.slice(0, 10), retentionReviewAt: entry.retention_review_at?.slice(0, 10) || '', disputeNote: entry.dispute_note || '', sourceRefs: entry.source_refs.map(source => ({ ...source })), sourceType: 'external_reference', sourceId: '', sourceLabel: '', sourceUrl: '' })
  showEditor.value = true
}
function addSource() {
  if (!form.sourceId.trim() || !form.sourceLabel.trim()) {
    toast.add({ title: 'Complete the source', description: 'Source identifier and label are required.', color: 'warning' })
    return
  }
  form.sourceRefs.push({ sourceType: form.sourceType, sourceId: form.sourceId.trim(), label: form.sourceLabel.trim(), ...(form.sourceUrl.trim() ? { sourceUrl: form.sourceUrl.trim() } : {}) })
  form.sourceId = ''; form.sourceLabel = ''; form.sourceUrl = ''
}
function toggleUse(value: string, selected: boolean) {
  form.permittedUses = selected ? [...new Set([...form.permittedUses, value])] : form.permittedUses.filter(item => item !== value)
}
async function save() {
  saving.value = true
  try {
    const endpoint = editingId.value ? `/api/agency/hr/knowledge/${editingId.value}/versions` : '/api/agency/hr/knowledge'
    await apiFetch(endpoint, { method: 'POST', body: {
      entryType: form.entryType, title: form.title, content: form.content, status: form.status,
      sourceRefs: form.sourceRefs, provenanceNote: form.provenanceNote, confidentiality: form.confidentiality,
      permittedUses: form.permittedUses, limitations: lines(form.limitations), effectiveFrom: form.effectiveFrom,
      reviewDueAt: form.reviewDueAt, retentionReviewAt: form.retentionReviewAt || undefined,
      disputeNote: form.status === 'disputed' ? form.disputeNote : undefined,
      ...(editingId.value ? { expectedVersion: expectedVersion.value } : {}),
    } })
    toast.add({ title: editingId.value ? 'Knowledge version saved' : 'Knowledge entry created', description: form.status === 'approved' ? 'The source-cited version is now established knowledge.' : 'The entry remains clearly labelled and cannot be retrieved as established fact.', color: 'success' })
    showEditor.value = false; await refresh()
  } catch (error: any) { toast.add({ title: 'Knowledge entry could not be saved', description: error?.data?.statusMessage || 'Review the governance fields and try again.', color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div class="max-w-3xl border-l-4 border-primary pl-5"><p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Private provenance ledger</p><h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">HR Review Knowledge Base</h1><p class="mt-3 text-sm leading-6 text-muted">Store approved context, standards, evidence definitions and solution playbooks as source-cited versions. Drafts and disputes remain visibly separate from established knowledge.</p></div><div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /><UButton icon="i-lucide-book-lock" label="Add knowledge" @click="createEntry" /></div></div></div></header>
    <main class="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
      <UAlert color="info" variant="soft" icon="i-lucide-shield-check" title="Isolated from general AI and search" description="Original contracts, questionnaire answers, anonymous raw feedback and private messages are prohibited. Structured records remain authoritative; vector indexing is disabled by default." />
      <div v-if="loading" class="flex min-h-72 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
      <div v-else-if="entries.length" class="grid gap-4 lg:grid-cols-2">
        <article v-for="entry in entries" :key="entry.id" class="overflow-hidden rounded-xl border border-default bg-default"><div class="border-b border-default bg-elevated/30 p-5"><div class="flex items-start justify-between gap-3"><div><div class="flex flex-wrap gap-2"><UBadge color="neutral" variant="outline" :label="entry.entry_type.replaceAll('_', ' ')" /><UBadge :color="statusColor(entry.status)" variant="subtle" :label="`${entry.status} · v${entry.version}`" /></div><h2 class="mt-3 text-lg font-semibold text-highlighted">{{ entry.title }}</h2></div><UButton color="neutral" variant="ghost" icon="i-lucide-git-branch-plus" aria-label="Create a new version" @click="reviseEntry(entry)" /></div></div><div class="p-5"><p class="line-clamp-4 whitespace-pre-line text-sm leading-6 text-muted">{{ entry.content }}</p><UAlert v-if="entry.status !== 'approved' && entry.established_version" class="mt-4" color="success" variant="subtle" icon="i-lucide-badge-check" :title="`Version ${entry.established_version} remains established`" description="This working version has not replaced the last approved record." /><dl class="mt-5 grid gap-3 border-t border-default pt-4 sm:grid-cols-2"><div><dt class="text-[11px] uppercase tracking-wide text-muted">Effective</dt><dd class="mt-1 text-sm text-highlighted">{{ displayDate(entry.effective_from) }}</dd></div><div><dt class="text-[11px] uppercase tracking-wide text-muted">Review due</dt><dd class="mt-1 text-sm text-highlighted">{{ displayDate(entry.review_due_at) }}</dd></div><div><dt class="text-[11px] uppercase tracking-wide text-muted">Sources</dt><dd class="mt-1 text-sm text-highlighted">{{ entry.source_refs.length }}</dd></div><div><dt class="text-[11px] uppercase tracking-wide text-muted">General AI</dt><dd class="mt-1 text-sm text-success">Excluded</dd></div></dl><p v-if="entry.dispute_note" class="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error">{{ entry.dispute_note }}</p></div></article>
      </div>
      <div v-else class="rounded-xl border border-dashed border-default px-6 py-14 text-center"><UIcon name="i-lucide-book-lock" class="mx-auto size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No governed HR knowledge yet</p><p class="mt-1 text-sm text-muted">Start with an approved business context, evidence definition, or policy limitation.</p></div>
    </main>

    <UModal v-model:open="showEditor" :ui="{ content: 'sm:max-w-4xl' }"><template #content><div class="border-b border-default px-6 py-5"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">{{ editingId ? 'New immutable version' : 'New governed record' }}</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Knowledge governance</h2></div><div class="max-h-[72vh] space-y-5 overflow-y-auto p-6"><div class="grid gap-4 sm:grid-cols-2"><UFormField label="Knowledge type" required><USelectMenu v-model="form.entryType" :items="entryTypeItems" value-key="value" class="w-full" :disabled="Boolean(editingId)" /></UFormField><UFormField label="State" required><USelectMenu v-model="form.status" :items="statusItems" value-key="value" class="w-full" /></UFormField></div><UFormField label="Title" required><UInput v-model="form.title" class="w-full" /></UFormField><UFormField label="Knowledge statement" required help="Record only the minimum information needed for the permitted HR use."><UTextarea v-model="form.content" :rows="7" class="w-full" /></UFormField><UFormField label="Provenance note" required help="Explain who established this, how it was checked, and what remains uncertain."><UTextarea v-model="form.provenanceNote" :rows="3" class="w-full" /></UFormField><div class="grid gap-4 sm:grid-cols-3"><UFormField label="Effective from" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar" :label="displayDate(form.effectiveFrom)" class="w-full justify-start" /><template #content><UCalendar v-model="effectiveModel" class="p-2" /></template></UPopover></UFormField><UFormField label="Review due" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-check" :label="displayDate(form.reviewDueAt)" class="w-full justify-start" /><template #content><UCalendar v-model="reviewModel" class="p-2" /></template></UPopover></UFormField><UFormField label="Retention review"><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-archive-restore" :label="form.retentionReviewAt ? displayDate(form.retentionReviewAt) : 'Not set'" class="w-full justify-start" /><template #content><div class="p-2"><UCalendar v-model="retentionModel" /><div class="border-t border-default pt-2"><UButton color="neutral" variant="ghost" size="sm" label="Clear" @click="form.retentionReviewAt = ''" /></div></div></template></UPopover></UFormField></div><UFormField v-if="form.status === 'disputed'" label="Dispute note" required><UTextarea v-model="form.disputeNote" :rows="3" class="w-full" /></UFormField><div><p class="text-sm font-medium text-highlighted">Permitted uses</p><div class="mt-3 grid gap-3 sm:grid-cols-2"><UCheckbox v-for="use in useItems" :key="use" :model-value="form.permittedUses.includes(use)" :label="use.replaceAll('_', ' ')" @update:model-value="value => toggleUse(use, Boolean(value))" /></div></div><UFormField label="Limitations" help="One limitation per line."><UTextarea v-model="form.limitations" :rows="3" class="w-full" /></UFormField><section class="overflow-hidden rounded-lg border border-default"><div class="border-b border-default bg-elevated/30 px-4 py-3"><h3 class="text-sm font-medium text-highlighted">Source citations</h3><p class="mt-1 text-xs text-muted">Approved knowledge requires at least one authorised source. Raw employee answers and original contracts are not supported source types.</p></div><div class="space-y-4 p-4"><div v-for="(source, index) in form.sourceRefs" :key="`${source.sourceType}:${source.sourceId}:${index}`" class="flex items-start justify-between gap-3 rounded-lg bg-elevated/40 p-3"><div><p class="text-sm font-medium text-highlighted">{{ source.label }}</p><p class="mt-1 text-xs text-muted">{{ source.sourceType.replaceAll('_', ' ') }} · {{ source.sourceId }}</p></div><UButton color="error" variant="ghost" size="xs" icon="i-lucide-x" aria-label="Remove source" @click="form.sourceRefs.splice(index, 1)" /></div><div class="grid gap-3 sm:grid-cols-2"><UFormField label="Source type"><USelectMenu v-model="form.sourceType" :items="sourceTypeItems" value-key="value" class="w-full" /></UFormField><UFormField label="Source identifier"><UInput v-model="form.sourceId" class="w-full" /></UFormField></div><UFormField label="Source label"><UInput v-model="form.sourceLabel" class="w-full" /></UFormField><UFormField label="Source URL (optional)"><UInput v-model="form.sourceUrl" type="url" class="w-full" /></UFormField><UButton color="neutral" variant="outline" icon="i-lucide-plus" label="Add source" @click="addSource" /></div></section></div><div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showEditor = false" /><UButton icon="i-lucide-shield-check" :label="editingId ? 'Save new version' : 'Create knowledge entry'" :loading="saving" @click="save" /></div></template></UModal>
  </div>
</template>
