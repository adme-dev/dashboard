<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
definePageMeta({ title: 'HR Evidence Scorecard', middleware: ['auth'] })

type Criterion = { id: string; label: string; description: string; weight: number; frameworkKey: string; evidenceRequired: string[] }
type ScorecardData = {
  participant: { id: string; memberName: string; memberEmail: string; cycleName: string; roleTitle: string; responseStatus: string | null }
  scorecard: { id: string; version: number; criteria: Criterion[]; evidenceThreshold: number }
  result: null | {
    roleScore: number | null
    operationalEnablement: number
    evidenceCoverage: number
    confidence: string
    publishable: boolean
    publishedAt: string | null
    calculation: { ratings?: RatingInput[]; reviewerNotes?: string; calculation?: any }
  }
}
type RatingInput = { id: string; rating: number | null; hasSufficientEvidence: boolean; evidenceRefs: string[] }
type KpiEvidence = {
  kpi_definition_id: string; name: string; description?: string; unit: string; direction: string;
  target_value?: string | number | null; target_min?: string | number | null; target_max?: string | number | null;
  target_description?: string | null; source_ref: string; observation_id?: string | null;
  period_start?: string | null; period_end?: string | null; actual_value?: string | number | null;
  actual_text?: string | null; observation_source_ref?: string | null;
  evidence_status?: 'unverified' | 'verified' | 'disputed' | 'missing' | null; context_note?: string | null;
}

const route = useRoute()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const data = ref<ScorecardData | null>(null)
const ratings = ref<Record<string, { rating: number | null; hasSufficientEvidence: boolean; evidenceText: string }>>({})
const operationalEnablement = ref(3)
const reviewerNotes = ref('')
const latestCalculation = ref<any>(null)
const followUps = ref<any[]>([])
const followUpOwners = ref<Array<{ id: string; name: string }>>([])
const showFollowUp = ref(false)
const kpiEvidence = ref<KpiEvidence[]>([])
const showKpiRecorder = ref(false)
const selectedKpi = ref<KpiEvidence | null>(null)
const kpiForm = reactive({
  periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
  periodEnd: new Date().toISOString().slice(0, 10),
  resultKind: 'number', actualValue: '', actualText: '', sourceRef: '', contextNote: '', evidenceStatus: 'verified',
})
const kpiStartModel = computed({ get: () => parseDate(kpiForm.periodStart) as DateValue, set: value => { kpiForm.periodStart = value?.toString() || '' } })
const kpiEndModel = computed({ get: () => parseDate(kpiForm.periodEnd) as DateValue, set: value => { kpiForm.periodEnd = value?.toString() || '' } })
const actionItems = [
  { label: 'Learning', value: 'learning' }, { label: 'Coaching', value: 'coaching' },
  { label: 'Process change', value: 'process_change' }, { label: 'Workload adjustment', value: 'workload_adjustment' },
  { label: 'Role clarification', value: 'role_clarification' }, { label: 'Goal adjustment', value: 'goal_adjustment' },
]
const followUpForm = reactive({
  actionType: 'learning', title: '', description: '', rationale: '', ownerId: '',
  dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  capability: '', observableNeed: '', desiredOutcome: '', learningIntervention: '', providerOrResource: '',
})
const followUpDueModel = computed({ get: () => parseDate(followUpForm.dueDate) as DateValue, set: value => { followUpForm.dueDate = value?.toString() || '' } })

const ratingItems = [1, 2, 3, 4, 5].map(value => ({ value, label: String(value) }))
const enablementItems = [
  { value: 1, label: '1 — materially blocked by the operating environment' },
  { value: 2, label: '2 — frequently constrained' },
  { value: 3, label: '3 — mixed or variable enablement' },
  { value: 4, label: '4 — generally well enabled' },
  { value: 5, label: '5 — strongly enabled by systems and dependencies' },
]

