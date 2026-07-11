<script setup lang="ts">
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'

definePageMeta({ title: 'HR Department Goals', middleware: ['auth'] })

type Department = { id: string; name: string }
type Owner = { id: string; name: string; email: string }
type Goal = {
  id: string; department_id: string; department_name: string; name: string; status: string; version: number;
  objective: string; metric_name: string; unit: string; direction: string;
  target_value: number | string | null; target_min: number | string | null; target_max: number | string | null;
  target_description: string | null; period_start: string; period_end: string;
  source_type: string; source_ref: string | null; accountable_owner_id: string | null; accountable_owner_name: string | null;
  linked_kpis: number | string;
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const showBuilder = ref(false)
const editingGoalId = ref<string | null>(null)
const expectedVersion = ref<number | null>(null)
const departments = ref<Department[]>([])
const owners = ref<Owner[]>([])
const goals = ref<Goal[]>([])

const dateOnly = (days: number) => { const value = new Date(); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10) }
const form = reactive({
  departmentId: '', name: '', objective: '', metricName: '', unit: '',
  direction: 'higher_is_better' as 'higher_is_better' | 'lower_is_better' | 'within_range' | 'milestone',
  targetValue: null as number | null, targetMin: null as number | null, targetMax: null as number | null,
  targetDescription: '', periodStart: dateOnly(0), periodEnd: dateOnly(90),
  sourceType: 'platform' as 'platform' | 'monday' | 'approved_report' | 'manual_verified' | 'other',
  sourceRef: '', accountableOwnerId: '', publish: true,
})

const departmentItems = computed(() => departments.value.map(item => ({ label: item.name, value: item.id })))
const ownerItems = computed(() => owners.value.map(item => ({ label: item.name, value: item.id })))
const startModel = computed({ get: () => parseDate(form.periodStart) as DateValue, set: value => { form.periodStart = value?.toString() || '' } })
const endModel = computed({ get: () => parseDate(form.periodEnd) as DateValue, set: value => { form.periodEnd = value?.toString() || '' } })
const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function displayDate(value: string) { const date = parseDate(value) as CalendarDate; return dateFormatter.format(new Date(date.year, date.month - 1, date.day)) }
function displayTarget(goal: Goal) {
  if (goal.direction === 'within_range') return `${goal.target_min}–${goal.target_max} ${goal.unit}`
  if (goal.direction === 'milestone') return goal.target_description || 'Milestone'
  return `${goal.target_value} ${goal.unit}`
}

