<script setup lang="ts">
definePageMeta({ title: 'HR Department Mapping', middleware: ['auth'] })

type Department = { id: string; name: string; description: string | null; color: string; member_count: number }
type Classification = 'person' | 'shared_account' | 'service_account' | 'test_account' | 'external_contact'
type Member = {
  id: string; name: string; email: string; current_role: string | null;
  department_id: string | null; department_name: string | null;
  classification: Classification | null; person_type: 'employee' | 'contractor' | 'other' | null;
  review_eligible: boolean | null; classification_reason: string | null; confirmed_at: string | null;
  suggestion: { suggestedClassification: Classification; reviewEligible: boolean | null; reason: string };
}

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const savingMemberId = ref<string | null>(null)
const departments = ref<Department[]>([])
const members = ref<Member[]>([])
const search = ref('')
const selectedMember = ref<Member | null>(null)
const savingClassification = ref(false)
const classificationForm = reactive({ classification: 'person' as Classification, personType: '', reviewEligible: false, reason: '' })

const departmentItems = computed(() => departments.value.map(department => ({
  label: department.name,
  value: department.id,
})))
const filteredMembers = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) return members.value
  return members.value.filter(member => `${member.name} ${member.email} ${member.department_name || ''}`.toLowerCase().includes(term))
})
const mappedCount = computed(() => members.value.filter(member => member.department_id && member.department_name).length)
const classifiedCount = computed(() => members.value.filter(member => member.classification).length)
const eligibleCount = computed(() => members.value.filter(member => member.review_eligible === true).length)
const classificationItems = [
  { label: 'Person', value: 'person' }, { label: 'Shared account', value: 'shared_account' },
  { label: 'Service / integration', value: 'service_account' }, { label: 'Test account', value: 'test_account' },
  { label: 'External contact', value: 'external_contact' },
]
const personTypeItems = [{ label: 'Employee', value: 'employee' }, { label: 'Contractor', value: 'contractor' }, { label: 'Other person', value: 'other' }]

