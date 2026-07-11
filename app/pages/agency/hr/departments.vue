<script setup lang="ts">
definePageMeta({ title: 'HR Department Mapping', middleware: ['auth'] })

type Department = { id: string; name: string; description: string | null; color: string; member_count: number }
type Member = { id: string; name: string; email: string; department_id: string | null; department_name: string | null }

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const savingMemberId = ref<string | null>(null)
const departments = ref<Department[]>([])
const members = ref<Member[]>([])
const search = ref('')

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
      <section class="grid gap-px overflow-hidden rounded-xl border border-default bg-default sm:grid-cols-3">
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ departments.length }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">governed departments</p></div>
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ mappedCount }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">people mapped</p></div>
        <div class="bg-elevated/30 p-4"><p class="font-mono text-2xl font-semibold text-highlighted">{{ Math.max(0, members.length - mappedCount) }}</p><p class="mt-1 text-xs uppercase tracking-wide text-muted">mapping required</p></div>
      </section>

      <section class="mt-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-default bg-default">
        <div class="flex flex-col gap-3 border-b border-default p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 class="font-semibold text-highlighted">Primary organisational department</h2><p class="mt-1 text-xs text-muted">Every change is owner-only and recorded in the HR audit ledger.</p></div>
          <UInput v-model="search" icon="i-lucide-search" placeholder="Search people or departments" aria-label="Search people or departments" class="w-full sm:max-w-sm" />
        </div>

        <div v-if="loading" class="flex min-h-64 items-center justify-center" aria-busy="true"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
        <div v-else-if="filteredMembers.length" class="min-h-0 flex-1 divide-y divide-default overflow-y-auto overscroll-contain">
          <article v-for="member in filteredMembers" :key="member.id" class="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,360px)] md:items-center">
            <div class="min-w-0"><p class="truncate text-sm font-medium text-highlighted">{{ member.name }}</p><p class="truncate text-xs text-muted">{{ member.email }}</p></div>
            <USelectMenu :model-value="member.department_id || undefined" :items="departmentItems" value-key="value" placeholder="Choose primary department" :loading="savingMemberId === member.id" :disabled="savingMemberId !== null" class="w-full" @update:model-value="value => assignDepartment(member, String(value || ''))" />
          </article>
        </div>
        <div v-else class="flex min-h-64 flex-col items-center justify-center p-8 text-center" role="status"><UIcon name="i-lucide-users" class="size-8 text-muted" /><p class="mt-3 font-medium text-highlighted">No matching active team members</p><p class="mt-1 text-sm text-muted">Clear the search or check the team directory.</p></div>
      </section>

      <UAlert class="mt-5" color="info" variant="soft" icon="i-lucide-info" title="No performance inference" description="Department mapping controls questionnaire routing and aggregated reporting. It does not score a person, infer contribution, or change their Monday board access." />
    </main>
  </div>
</template>