async function load() {
  loading.value = true
  try {
    const [scorecardData, followUpData, kpiData] = await Promise.all([
      apiFetch<ScorecardData>(`/api/agency/hr/reviews/participants/${route.params.id}/scorecard`),
      apiFetch<{ followUps: any[]; owners: Array<{ id: string; name: string }> }>(`/api/agency/hr/reviews/participants/${route.params.id}/follow-ups`),
      apiFetch<{ observations: KpiEvidence[] }>(`/api/agency/hr/reviews/participants/${route.params.id}/kpis`),
    ])
    data.value = scorecardData
    followUps.value = followUpData.followUps
    followUpOwners.value = followUpData.owners
    kpiEvidence.value = kpiData.observations
    const existing = new Map((data.value.result?.calculation?.ratings || []).map(item => [item.id, item]))
    ratings.value = Object.fromEntries(data.value.scorecard.criteria.map(criterion => {
      const prior = existing.get(criterion.id)
      const isKpiCriterion = criterion.id === 'role-outcomes-kpis' && kpiEvidence.value.length > 0
      const verifiedKpis = kpiEvidence.value.filter(item => item.evidence_status === 'verified')
      return [criterion.id, {
        rating: prior?.rating ?? null,
        hasSufficientEvidence: isKpiCriterion ? verifiedKpis.length === kpiEvidence.value.length : prior?.hasSufficientEvidence ?? false,
        evidenceText: isKpiCriterion
          ? verifiedKpis.map(item => `${item.name}: ${item.observation_source_ref} · ${item.period_end}`).join('\n')
          : (prior?.evidenceRefs || []).join('\n'),
      }]
    }))
    operationalEnablement.value = data.value.result?.operationalEnablement || 3
    reviewerNotes.value = data.value.result?.calculation?.reviewerNotes || ''
    latestCalculation.value = data.value.result
  } catch (error: any) {
    toast.add({ title: 'Scorecard unavailable', description: error?.data?.statusMessage, color: 'error' })
    await navigateTo('/agency/hr/reviews')
  } finally { loading.value = false }
}
onMounted(() => void load())

function splitLines(value: string) { return value.split('\n').map(item => item.trim()).filter(Boolean) }

function openKpiRecorder(kpi: KpiEvidence) {
  selectedKpi.value = kpi
  kpiForm.periodStart = kpi.period_start || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
  kpiForm.periodEnd = kpi.period_end || new Date().toISOString().slice(0, 10)
  kpiForm.resultKind = kpi.direction === 'milestone' ? 'text' : 'number'
  kpiForm.actualValue = kpi.actual_value === null || kpi.actual_value === undefined ? '' : String(kpi.actual_value)
  kpiForm.actualText = kpi.actual_text || ''
  kpiForm.sourceRef = kpi.observation_source_ref || kpi.source_ref
  kpiForm.contextNote = kpi.context_note || ''
  kpiForm.evidenceStatus = kpi.evidence_status === 'verified' ? 'verified' : 'unverified'
  showKpiRecorder.value = true
}

