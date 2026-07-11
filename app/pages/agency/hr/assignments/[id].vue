<script setup lang="ts">
definePageMeta({
  title: 'My Business Review',
  middleware: ['auth'],
})

type Option = { value: string; label: string }
type Question = {
  id: string
  module: 'core' | 'role' | 'blockers'
  type: 'single_choice' | 'multiple_choice' | 'optional_text'
  prompt: string
  required: boolean
  responsibility?: string
  options?: Option[]
}
type AssignmentData = {
  assignment: {
    id: string
    participantId: string
    roleAcknowledgement: { status: 'pending' | 'acknowledged' | 'disputed'; note: string | null }
    status: string
    dueAt: string
    cycleName: string
    questionnaireName: string
    canRespond: boolean
    role: {
      title: string
      purpose: string
      responsibilities: string[]
      expectedOutcomes: string[]
      kpis: Array<{
        id: string; name: string; description?: string; unit: string; direction: string;
        targetValue?: number | null; targetMin?: number | null; targetMax?: number | null;
        targetDescription?: string | null; cadence: string; sourceType: string;
        sourceRef?: string | null; weight: number; departmentGoal?: string | null;
      }>
    }
    questions: Question[]
  }
  response: null | { status: string; answers: Record<string, string | string[]>; submittedAt: string | null }
}
type KpiEvidence = {
  kpi_definition_id: string
  observation_id: string | null
  actual_value: string | number | null
  actual_text: string | null
  evidence_status: 'unverified' | 'verified' | 'disputed' | 'missing' | null
  observation_source_ref: string | null
  period_start: string | null
  period_end: string | null
  context_note: string | null
}
type MondayEvidence = {
  mondayBoardId: string
  mondayItemId: string
  taskId: string | null
  title: string
  dueDate: string | null
  taskStatus: string | null
  isBlocked: boolean
}

const route = useRoute()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const data = ref<AssignmentData | null>(null)
const answers = ref<Record<string, string | string[]>>({})
const issues = ref<Record<string, string>>({})
const kpiEvidence = ref<KpiEvidence[]>([])
const mondayEvidence = ref<MondayEvidence[]>([])
const mondayEvidenceNotice = ref('')
const disputeObservationId = ref<string | null>(null)
const disputeNote = ref('')
const roleDisputeNote = ref('')
const showSubmitConfirmation = ref(false)

const assignmentId = computed(() => String(route.params.id || ''))
const answeredCount = computed(() => data.value?.assignment.questions.filter(question => {
  const answer = answers.value[question.id]
  return Array.isArray(answer) ? answer.length > 0 : Boolean(answer)
}).length || 0)
const requiredCount = computed(() => data.value?.assignment.questions.filter(question => question.required).length || 0)

async function load() {
  loading.value = true
  try {
    data.value = await apiFetch<AssignmentData>(`/api/agency/hr/assignments/${assignmentId.value}`)
    answers.value = { ...(data.value.response?.answers || {}) }
    const evidence = await apiFetch<{ observations: KpiEvidence[] }>(`/api/agency/hr/reviews/participants/${data.value.assignment.participantId}/kpis`)
    kpiEvidence.value = evidence.observations
    const monday = await apiFetch<{ active: boolean; evidence: MondayEvidence[]; notice?: string }>('/api/agency/hr/monday/evidence/my')
      .catch((): { active: boolean; evidence: MondayEvidence[]; notice?: string } => ({ active: false, evidence: [] }))
    mondayEvidence.value = monday.evidence
    mondayEvidenceNotice.value = monday.notice || ''
  } catch (error: any) {
    toast.add({ title: 'Review assignment unavailable', description: error?.data?.statusMessage, color: 'error' })
    await navigateTo('/agency/hr')
  } finally {
    loading.value = false
  }
}
onMounted(() => void load())

function toggleMultiple(questionId: string, value: string, checked: boolean) {
  const current = Array.isArray(answers.value[questionId]) ? answers.value[questionId] as string[] : []
  if (checked) {
    answers.value[questionId] = value === 'none' ? ['none'] : [...current.filter(item => item !== 'none'), value]
  } else {
    answers.value[questionId] = current.filter(item => item !== value)
  }
}