async function refresh() {
  loading.value = true
  try {
    const data = await apiFetch<{ departments: Department[]; owners: Owner[]; goals: Goal[] }>('/api/agency/hr/goals')
    departments.value = data.departments; owners.value = data.owners; goals.value = data.goals
  } catch (error: any) { toast.add({ title: 'Department goals unavailable', description: error?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}
onMounted(() => void refresh())

function resetGoalForm() {
  Object.assign(form, {
    departmentId: '', name: '', objective: '', metricName: '', unit: '',
    direction: 'higher_is_better', targetValue: null, targetMin: null, targetMax: null,
    targetDescription: '', periodStart: dateOnly(0), periodEnd: dateOnly(90),
    sourceType: 'platform', sourceRef: '', accountableOwnerId: '', publish: true,
  })
}

function startNewGoal() {
  editingGoalId.value = null
  expectedVersion.value = null
  resetGoalForm()
  showBuilder.value = true
}

function reviseGoal(goal: Goal) {
  editingGoalId.value = goal.id
  expectedVersion.value = Number(goal.version)
  Object.assign(form, {
    departmentId: goal.department_id,
    name: goal.name,
    objective: goal.objective,
    metricName: goal.metric_name,
    unit: goal.unit,
    direction: goal.direction,
    targetValue: goal.target_value === null ? null : Number(goal.target_value),
    targetMin: goal.target_min === null ? null : Number(goal.target_min),
    targetMax: goal.target_max === null ? null : Number(goal.target_max),
    targetDescription: goal.target_description || '',
    periodStart: goal.period_start.slice(0, 10),
    periodEnd: goal.period_end.slice(0, 10),
    sourceType: goal.source_type,
    sourceRef: goal.source_ref || '',
    accountableOwnerId: goal.accountable_owner_id || '',
    publish: true,
  })
  showBuilder.value = true
}

async function createGoal() {
  if (!form.sourceRef.trim()) {
    toast.add({ title: 'Add the approved source reference', description: 'Every department goal needs a report, board or metric identifier that can be verified.', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const endpoint = editingGoalId.value
      ? `/api/agency/hr/goals/${editingGoalId.value}/versions`
      : '/api/agency/hr/goals'
    await apiFetch(endpoint, { method: 'POST', body: {
      ...form,
      ...(editingGoalId.value ? { expectedVersion: expectedVersion.value } : {}),
      targetValue: form.targetValue ?? undefined,
      targetMin: form.targetMin ?? undefined,
      targetMax: form.targetMax ?? undefined,
      targetDescription: form.targetDescription || undefined,
      sourceRef: form.sourceRef,
      accountableOwnerId: form.accountableOwnerId || undefined,
    } })
    toast.add({ title: editingGoalId.value ? 'New goal version saved' : 'Department goal published', description: 'Role KPIs can link to published versions with an explicit contribution rationale.', color: 'success' })
    showBuilder.value = false
    editingGoalId.value = null
    expectedVersion.value = null
    await refresh()
  } catch (error: any) { toast.add({ title: 'Goal could not be created', description: error?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-7xl px-5 py-8 sm:px-8"><div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div class="max-w-3xl border-l-4 border-primary pl-5"><p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Strategy → team outcome → role contribution</p><h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Department goal register</h1><p class="mt-3 text-sm leading-6 text-muted">Set time-bound, source-backed department outcomes. Individual role KPIs may contribute, but no employee inherits sole responsibility for a collective result.</p></div><div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /><UButton icon="i-lucide-goal" label="Set department goal" @click="startNewGoal" /></div></div></div></header>
    <main class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <div class="grid gap-7" :class="showBuilder ? 'xl:grid-cols-[minmax(0,1fr)_440px]' : ''">
        <section>
          <div class="mb-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Versioned outcomes</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Goal register</h2></div>
          <div v-if="loading" class="flex min-h-64 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
          <div v-else-if="goals.length" class="space-y-4">
            <article v-for="goal in goals" :key="goal.id" class="rounded-xl border border-default bg-default p-5">
              <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div class="flex flex-wrap items-center gap-2"><UBadge color="neutral" variant="subtle" :label="goal.department_name" /><UBadge :color="goal.status === 'active' ? 'success' : 'warning'" variant="outline" :label="`${goal.status} · v${goal.version}`" /></div><h3 class="mt-3 text-lg font-semibold text-highlighted">{{ goal.name }}</h3><p class="mt-2 max-w-3xl text-sm leading-6 text-muted">{{ goal.objective }}</p></div><div class="shrink-0 rounded-lg bg-primary/10 px-4 py-3 text-right"><p class="text-xs uppercase tracking-wide text-primary">{{ goal.metric_name }}</p><p class="mt-1 font-mono text-xl font-semibold text-highlighted">{{ displayTarget(goal) }}</p></div></div>
              <div class="mt-5 grid gap-px overflow-hidden rounded-lg border border-default sm:grid-cols-4"><div v-for="item in [{ label: 'Period', value: `${displayDate(goal.period_start)} – ${displayDate(goal.period_end)}` }, { label: 'Source', value: goal.source_ref || goal.source_type }, { label: 'Accountable owner', value: goal.accountable_owner_name || 'Not assigned' }, { label: 'Linked role KPIs', value: String(goal.linked_kpis) }]" :key="item.label" class="bg-elevated/30 p-3"><p class="text-[11px] uppercase tracking-wide text-muted">{{ item.label }}</p><p class="mt-1 text-sm text-highlighted">{{ item.value }}</p></div></div>
              <div class="mt-4 flex justify-end"><UButton color="neutral" variant="outline" icon="i-lucide-git-branch-plus" label="Revise goal" @click="reviseGoal(goal)" /></div>
            </article>
          </div>
          <div v-else class="rounded-xl border border-dashed border-default px-6 py-14 text-center"><UIcon name="i-lucide-goal" class="mx-auto size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No department goals published</p><p class="mt-1 text-sm text-muted">Define the collective outcome before cascading contribution measures into role KPIs.</p></div>
        </section>
      <aside v-if="showBuilder" class="xl:sticky xl:top-6 xl:self-start"><div class="overflow-hidden rounded-xl border border-default bg-default"><div class="border-b border-default bg-elevated/30 px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">New goal version</p><h2 class="mt-1 text-lg font-semibold text-highlighted">Define collective outcome</h2></div><div class="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5"><UFormField label="Department" required><USelectMenu v-model="form.departmentId" :items="departmentItems" value-key="value" class="w-full" /></UFormField><UFormField label="Goal name" required><UInput v-model="form.name" class="w-full" /></UFormField><UFormField label="Objective" required><UTextarea v-model="form.objective" :rows="4" class="w-full" /></UFormField><div class="grid gap-3 sm:grid-cols-2"><UFormField label="Metric" required><UInput v-model="form.metricName" class="w-full" /></UFormField><UFormField label="Unit" required><UInput v-model="form.unit" placeholder="%, $, days, count" class="w-full" /></UFormField></div><UFormField label="Direction" required><USelectMenu v-model="form.direction" :items="[{ label: 'Higher is better', value: 'higher_is_better' }, { label: 'Lower is better', value: 'lower_is_better' }, { label: 'Within range', value: 'within_range' }, { label: 'Milestone', value: 'milestone' }]" value-key="value" class="w-full" /></UFormField><div v-if="form.direction === 'within_range'" class="grid gap-3 sm:grid-cols-2"><UFormField label="Minimum" required><UInput v-model.number="form.targetMin" type="number" class="w-full" /></UFormField><UFormField label="Maximum" required><UInput v-model.number="form.targetMax" type="number" class="w-full" /></UFormField></div><UFormField v-else-if="form.direction === 'milestone'" label="Milestone condition" required><UInput v-model="form.targetDescription" class="w-full" /></UFormField><UFormField v-else label="Target" required><UInput v-model.number="form.targetValue" type="number" class="w-full" /></UFormField><div class="grid gap-3 sm:grid-cols-2"><UFormField label="Starts" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar" :label="displayDate(form.periodStart)" class="w-full justify-start" /><template #content><UCalendar v-model="startModel" class="p-2" /></template></UPopover></UFormField><UFormField label="Ends" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-check" :label="displayDate(form.periodEnd)" class="w-full justify-start" /><template #content><UCalendar v-model="endModel" class="p-2" /></template></UPopover></UFormField></div><UFormField label="Approved source" required><USelectMenu v-model="form.sourceType" :items="[{ label: 'Platform data', value: 'platform' }, { label: 'Monday.com', value: 'monday' }, { label: 'Approved report', value: 'approved_report' }, { label: 'Manual + verified', value: 'manual_verified' }, { label: 'Other', value: 'other' }]" value-key="value" class="w-full" /></UFormField><UFormField label="Source reference"><UInput v-model="form.sourceRef" class="w-full" /></UFormField><UFormField label="Accountable owner"><USelectMenu v-model="form.accountableOwnerId" :items="ownerItems" value-key="value" class="w-full" /></UFormField><UCheckbox v-model="form.publish" label="Publish this goal version" /></div><div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showBuilder = false" /><UButton icon="i-lucide-goal" label="Create goal" :loading="saving" @click="createGoal" /></div></div></aside></div></main>
  </div>
</template>