async function refresh() {
  loading.value = true
  try {
    const data = await apiFetch<{ departments: Department[]; members: Member[] }>('/api/agency/hr/organizational-departments')
    departments.value = data.departments
    members.value = data.members
  } catch (error: any) {
    toast.add({ title: 'Department mapping unavailable', description: error?.data?.statusMessage, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function assignDepartment(member: Member, departmentId: string) {
  if (!departmentId || departmentId === member.department_id) return
  savingMemberId.value = member.id
  try {
    const response = await apiFetch<{ assignment: { departmentId: string; departmentName: string; changed: boolean } }>(`/api/agency/hr/organizational-departments/assignments/${member.id}`, {
      method: 'PATCH',
      body: { departmentId },
    })
    member.department_id = response.assignment.departmentId
    member.department_name = response.assignment.departmentName
    toast.add({ title: `${member.name} mapped to ${response.assignment.departmentName}`, description: 'This changes the HR primary department only; Monday board memberships are unchanged.', color: 'success' })
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not map department', description: error?.data?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    savingMemberId.value = null
  }
}

function reviewClassification(member: Member) {
  selectedMember.value = member
  classificationForm.classification = member.classification || member.suggestion.suggestedClassification
  classificationForm.personType = member.person_type || ''
  classificationForm.reviewEligible = member.review_eligible ?? false
  classificationForm.reason = member.classification_reason || member.suggestion.reason
}

async function saveClassification() {
  if (!selectedMember.value) return
  if (classificationForm.classification === 'person' && !classificationForm.personType) {
    toast.add({ title: 'Choose employee, contractor, or other person', color: 'warning' })
    return
  }
  savingClassification.value = true
  try {
    await apiFetch(`/api/agency/hr/organizational-departments/classifications/${selectedMember.value.id}`, {
      method: 'PATCH',
      body: {
        classification: classificationForm.classification,
        personType: classificationForm.classification === 'person' ? classificationForm.personType : null,
        reviewEligible: classificationForm.classification === 'person' && classificationForm.reviewEligible,
        reason: classificationForm.reason,
      },
    })
    toast.add({ title: `${selectedMember.value.name} classification confirmed`, description: 'The decision is recorded in the HR audit ledger.', color: 'success' })
    selectedMember.value = null
    await refresh()
  } catch (error: any) {
    toast.add({ title: 'Could not classify roster record', description: error?.data?.statusMessage || 'Review the classification and reason.', color: 'error' })
  } finally { savingClassification.value = false }
}

onMounted(() => void refresh())
</script>

<template>
  <div class="flex min-h-full flex-col bg-default">
    <header class="border-b border-default bg-elevated/30">
      <div class="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div class="max-w-3xl border-l-4 border-primary pl-5">
          <p class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">People structure ≠ workspaces</p>
          <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">Organisational department mapping</h1>
          <p class="mt-3 text-sm leading-6 text-muted">Assign each active team member one primary HR department. Imported Monday boards remain operational workspaces and cannot be selected here.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="Role library" to="/agency/hr/roles" />
          <UButton color="neutral" variant="outline" icon="i-lucide-shield-check" label="Launch readiness" to="/agency/hr/governance" />
        </div>
      </div>
    </header>

    <main class="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col px-5 py-8 sm:px-8">
      <section class="grid gap-px overflow-hidden rounded-xl border border-default bg-default sm:grid-cols-4">
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ departments.length }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">governed departments</p></div>
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ mappedCount }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">people mapped</p></div>
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ classifiedCount }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">identities confirmed</p></div>
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ eligibleCount }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">review eligible</p></div>
      </section>

      <section class="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-default bg-default">
        <div class="flex flex-col gap-3 border-b border-default p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 class="font-semibold text-highlighted">Primary organisational department</h2><p class="mt-1 text-xs text-muted">Every change is owner-only and recorded in the HR audit ledger.</p></div>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search people or departments" aria-label="Search people or departments" class="w-full sm:max-w-sm" />
        </div>

        <div v-if="loading" class="flex min-h-64 items-center justify-center" aria-busy="true"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
        <div v-else-if="filteredMembers.length" class="min-h-0 flex-1 divide-y divide-default overflow-y-auto overscroll-contain">
          <article v-for="member in filteredMembers" :key="member.id" class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(230px,310px)_minmax(190px,240px)] lg:items-center">
            <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><p class="truncate text-sm font-medium text-highlighted">{{ member.name }}</p><UBadge :color="member.classification ? (member.review_eligible ? 'success' : 'neutral') : 'warning'" variant="subtle" :label="member.classification ? (member.review_eligible ? 'Review eligible' : member.classification.replaceAll('_', ' ')) : 'Identity review required'" /></div><p class="truncate text-xs text-muted">{{ member.email }}</p><p v-if="!member.classification" class="mt-1 text-xs text-muted">Suggestion: {{ member.suggestion.reason }}</p></div>
            <USelectMenu :model-value="member.department_id || undefined" :items="departmentItems" value-key="value" placeholder="Choose primary department" :loading="savingMemberId === member.id" :disabled="savingMemberId !== null" class="w-full" @update:model-value="value => assignDepartment(member, String(value || ''))" />
            <UButton color="neutral" variant="outline" icon="i-lucide-user-round-check" :label="member.classification ? 'Review classification' : 'Classify record'" @click="reviewClassification(member)" />
          </article>
        </div>
        <div v-else class="flex min-h-64 flex-col items-center justify-center p-8 text-center" role="status"><UIcon name="i-lucide-users" class="size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No matching active team members</p><p class="mt-1 text-sm text-muted">Clear the search or check the team directory.</p></div>
      </section>

      <UAlert class="mt-5" color="info" variant="soft" icon="i-lucide-info" title="No performance inference" description="Department mapping controls questionnaire routing and aggregated reporting. It does not score a person, infer contribution, or change their Monday board access." />
    </main>

    <USlideover :open="Boolean(selectedMember)" title="Confirm roster identity" description="Suggestions are advisory. An owner must confirm whether this record represents a person and may enter an HR review." @update:open="open => { if (!open) selectedMember = null }">
      <template #body><div v-if="selectedMember" class="space-y-5">
        <div class="rounded-lg border border-default bg-elevated/30 p-4"><p class="font-medium text-highlighted">{{ selectedMember.name }}</p><p class="mt-1 text-sm text-muted">{{ selectedMember.email }}</p><p class="mt-3 text-xs leading-5 text-muted">System suggestion: {{ selectedMember.suggestion.reason }}</p></div>
        <UFormField label="Identity classification" required><USelectMenu v-model="classificationForm.classification" :items="classificationItems" value-key="value" class="w-full" /></UFormField>
        <UFormField v-if="classificationForm.classification === 'person'" label="Person type" required><USelectMenu v-model="classificationForm.personType" :items="personTypeItems" value-key="value" placeholder="Choose employment relationship" class="w-full" /></UFormField>
        <label v-if="classificationForm.classification === 'person'" class="flex gap-3 rounded-lg border border-default p-4"><UCheckbox v-model="classificationForm.reviewEligible" class="mt-0.5" /><span><span class="block text-sm font-medium text-highlighted">Eligible for governed HR review</span><span class="mt-1 block text-sm text-muted">This permits role assignment and pilot inclusion after all other gates pass.</span></span></label>
        <UFormField label="Decision reason" required help="Record why this is a person, shared account, service identity, test record, or external contact."><UTextarea v-model="classificationForm.reason" :rows="4" class="w-full" /></UFormField>
        <UAlert color="warning" variant="soft" icon="i-lucide-shield-alert" title="No automatic enrolment" description="Confirming eligibility does not assign a role, send a questionnaire, or start a review." />
      </div></template>
      <template #footer><div class="flex w-full justify-end gap-2"><UButton color="neutral" variant="ghost" label="Cancel" @click="selectedMember = null" /><UButton icon="i-lucide-shield-check" label="Record decision" :loading="savingClassification" @click="saveClassification" /></div></template>
    </USlideover>
  </div>
</template>
