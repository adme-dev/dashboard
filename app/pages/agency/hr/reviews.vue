<script setup lang="ts">
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'

definePageMeta({
  title: 'HR Review Cycles',
  middleware: ['auth'],
})

type Cycle = {
  id: string
  name: string
  purpose: string
  status: string
  timezone: string
  opens_at: string
  due_at: string
  closes_at: string
  participant_count: number
  submitted_count: number
  overdue_count: number
}

type TeamMember = { id: string; name: string; email: string; role?: string; department?: string }
type Role = { id: string; version_id: string; title: string; department: string | null; status: string; version_status: string; version: number }
type Participant = {
  id: string
  cycle_id: string
  status: string
  member_name: string
  member_email: string
  role_title: string | null
  assignment_id: string
  response_status: string | null
  role_score: number | string | null
  evidence_coverage: number | string | null
  confidence: string | null
  score_published_at: string | null
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const showBuilder = ref(false)
const cycles = ref<Cycle[]>([])
const participants = ref<Participant[]>([])
const team = ref<TeamMember[]>([])
const roles = ref<Role[]>([])
const selectedRoles = ref<Record<string, string>>({})

function dateOnly(offsetDays: number): string {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

const form = reactive({
  name: '',
  opensDate: dateOnly(3),
  dueDate: dateOnly(14),
  closesDate: dateOnly(21),
})

function toCalendarDate(value: string): DateValue | null {
  try { return parseDate(value) } catch { return null }
}
const opensDateModel = computed({ get: () => toCalendarDate(form.opensDate), set: value => { form.opensDate = value?.toString() || '' } })
const dueDateModel = computed({ get: () => toCalendarDate(form.dueDate), set: value => { form.dueDate = value?.toString() || '' } })
const closesDateModel = computed({ get: () => toCalendarDate(form.closesDate), set: value => { form.closesDate = value?.toString() || '' } })
const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function displayDate(value: string): string {
  const date = toCalendarDate(value) as CalendarDate | null
  return date ? dateFormatter.format(new Date(date.year, date.month - 1, date.day)) : 'Choose date'
}
function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

const roleItems = computed(() => roles.value.filter(role => role.status === 'active' && role.version_status === 'published').map(role => ({
  label: `${role.title} · v${role.version}`,
  value: role.version_id,
})))
const selectedCount = computed(() => Object.values(selectedRoles.value).filter(Boolean).length)
const participantsByCycle = computed(() => participants.value.reduce<Record<string, Participant[]>>((grouped, participant) => {
  grouped[participant.cycle_id] ||= []
  grouped[participant.cycle_id].push(participant)
  return grouped
}, {}))

async function refresh() {
  loading.value = true
  try {
    const [cycleData, teamData, roleData] = await Promise.all([
      apiFetch<{ cycles: Cycle[]; participants: Participant[] }>('/api/agency/hr/reviews'),
      apiFetch<{ members: TeamMember[] }>('/api/agency/team-members'),
      apiFetch<{ roles: Role[] }>('/api/agency/hr/roles'),
    ])
    cycles.value = cycleData.cycles
    participants.value = cycleData.participants
    team.value = teamData.members
    roles.value = roleData.roles
  } catch (error: any) {
    toast.add({ title: 'Review cycles unavailable', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}
onMounted(() => void refresh())

function toggleMember(memberId: string, checked: boolean) {
  if (checked) selectedRoles.value[memberId] = roleItems.value[0]?.value || ''
  else delete selectedRoles.value[memberId]
}

function isoAt(value: string, hour: number): string {
  return new Date(`${value}T${String(hour).padStart(2, '0')}:00:00`).toISOString()
}

async function createCycle() {
  const participants = Object.entries(selectedRoles.value)
    .filter(([, roleProfileVersionId]) => Boolean(roleProfileVersionId))
    .map(([teamMemberId, roleProfileVersionId]) => ({ teamMemberId, roleProfileVersionId }))
  if (!form.name.trim() || participants.length === 0) {
    toast.add({ title: 'Cycle name and participants are required', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const response = await apiFetch<{ assignmentCount: number; deliveryFailures: number }>('/api/agency/hr/reviews', {
      method: 'POST',
      body: {
        name: form.name,
        purpose: 'business_review',
        timezone: 'Australia/Melbourne',
        opensAt: isoAt(form.opensDate, 9),
        dueAt: isoAt(form.dueDate, 17),
        closesAt: isoAt(form.closesDate, 17),
        participants,
      },
    })
    toast.add({
      title: `Review assigned to ${response.assignmentCount} people`,
      description: response.deliveryFailures
        ? `${response.deliveryFailures} notification deliveries need attention.`
        : 'In-app notifications, email and calendar reminders were prepared.',
      color: response.deliveryFailures ? 'warning' : 'success',
    })
    form.name = ''
    selectedRoles.value = {}
    showBuilder.value = false
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not open review cycle', description: error?.data?.statusMessage || 'Check the schedule and role assignments.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="min-h-full bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div class="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div class="max-w-3xl border-l-4 border-primary pl-5">
            <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">Notify → respond → interview → review</p>
            <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Business review cycles</h1>
            <p class="mt-3 text-sm leading-6 text-muted">Every participant must be bound to a published role version before the system can assign the corresponding neutral questionnaire.</p>
          </div>
          <div class="flex gap-2"><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Review hub" to="/agency/hr" /><UButton icon="i-lucide-calendar-plus" label="New cycle" :disabled="roles.length === 0" @click="showBuilder = !showBuilder" /></div>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <UAlert v-if="!loading && roles.length === 0" class="mb-6" color="warning" variant="soft" icon="i-lucide-badge-alert" title="Publish a role profile first" description="A cycle cannot be opened until at least one role has responsibilities, outcomes, a questionnaire and a benchmark scorecard." :actions="[{ label: 'Open role library', to: '/agency/hr/roles' }]" />

      <div class="grid gap-7" :class="showBuilder ? 'xl:grid-cols-[minmax(0,1fr)_480px]' : ''">
        <section>
          <div class="mb-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Controlled timeline</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Cycle register</h2></div>
          <div v-if="loading" class="flex min-h-64 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
          <div v-else-if="cycles.length" class="space-y-4">
            <article v-for="cycle in cycles" :key="cycle.id" class="rounded-xl border border-default bg-default p-5">
              <div class="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div><div class="flex flex-wrap items-center gap-2"><h3 class="text-lg font-semibold text-highlighted">{{ cycle.name }}</h3><UBadge :color="cycle.status === 'open' ? 'success' : cycle.status === 'scheduled' ? 'warning' : 'neutral'" variant="subtle" :label="cycle.status" /></div><p class="mt-2 text-sm text-muted">Opens {{ formatTimestamp(cycle.opens_at) }} · due {{ formatTimestamp(cycle.due_at) }} · closes {{ formatTimestamp(cycle.closes_at) }}</p></div>
                <div class="flex gap-5 text-center"><div><p class="font-mono text-xl font-semibold text-highlighted">{{ cycle.submitted_count }}/{{ cycle.participant_count }}</p><p class="text-[11px] uppercase tracking-wide text-muted">submitted</p></div><div><p class="font-mono text-xl font-semibold" :class="cycle.overdue_count ? 'text-error' : 'text-highlighted'">{{ cycle.overdue_count }}</p><p class="text-[11px] uppercase tracking-wide text-muted">overdue</p></div></div>
              </div>
              <div class="mt-5 h-1.5 overflow-hidden rounded-full bg-accented"><div class="h-full bg-primary" :style="{ width: `${cycle.participant_count ? (cycle.submitted_count / cycle.participant_count) * 100 : 0}%` }" /></div>
              <div v-if="participantsByCycle[cycle.id]?.length" class="mt-5 divide-y divide-default border-t border-default">
                <div v-for="participant in participantsByCycle[cycle.id]" :key="participant.id" class="flex flex-col gap-3 py-3 first:pt-4 last:pb-0 sm:flex-row sm:items-center">
                  <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><p class="truncate text-sm font-medium text-highlighted">{{ participant.member_name }}</p><UBadge :color="participant.response_status === 'submitted' ? 'success' : 'neutral'" variant="subtle" :label="participant.response_status || 'not started'" /></div><p class="mt-1 truncate text-xs text-muted">{{ participant.role_title || 'Role not resolved' }}</p></div>
                  <div v-if="participant.role_score" class="text-left sm:text-right"><p class="font-mono text-sm font-semibold text-highlighted">{{ Number(participant.role_score).toFixed(2) }} / 5</p><p class="text-[11px] uppercase tracking-wide text-muted">{{ participant.evidence_coverage }}% evidence</p></div>
                  <div class="flex gap-2"><UButton v-if="participant.assignment_id" color="neutral" variant="ghost" size="sm" label="Response" :to="`/agency/hr/assignments/${participant.assignment_id}`" /><UButton color="neutral" variant="outline" size="sm" :label="participant.role_score ? 'Review score' : 'Scorecard'" :to="`/agency/hr/reviews/participants/${participant.id}`" /></div>
                </div>
              </div>
            </article>
          </div>
          <div v-else class="rounded-xl border border-dashed border-default px-6 py-14 text-center"><UIcon name="i-lucide-calendar-range" class="mx-auto size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No review cycles yet</p><p class="mt-1 text-sm text-muted">Choose required dates and bind each participant to their agreed role.</p></div>
        </section>

        <aside v-if="showBuilder" class="xl:sticky xl:top-6 xl:self-start">
          <div class="overflow-hidden rounded-xl border border-default bg-default">
            <div class="border-b border-default bg-elevated/30 px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">New controlled cycle</p><h2 class="mt-1 text-lg font-semibold text-highlighted">Assignment register</h2></div>
            <div class="max-h-[calc(100vh-190px)] space-y-5 overflow-y-auto p-5">
              <UFormField label="Cycle name" required><UInput v-model="form.name" placeholder="e.g. FY27 whole-business review" class="w-full" /></UFormField>
              <div class="grid gap-4 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                <UFormField label="Opens" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar" :label="displayDate(form.opensDate)" class="w-full justify-start" /><template #content><UCalendar v-model="opensDateModel" class="p-2" /></template></UPopover></UFormField>
                <UFormField label="Required by" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-check" :label="displayDate(form.dueDate)" class="w-full justify-start" /><template #content><UCalendar v-model="dueDateModel" class="p-2" /></template></UPopover></UFormField>
                <UFormField label="Closes" required><UPopover><UButton color="neutral" variant="outline" icon="i-lucide-calendar-x" :label="displayDate(form.closesDate)" class="w-full justify-start" /><template #content><UCalendar v-model="closesDateModel" class="p-2" /></template></UPopover></UFormField>
              </div>

              <div>
                <div class="mb-3 flex items-center justify-between"><p class="text-sm font-medium text-highlighted">Participants and role baseline</p><UBadge color="neutral" variant="subtle" :label="`${selectedCount} selected`" /></div>
                <div class="divide-y divide-default overflow-hidden rounded-lg border border-default">
                  <div v-for="member in team" :key="member.id" class="p-3">
                    <div class="flex gap-3"><UCheckbox :model-value="member.id in selectedRoles" class="mt-1" @update:model-value="value => toggleMember(member.id, Boolean(value))" /><div class="min-w-0 flex-1"><p class="truncate text-sm font-medium text-highlighted">{{ member.name }}</p><p class="truncate text-xs text-muted">{{ member.department || member.role || member.email }}</p></div></div>
                    <USelectMenu v-if="member.id in selectedRoles" v-model="selectedRoles[member.id]" :items="roleItems" value-key="value" placeholder="Select published role" class="mt-3 w-full" />
                  </div>
                </div>
              </div>

              <UAlert color="info" variant="soft" icon="i-lucide-send" title="Opening the cycle sends the assignments" description="Each participant receives an in-app notice, an email and a calendar deadline. The invite contains no answers or private content." />
            </div>
            <div class="flex justify-end gap-2 border-t border-default p-4"><UButton color="neutral" variant="ghost" label="Cancel" @click="showBuilder = false" /><UButton icon="i-lucide-send" :label="`Open for ${selectedCount} people`" :disabled="selectedCount === 0" :loading="saving" @click="createCycle" /></div>
          </div>
        </aside>
      </div>
    </main>
  </div>
</template>