async function save(status: 'draft' | 'submitted') {
  saving.value = true
  issues.value = {}
  try {
    await apiFetch(`/api/agency/hr/assignments/${assignmentId.value}/response`, {
      method: 'PUT', body: { status, answers: answers.value },
    })
    toast.add({
      title: status === 'submitted' ? 'Review submitted' : 'Private draft saved',
      description: status === 'submitted' ? 'Your reviewer can now consider your answers and follow up for context.' : 'You can return before the cycle closes.',
      color: 'success',
    })
    if (status === 'submitted') {
      showSubmitConfirmation.value = false
      await load()
    }
  } catch (error: any) {
    const responseIssues = error?.data?.data?.issues || error?.data?.issues || []
    for (const issue of responseIssues) issues.value[issue.questionId] = issue.message
    toast.add({ title: status === 'submitted' ? 'Some answers need attention' : 'Draft could not be saved', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}

const formatDue = (value: string) => new Intl.DateTimeFormat('en-AU', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value))
function kpiTarget(kpi: AssignmentData['assignment']['role']['kpis'][number]): string {
  if (kpi.direction === 'within_range') return `${kpi.targetMin}–${kpi.targetMax} ${kpi.unit}`
  if (kpi.direction === 'milestone') return kpi.targetDescription || 'Milestone completion'
  return `${kpi.targetValue} ${kpi.unit}`
}
function observationFor(kpiId: string): KpiEvidence | undefined {
  return kpiEvidence.value.find(item => item.kpi_definition_id === kpiId)
}
function observationValue(observation: KpiEvidence): string {
  return observation.actual_text || (observation.actual_value === null ? 'No result recorded' : String(observation.actual_value))
}
async function disputeObservation(observationId: string) {
  if (!data.value || !disputeNote.value.trim()) return
  saving.value = true
  try {
    await apiFetch(`/api/agency/hr/reviews/participants/${data.value.assignment.participantId}/kpis/${observationId}`, {
      method: 'PATCH', body: { evidenceStatus: 'disputed', contextNote: disputeNote.value },
    })
    toast.add({ title: 'KPI evidence challenged', description: 'The result is excluded from verified scoring until a reviewer resolves it.', color: 'success' })
    disputeObservationId.value = null
    disputeNote.value = ''
    await load()
  } catch (error: any) {
    toast.add({ title: 'Challenge could not be recorded', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
async function acknowledgeRole(status: 'acknowledged' | 'disputed') {
  if (!data.value || status === 'disputed' && !roleDisputeNote.value.trim()) return
  saving.value = true
  try {
    await apiFetch(`/api/agency/hr/assignments/${assignmentId.value}/role-acknowledgement`, {
      method: 'PATCH', body: { status, note: roleDisputeNote.value || undefined },
    })
    toast.add({ title: status === 'acknowledged' ? 'Role baseline acknowledged' : 'Role baseline disputed', description: status === 'acknowledged' ? 'Your review is now anchored to the confirmed role version.' : 'The reviewer and owner can see your correction before scoring.', color: status === 'acknowledged' ? 'success' : 'warning' })
    await load()
  } catch (error: any) {
    toast.add({ title: 'Role acknowledgement could not be saved', description: error?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <div v-if="loading" class="flex min-h-[70vh] items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
    <template v-else-if="data">
      <header class="border-b border-default bg-elevated/30">
        <div class="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div class="max-w-3xl border-l-4 border-primary pl-5">
              <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Private participant response</p>
              <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">{{ data.assignment.questionnaireName }}</h1>
              <p class="mt-2 text-sm text-muted">{{ data.assignment.cycleName }} · required by {{ formatDue(data.assignment.dueAt) }}</p>
            </div>
            <div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="My reviews" to="/agency/hr" /><UButton color="neutral" variant="outline" icon="i-lucide-calendar-plus" label="Calendar" :to="`/api/agency/hr/assignments/${assignmentId}/calendar`" external /></div>
          </div>
        </div>
      </header>

      <main class="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-8">
        <UAlert v-if="data.response?.status === 'submitted'" color="success" variant="soft" icon="i-lucide-circle-check" title="Response submitted" description="Your answers are locked. A reviewer may contact you to clarify context; the system does not make an employment decision." />
        <UAlert v-else color="info" variant="soft" icon="i-lucide-shield-check" title="Answer from your perspective" description="Choose “not applicable” when a question falls outside your role or visibility. Optional context can identify dependencies, unclear ownership or process blockers." />
        <section class="rounded-xl border border-default bg-default p-5"><div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p class="text-xs font-semibold uppercase tracking-wide text-muted">Role baseline acknowledgement</p><p class="mt-2 text-sm leading-6 text-muted">Confirm that the responsibilities and outcomes below describe the work you are expected to perform. This is a correction channel, not an admission of performance.</p><p v-if="data.assignment.roleAcknowledgement.status === 'disputed'" class="mt-2 text-sm text-warning">Your correction is recorded: {{ data.assignment.roleAcknowledgement.note }}</p></div><UBadge :color="data.assignment.roleAcknowledgement.status === 'acknowledged' ? 'success' : data.assignment.roleAcknowledgement.status === 'disputed' ? 'warning' : 'neutral'" variant="subtle" :label="data.assignment.roleAcknowledgement.status" /></div><div v-if="data.assignment.roleAcknowledgement.status !== 'acknowledged'" class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><UFormField label="Correction (required only when disputing)" class="min-w-0 flex-1"><UTextarea v-model="roleDisputeNote" :rows="3" placeholder="What is inaccurate, missing or outside your agreed responsibilities?" class="w-full" /></UFormField><div class="flex gap-2"><UButton color="neutral" icon="i-lucide-check" label="Acknowledge" :loading="saving" @click="acknowledgeRole('acknowledged')" /><UButton color="warning" variant="soft" icon="i-lucide-message-square-warning" label="Dispute" :loading="saving" @click="acknowledgeRole('disputed')" /></div></div></section>

        <section class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="border-b border-default bg-elevated/30 px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Published role baseline</p><h2 class="mt-1 text-xl font-semibold text-highlighted">{{ data.assignment.role.title }}</h2><p class="mt-2 text-sm leading-6 text-muted">{{ data.assignment.role.purpose }}</p></div>
          <div class="grid gap-px bg-default md:grid-cols-2"><div class="bg-elevated/10 p-5"><p class="text-xs font-semibold uppercase tracking-wide text-muted">Responsibilities</p><ul class="mt-3 space-y-2 text-sm text-highlighted"><li v-for="item in data.assignment.role.responsibilities" :key="item" class="flex gap-2"><UIcon name="i-lucide-dot" class="mt-0.5 size-4 shrink-0 text-primary" />{{ item }}</li></ul></div><div class="bg-elevated/10 p-5"><p class="text-xs font-semibold uppercase tracking-wide text-muted">Expected outcomes</p><ul class="mt-3 space-y-2 text-sm text-highlighted"><li v-for="item in data.assignment.role.expectedOutcomes" :key="item" class="flex gap-2"><UIcon name="i-lucide-dot" class="mt-0.5 size-4 shrink-0 text-primary" />{{ item }}</li></ul></div></div>
          <div v-if="data.assignment.role.kpis.length" class="border-t border-default p-5">
            <div class="flex items-center justify-between"><div><p class="text-xs font-semibold uppercase tracking-wide text-muted">Version-locked role KPIs</p><p class="mt-1 text-sm text-muted">KPI results come from the stated operational source, not your questionnaire opinion.</p></div><UBadge color="neutral" variant="subtle" :label="`${data.assignment.role.kpis.length} measures`" /></div>
            <div class="mt-4 grid gap-3 md:grid-cols-2">
              <div v-for="kpi in data.assignment.role.kpis" :key="kpi.id" class="rounded-lg border border-default bg-elevated/20 p-4">
                <div class="flex items-start justify-between gap-3"><p class="text-sm font-medium text-highlighted">{{ kpi.name }}</p><UBadge color="neutral" variant="outline" :label="`${kpi.weight}%`" /></div>
                <p v-if="kpi.description" class="mt-1 text-xs leading-5 text-muted">{{ kpi.description }}</p>
                <dl class="mt-3 grid grid-cols-2 gap-3 text-xs"><div><dt class="text-muted">Target</dt><dd class="mt-1 font-medium text-highlighted">{{ kpiTarget(kpi) }}</dd></div><div><dt class="text-muted">Cadence</dt><dd class="mt-1 font-medium capitalize text-highlighted">{{ kpi.cadence.replaceAll('_', ' ') }}</dd></div><div><dt class="text-muted">Source</dt><dd class="mt-1 font-medium capitalize text-highlighted">{{ kpi.sourceRef || kpi.sourceType.replaceAll('_', ' ') }}</dd></div><div v-if="kpi.departmentGoal"><dt class="text-muted">Department goal</dt><dd class="mt-1 font-medium text-highlighted">{{ kpi.departmentGoal }}</dd></div></dl>
                <div v-if="observationFor(kpi.id)?.observation_id" class="mt-4 border-t border-default pt-3">
                  <div class="flex items-center justify-between gap-2"><p class="text-xs font-semibold text-highlighted">Latest recorded result: {{ observationValue(observationFor(kpi.id)!) }}</p><UBadge :color="observationFor(kpi.id)?.evidence_status === 'verified' ? 'success' : observationFor(kpi.id)?.evidence_status === 'disputed' ? 'error' : 'warning'" variant="subtle" :label="observationFor(kpi.id)?.evidence_status || 'unverified'" /></div>
                  <p class="mt-1 text-xs text-muted">Evidence: {{ observationFor(kpi.id)?.observation_source_ref }} · {{ observationFor(kpi.id)?.period_start }} to {{ observationFor(kpi.id)?.period_end }}</p>
                  <UButton v-if="observationFor(kpi.id)?.evidence_status !== 'disputed'" class="mt-3" size="xs" color="neutral" variant="outline" icon="i-lucide-message-square-warning" label="Challenge this evidence" @click="disputeObservationId = observationFor(kpi.id)?.observation_id || null" />
                  <div v-if="disputeObservationId === observationFor(kpi.id)?.observation_id" class="mt-3 space-y-2"><UTextarea v-model="disputeNote" :rows="3" placeholder="Explain what is inaccurate or missing. This is recorded in the audit trail." class="w-full" /><div class="flex justify-end gap-2"><UButton size="xs" color="neutral" variant="ghost" label="Cancel" @click="disputeObservationId = null; disputeNote = ''" /><UButton size="xs" color="error" variant="soft" label="Submit challenge" :loading="saving" @click="disputeObservation(observationFor(kpi.id)!.observation_id!)" /></div></div>
                </div>
                <p v-else class="mt-4 border-t border-default pt-3 text-xs text-muted">No result has been recorded for this review yet.</p>
              </div>
            </div>
          </div>
        </section>

        <section v-if="mondayEvidence.length" class="overflow-hidden rounded-xl border border-default bg-default">
          <div class="flex flex-col gap-3 border-b border-default bg-elevated/30 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Disclosed operational evidence</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Your Monday work items</h2><p class="mt-2 max-w-3xl text-sm leading-6 text-muted">Only approved fields from work assigned to you are shown. These records provide context; they do not determine your review score.</p></div>
            <UBadge color="neutral" variant="subtle" :label="`${mondayEvidence.length} items`" />
          </div>
          <ul class="divide-y divide-default" aria-label="Disclosed Monday work evidence">
            <li v-for="item in mondayEvidence" :key="item.mondayItemId" class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ item.title }}</p><p class="mt-1 text-xs text-muted">{{ item.taskStatus || 'Status not disclosed' }}<span v-if="item.dueDate"> · due {{ item.dueDate }}</span></p></div>
              <UBadge v-if="item.isBlocked" color="warning" variant="subtle" icon="i-lucide-circle-alert" label="Blocked" />
            </li>
          </ul>
          <p v-if="mondayEvidenceNotice" class="border-t border-default bg-elevated/20 px-5 py-3 text-xs leading-5 text-muted">{{ mondayEvidenceNotice }}</p>
        </section>

        <section class="rounded-xl border border-default bg-default">
          <div class="flex items-center justify-between border-b border-default px-5 py-4"><div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Neutral questionnaire</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Your work context</h2></div><p class="font-mono text-sm text-muted">{{ answeredCount }}/{{ data.assignment.questions.length }}</p></div>
          <div class="divide-y divide-default">
            <div v-for="(question, index) in data.assignment.questions" :key="question.id" class="p-5 sm:p-6">
              <div class="flex gap-4"><span class="font-mono text-xs text-muted">{{ String(index + 1).padStart(2, '0') }}</span><div class="min-w-0 flex-1"><div class="flex flex-wrap items-start gap-2"><p class="text-sm font-medium leading-6 text-highlighted">{{ question.prompt }}</p><span v-if="!question.required" class="text-xs text-muted">Optional</span></div>
                <URadioGroup
                  v-if="question.type === 'single_choice'"
                  :model-value="typeof answers[question.id] === 'string' ? answers[question.id] as string : undefined"
                  :items="question.options"
                  :disabled="!data.assignment.canRespond"
                  class="mt-4"
                  @update:model-value="value => answers[question.id] = String(value || '')"
                />
                <div v-else-if="question.type === 'multiple_choice'" class="mt-4 space-y-2"><UCheckbox v-for="option in question.options" :key="option.value" :model-value="Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.value)" :label="option.label" :disabled="!data.assignment.canRespond" @update:model-value="value => toggleMultiple(question.id, option.value, value === true)" /></div>
                <UTextarea
                  v-else
                  :model-value="typeof answers[question.id] === 'string' ? answers[question.id] as string : ''"
                  :disabled="!data.assignment.canRespond"
                  :rows="5"
                  placeholder="Optional context for the reviewer"
                  class="mt-4 w-full"
                  @update:model-value="value => answers[question.id] = String(value || '')"
                />
                <p v-if="issues[question.id]" class="mt-3 text-sm text-error">{{ issues[question.id] }}</p>
              </div></div>
            </div>
          </div>
          <footer v-if="data.assignment.canRespond" class="flex flex-col-reverse gap-3 border-t border-default bg-elevated/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p class="text-xs text-muted">{{ requiredCount }} required questions · drafts remain private</p><div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-save" label="Save draft" :loading="saving" @click="save('draft')" /><UButton icon="i-lucide-send" label="Submit response" :loading="saving" @click="showSubmitConfirmation = true" /></div></footer>
        </section>
      </main>

      <UModal v-model:open="showSubmitConfirmation" title="Submit and lock response" description="Review what changes when you submit.">
        <template #content>
          <div class="overflow-hidden">
            <div class="border-b border-default bg-elevated/30 px-6 py-5"><p class="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-primary">Final participant action</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Submit and lock response</h2></div>
            <div class="space-y-4 p-6">
              <UAlert color="info" variant="soft" icon="i-lucide-shield-check" title="Your draft remains private" description="Until you submit, only you can see the answers. HR administrators and reviewers cannot read the draft." />
              <p class="text-sm leading-6 text-muted">After submission, your assigned reviewer and authorised HR owners can read the answers for this review. You cannot edit them unless an HR owner records a reason and formally reopens the response.</p>
              <p class="text-sm font-medium text-highlighted">You have answered {{ answeredCount }} of {{ data.assignment.questions.length }} questions.</p>
            </div>
            <div class="flex flex-col-reverse gap-2 border-t border-default p-4 sm:flex-row sm:justify-end"><UButton color="neutral" variant="ghost" label="Continue editing" @click="showSubmitConfirmation = false" /><UButton icon="i-lucide-lock-keyhole" label="Submit and lock response" :loading="saving" @click="save('submitted')" /></div>
          </div>
        </template>
      </UModal>
    </template>
  </div>
</template>