async function saveKpiEvidence() {
  if (!selectedKpi.value) return
  saving.value = true
  try {
    await apiFetch(`/api/agency/hr/reviews/participants/${route.params.id}/kpis`, {
      method: 'POST',
      body: {
        kpiDefinitionId: selectedKpi.value.kpi_definition_id,
        periodStart: kpiForm.periodStart,
        periodEnd: kpiForm.periodEnd,
        actualValue: kpiForm.resultKind === 'number' && kpiForm.actualValue.trim() ? Number(kpiForm.actualValue) : undefined,
        actualText: kpiForm.resultKind === 'text' ? kpiForm.actualText : undefined,
        sourceRef: kpiForm.sourceRef,
        contextNote: kpiForm.contextNote || undefined,
        evidenceStatus: kpiForm.evidenceStatus,
      },
    })
    toast.add({ title: 'KPI evidence saved', description: kpiForm.evidenceStatus === 'verified' ? 'This result can now contribute to evidence coverage.' : 'This result remains excluded until verified.', color: 'success' })
    showKpiRecorder.value = false
    await load()
  } catch (error: any) {
    toast.add({ title: 'KPI evidence could not be saved', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function save(publish: boolean) {
  if (!data.value) return
  saving.value = true
  try {
    const response = await apiFetch<any>(`/api/agency/hr/reviews/participants/${route.params.id}/scorecard`, {
      method: 'PUT',
      body: {
        operationalEnablement: operationalEnablement.value,
        criteria: data.value.scorecard.criteria.map(criterion => ({
          id: criterion.id,
          rating: ratings.value[criterion.id]?.rating ?? null,
          hasSufficientEvidence: criterion.id === 'role-outcomes-kpis' && kpiEvidence.value.length > 0
            ? kpiEvidence.value.every(item => item.evidence_status === 'verified')
            : ratings.value[criterion.id]?.hasSufficientEvidence ?? false,
          evidenceRefs: criterion.id === 'role-outcomes-kpis' && kpiEvidence.value.length > 0
            ? kpiEvidence.value.filter(item => item.evidence_status === 'verified').map(item => `${item.name}: ${item.observation_source_ref} · ${item.period_end}`)
            : splitLines(ratings.value[criterion.id]?.evidenceText || ''),
        })),
        reviewerNotes: reviewerNotes.value,
        publish,
      },
    })
    latestCalculation.value = response.calculation
    toast.add({
      title: publish ? 'Evidence score published' : 'Scorecard draft saved',
      description: response.calculation.isPublishable
        ? `${response.calculation.evidenceCoverage}% evidence coverage · ${response.calculation.confidence} confidence.`
        : `The system abstained at ${response.calculation.evidenceCoverage}% evidence coverage.`,
      color: response.calculation.isPublishable ? 'success' : 'warning',
    })
    if (publish) await load()
  } catch (error: any) {
    toast.add({ title: 'Scorecard could not be saved', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

async function createFollowUp() {
  saving.value = true
  try {
    await apiFetch(`/api/agency/hr/reviews/participants/${route.params.id}/follow-ups`, {
      method: 'POST',
      body: {
        actionType: followUpForm.actionType,
        title: followUpForm.title,
        description: followUpForm.description,
        rationale: followUpForm.rationale || undefined,
        evidenceRefs: [],
        ownerId: followUpForm.ownerId,
        dueAt: new Date(`${followUpForm.dueDate}T17:00:00`).toISOString(),
        visibility: 'participant_and_hr',
        learning: followUpForm.actionType === 'learning' ? {
          capability: followUpForm.capability,
          observableNeed: followUpForm.observableNeed,
          desiredOutcome: followUpForm.desiredOutcome,
          learningIntervention: followUpForm.learningIntervention,
          providerOrResource: followUpForm.providerOrResource || undefined,
        } : undefined,
      },
    })
    toast.add({ title: 'Follow-up assigned', description: 'The participant and action owner have been notified.', color: 'success' })
    showFollowUp.value = false
    await load()
  } catch (error: any) { toast.add({ title: 'Follow-up could not be created', description: error?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <div v-if="loading" class="flex min-h-[70vh] items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
    <template v-else-if="data">
      <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-6xl px-5 py-8 sm:px-8"><div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div class="max-w-3xl border-l-4 border-primary pl-5"><p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Human-reviewed evidence assessment</p><h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">{{ data.participant.memberName }}</h1><p class="mt-2 text-sm text-muted">{{ data.participant.roleTitle }} · {{ data.participant.cycleName }}</p></div><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review cycles" to="/agency/hr/reviews" /></div></div></header>
      <main class="mx-auto max-w-6xl space-y-7 px-5 py-8 sm:px-8">
        <div class="grid overflow-hidden rounded-xl border border-default md:grid-cols-3"><div class="bg-default p-5"><p class="text-xs uppercase tracking-wide text-muted">Role performance</p><p class="mt-2 font-mono text-3xl font-semibold text-highlighted">{{ latestCalculation?.rolePerformanceScore ?? latestCalculation?.roleScore ?? '—' }}<span class="text-base text-muted"> / 5</span></p></div><div class="border-t border-default bg-default p-5 md:border-l md:border-t-0"><p class="text-xs uppercase tracking-wide text-muted">Operational enablement</p><p class="mt-2 font-mono text-3xl font-semibold text-highlighted">{{ operationalEnablement }}<span class="text-base text-muted"> / 5</span></p></div><div class="border-t border-default bg-default p-5 md:border-l md:border-t-0"><p class="text-xs uppercase tracking-wide text-muted">Evidence coverage</p><p class="mt-2 font-mono text-3xl font-semibold" :class="(latestCalculation?.evidenceCoverage || 0) >= data.scorecard.evidenceThreshold ? 'text-success' : 'text-warning'">{{ latestCalculation?.evidenceCoverage ?? 0 }}<span class="text-base">%</span></p><p class="mt-1 text-xs text-muted">{{ data.scorecard.evidenceThreshold }}% required</p></div></div>

        <UAlert color="info" variant="soft" icon="i-lucide-scale" title="Two scores, two different questions" description="Role performance reflects evidenced delivery against the published framework. Operational enablement reflects whether workload, tools, priorities, dependencies and decision access make that delivery possible. They are never averaged together." />

        <section v-if="kpiEvidence.length" class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-4"><div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Challengeable operational evidence</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Role KPI observations</h2><p class="mt-1 text-sm text-muted">Only a latest verified observation for every published role KPI can substantiate the KPI criterion.</p></div><UBadge color="neutral" variant="subtle" :label="`${kpiEvidence.filter(item => item.evidence_status === 'verified').length}/${kpiEvidence.length} verified`" /></div>
          <div class="divide-y divide-default"><div v-for="kpi in kpiEvidence" :key="kpi.kpi_definition_id" class="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="font-medium text-highlighted">{{ kpi.name }}</p><UBadge :color="kpi.evidence_status === 'verified' ? 'success' : kpi.evidence_status === 'disputed' ? 'error' : 'warning'" variant="outline" :label="kpi.evidence_status || 'not recorded'" /></div><p class="mt-1 text-sm text-muted">Approved source: {{ kpi.source_ref }}</p><p v-if="kpi.observation_id" class="mt-2 text-sm text-highlighted">Result: {{ kpi.actual_text || kpi.actual_value }} {{ kpi.actual_text ? '' : kpi.unit }} · {{ kpi.period_start }} to {{ kpi.period_end }}</p><p v-if="kpi.context_note" class="mt-1 text-xs text-muted">Context: {{ kpi.context_note }}</p></div><UButton color="neutral" variant="outline" icon="i-lucide-file-check-2" :label="kpi.observation_id ? 'Review evidence' : 'Record evidence'" @click="openKpiRecorder(kpi)" /></div></div>
        </section>

        <section v-if="showKpiRecorder && selectedKpi" class="rounded-xl border border-primary/30 bg-default">
          <div class="border-b border-default px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">{{ selectedKpi.name }}</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Record sourced KPI evidence</h2></div>
          <div class="grid gap-5 p-5 md:grid-cols-2"><UFormField label="Period starts" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar" :label="kpiForm.periodStart" class="w-full justify-start" /><template #content><UCalendar v-model="kpiStartModel" class="p-2" /></template></UPopover></UFormField><UFormField label="Period ends" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-check" :label="kpiForm.periodEnd" class="w-full justify-start" /><template #content><UCalendar v-model="kpiEndModel" class="p-2" /></template></UPopover></UFormField><UFormField label="Result format" required><USelectMenu v-model="kpiForm.resultKind" :items="[{ label: 'Numeric result', value: 'number' }, { label: 'Milestone result', value: 'text' }]" value-key="value" class="w-full" /></UFormField><UFormField v-if="kpiForm.resultKind === 'number'" :label="`Actual (${selectedKpi.unit})`" required><UInput v-model="kpiForm.actualValue" type="number" class="w-full" /></UFormField><UFormField v-else label="Milestone result" required><UInput v-model="kpiForm.actualText" class="w-full" /></UFormField><UFormField label="Evidence source reference" required class="md:col-span-2"><UInput v-model="kpiForm.sourceRef" placeholder="Report, Monday item, dashboard metric or approved record" class="w-full" /></UFormField><UFormField label="Verification state" required><USelectMenu v-model="kpiForm.evidenceStatus" :items="[{ label: 'Verified', value: 'verified' }, { label: 'Unverified', value: 'unverified' }]" value-key="value" class="w-full" /></UFormField><UFormField label="Verification context"><UTextarea v-model="kpiForm.contextNote" :rows="3" class="w-full" /></UFormField></div>
          <div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showKpiRecorder = false" /><UButton icon="i-lucide-shield-check" label="Save KPI evidence" :loading="saving" @click="saveKpiEvidence" /></div>
        </section>

        <section class="overflow-hidden rounded-xl border border-default bg-default"><div class="border-b border-default px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Framework version locked</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Evidence by criterion</h2></div><div class="divide-y divide-default">
          <div v-for="criterion in data.scorecard.criteria" :key="criterion.id" class="p-5 sm:p-6"><div class="flex flex-col gap-5 lg:flex-row"><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><h3 class="font-medium text-highlighted">{{ criterion.label }}</h3><UBadge color="neutral" variant="outline" :label="`${criterion.weight}%`" /><UBadge color="neutral" variant="subtle" :label="criterion.frameworkKey" /></div><p class="mt-2 text-sm leading-6 text-muted">{{ criterion.description }}</p><details class="mt-3 text-sm"><summary class="cursor-pointer text-primary">View role evidence requirements</summary><ul class="mt-2 space-y-1 pl-4 text-muted"><li v-for="item in criterion.evidenceRequired" :key="item">• {{ item }}</li></ul></details></div><div class="w-full space-y-4 lg:w-80"><UFormField label="Rating (1–5)"><URadioGroup v-model="ratings[criterion.id].rating" :items="ratingItems" orientation="horizontal" /></UFormField><UCheckbox v-model="ratings[criterion.id].hasSufficientEvidence" label="Suitable evidence is available" /><UFormField label="Evidence references" help="One verifiable reference per line."><UTextarea v-model="ratings[criterion.id].evidenceText" :rows="3" placeholder="Questionnaire response&#10;Monday item URL&#10;Approved work sample" class="w-full" /></UFormField></div></div></div>
        </div></section>

        <section class="grid gap-6 lg:grid-cols-2"><div class="rounded-xl border border-default bg-default p-5"><UFormField label="Operational enablement" help="Rate the working environment, not the individual."><USelectMenu v-model="operationalEnablement" :items="enablementItems" value-key="value" class="mt-2 w-full" /></UFormField></div><div class="rounded-xl border border-default bg-default p-5"><UFormField label="Reviewer context" help="Optional. Record limitations, contrary evidence or follow-up needed."><UTextarea v-model="reviewerNotes" :rows="5" class="mt-2 w-full" /></UFormField></div></section>

        <div class="flex flex-col gap-3 rounded-xl border border-default bg-elevated/30 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p class="font-medium text-highlighted">Publication remains a human action</p><p class="mt-1 text-sm text-muted">Saving calculates coverage. Publishing is blocked automatically if the evidence threshold is not met.</p></div><div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-save" label="Save draft" :loading="saving" @click="save(false)" /><UButton icon="i-lucide-shield-check" label="Publish evidence score" :loading="saving" @click="save(true)" /></div></div>

        <section class="rounded-xl border border-default bg-default"><div class="flex items-center justify-between border-b border-default px-5 py-4"><div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Action, ownership, due date</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Review follow-ups</h2></div><UButton icon="i-lucide-plus" label="Add follow-up" @click="showFollowUp = !showFollowUp" /></div><div v-if="followUps.length" class="divide-y divide-default"><div v-for="item in followUps" :key="item.id" class="flex flex-col gap-3 p-5 sm:flex-row sm:items-center"><div class="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><UIcon :name="item.action_type === 'learning' ? 'i-lucide-graduation-cap' : 'i-lucide-list-checks'" class="size-4" /></div><div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="font-medium text-highlighted">{{ item.title }}</p><UBadge color="neutral" variant="subtle" :label="item.action_type.replaceAll('_', ' ')" /><UBadge :color="item.status === 'completed' ? 'success' : 'warning'" variant="outline" :label="item.status" /></div><p class="mt-1 text-sm text-muted">{{ item.description }}</p><p class="mt-2 text-xs text-muted">Owner: {{ item.owner_name }} · due {{ new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(item.due_at)) }}</p></div></div></div><div v-else class="p-8 text-center text-sm text-muted">No follow-up actions recorded yet.</div></section>

        <section v-if="showFollowUp" class="rounded-xl border border-primary/30 bg-default"><div class="border-b border-default px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">New accountable action</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Plan the next step</h2></div><div class="grid gap-5 p-5 lg:grid-cols-2"><UFormField label="Action type" required><USelectMenu v-model="followUpForm.actionType" :items="actionItems" value-key="value" class="w-full" /></UFormField><UFormField label="Action owner" required><USelectMenu v-model="followUpForm.ownerId" :items="followUpOwners.map(owner => ({ label: owner.name, value: owner.id }))" value-key="value" class="w-full" /></UFormField><UFormField label="Title" required class="lg:col-span-2"><UInput v-model="followUpForm.title" class="w-full" /></UFormField><UFormField label="Action description" required class="lg:col-span-2"><UTextarea v-model="followUpForm.description" :rows="4" class="w-full" /></UFormField><UFormField label="Evidence-based rationale" class="lg:col-span-2"><UTextarea v-model="followUpForm.rationale" :rows="3" class="w-full" /></UFormField><UFormField label="Required by" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-check" :label="followUpForm.dueDate" class="w-full justify-start" /><template #content><UCalendar v-model="followUpDueModel" class="p-2" /></template></UPopover></UFormField><template v-if="followUpForm.actionType === 'learning'"><UFormField label="Capability" required><UInput v-model="followUpForm.capability" class="w-full" /></UFormField><UFormField label="Observable learning need" required class="lg:col-span-2"><UTextarea v-model="followUpForm.observableNeed" :rows="3" placeholder="State the role-related evidence; do not infer personality or aptitude." class="w-full" /></UFormField><UFormField label="Desired outcome" required><UTextarea v-model="followUpForm.desiredOutcome" :rows="3" class="w-full" /></UFormField><UFormField label="Learning intervention" required><UTextarea v-model="followUpForm.learningIntervention" :rows="3" placeholder="Course, coaching, shadowing, practice or documentation" class="w-full" /></UFormField><UFormField label="Provider or resource" class="lg:col-span-2"><UInput v-model="followUpForm.providerOrResource" class="w-full" /></UFormField></template></div><div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showFollowUp = false" /><UButton icon="i-lucide-send" label="Assign follow-up" :loading="saving" @click="createFollowUp" /></div></section>
      </main>
    </template>
  </div>
</template>
