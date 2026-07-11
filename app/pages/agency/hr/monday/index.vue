<script setup lang="ts">
definePageMeta({ title: 'Monday Evidence Scope', middleware: ['auth'] })

type Board = { id: string; name: string; workspaceId: string; workspaceName: string; itemsCount?: number }
type Department = { id: string; name: string }
type Scope = { id: string; board_ids: string[]; destination_mappings: Array<{ boardId: string; departmentId: string }>; allowed_fields: string[]; purpose: string; period_start: string; period_end: string; retention_days: number; status: string; created_at: string }
type Readiness = { connection: null | { accountId: string | null; accountName: string | null; authMethod: 'oauth' | 'token'; source: 'database' | 'environment'; requestedPermissions: string[] } }
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>
const loading = ref(true)
const saving = ref(false)
const scopes = ref<Scope[]>([])
const boards = ref<Board[]>([])
const departments = ref<Department[]>([])
const readiness = ref<Readiness>({ connection: null })
const selectedBoards = ref<string[]>([])
const destinationByBoard = reactive<Record<string, string>>({})
const departmentItems = computed(() => departments.value.map(department => ({ label: department.name, value: department.id })))
const form = reactive({ allowedFields: 'name\nstatus\ndue_date\nassignee\nupdates', purpose: 'Understand approved workflow ownership, handoffs, delays and blockers for the business review.', exclusions: 'Private messages\nPersonal or non-work content\nCommunication volume or sentiment', periodStart: new Date(new Date().getFullYear(), new Date().getMonth() - 3, 1).toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), retentionDays: 365 })

function lines(value: string) { return value.split('\n').map(item => item.trim()).filter(Boolean) }
async function load() {
  loading.value = true
  try {
    const [scopeData, workspaceData, departmentData, readinessData] = await Promise.all([
      apiFetch<{ scopes: Scope[]; connected: boolean }>('/api/agency/hr/monday/scopes'),
      apiFetch<{ workspaces: Array<{ id: string; name: string; boards: Array<{ id: string; name: string; itemsCount?: number }> }> }>('/api/agency/monday/workspaces'),
      apiFetch<{ departments: Department[] }>('/api/agency/departments'),
      apiFetch<Readiness>('/api/agency/hr/monday/readiness'),
    ])
    scopes.value = scopeData.scopes
    boards.value = workspaceData.workspaces.flatMap(workspace => workspace.boards.map(board => ({ ...board, workspaceId: workspace.id, workspaceName: workspace.name })))
    departments.value = departmentData.departments
    readiness.value = readinessData
  } catch (error: any) { toast.add({ title: 'Monday scope unavailable', description: error?.data?.statusMessage, color: 'error' }) }
  finally { loading.value = false }
}
onMounted(() => void load())
async function save(status: 'draft' | 'approved') {
  if (!selectedBoards.value.length || !form.allowedFields.trim()) { toast.add({ title: 'Select boards and fields', description: 'An approved scope must contain an explicit board and field allowlist.', color: 'warning' }); return }
  if (status === 'approved' && selectedBoards.value.some(boardId => !destinationByBoard[boardId])) { toast.add({ title: 'Choose every board destination', description: 'Each approved board must have an internal department where its tasks will land.', color: 'warning' }); return }
  saving.value = true
  try {
    await apiFetch('/api/agency/hr/monday/scopes', { method: 'POST', body: { boardIds: selectedBoards.value, destinationMappings: selectedBoards.value.filter(boardId => destinationByBoard[boardId]).map(boardId => ({ boardId, departmentId: destinationByBoard[boardId] })), workspaceIds: [...new Set(boards.value.filter(board => selectedBoards.value.includes(board.id)).map(board => board.workspaceId))], allowedFields: lines(form.allowedFields), purpose: form.purpose, exclusions: lines(form.exclusions), periodStart: form.periodStart, periodEnd: form.periodEnd, retentionDays: form.retentionDays, status } })
    toast.add({ title: status === 'approved' ? 'Monday evidence scope approved' : 'Scope draft saved', description: status === 'approved' ? 'No import runs until an adapter explicitly consumes this approved scope.' : 'The scope remains inactive.', color: 'success' })
    await load()
  } catch (error: any) { toast.add({ title: 'Scope could not be saved', description: error?.data?.statusMessage, color: 'error' }) }
  finally { saving.value = false }
}
async function revoke(id: string) { await apiFetch(`/api/agency/hr/monday/scopes/${id}`, { method: 'DELETE' }); await load() }
</script>

<template>
  <main class="h-full min-h-0 overflow-y-auto bg-default">
    <header class="border-b border-default bg-elevated/30"><div class="mx-auto max-w-7xl px-5 py-8 sm:px-8"><p class="font-mono text-xs uppercase tracking-[0.18em] text-primary">Evidence governance</p><h1 class="mt-2 text-3xl font-semibold text-highlighted">Monday evidence scope</h1><p class="mt-3 max-w-3xl text-sm leading-6 text-muted">Choose the exact boards, destinations, fields, dates and purpose that an HR evidence adapter may use. This approval does not authorise surveillance.</p></div></header>
    <section class="mx-auto grid max-w-7xl gap-7 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div>
        <div class="mb-4 flex items-center justify-between"><div><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Board allowlist</p><h2 class="mt-1 text-xl font-semibold text-highlighted">Available boards</h2></div><UButton color="neutral" variant="outline" icon="i-lucide-arrow-left" label="HR hub" to="/agency/hr" /></div>
        <div v-if="loading" class="flex min-h-48 items-center justify-center"><UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-primary" /></div>
        <div v-else-if="boards.length" class="grid gap-3 sm:grid-cols-2"><label v-for="board in boards" :key="board.id" class="flex cursor-pointer gap-3 rounded-xl border border-default bg-default p-4"><UCheckbox v-model="selectedBoards" :value="board.id" /><span><span class="block font-medium text-highlighted">{{ board.name }}</span><span class="mt-1 block text-xs text-muted">{{ board.workspaceName }} · {{ board.itemsCount ?? 0 }} items</span></span></label></div>
        <UAlert v-else color="warning" variant="soft" icon="i-lucide-plug-zap" title="No Monday boards available" description="Connect Monday or refresh the existing Monday connection before creating a scope." />
        <div class="mt-8"><p class="font-mono text-xs uppercase tracking-[0.16em] text-muted">Scope history</p><div v-if="scopes.length" class="mt-3 space-y-3"><article v-for="scope in scopes" :key="scope.id" class="rounded-xl border border-default bg-default p-4"><div class="flex items-center justify-between gap-3"><p class="font-medium text-highlighted">{{ scope.purpose }}</p><UBadge :color="scope.status === 'approved' ? 'success' : scope.status === 'revoked' ? 'error' : 'warning'" variant="subtle" :label="scope.status" /></div><p class="mt-2 text-xs text-muted">{{ scope.period_start }} to {{ scope.period_end }} · {{ scope.board_ids.length }} boards · {{ scope.destination_mappings?.length || 0 }} destinations · {{ scope.allowed_fields.length }} fields</p><UButton v-if="scope.status === 'approved'" class="mt-3" size="xs" color="error" variant="soft" label="Revoke scope" @click="revoke(scope.id)" /></article></div><p v-else class="mt-3 text-sm text-muted">No Monday evidence scopes have been created.</p></div>
      </div>
      <aside class="rounded-xl border border-default bg-default">
        <div class="border-b border-default bg-elevated/30 px-5 py-4"><p class="font-mono text-xs uppercase tracking-[0.16em] text-primary">Owner approval</p><h2 class="mt-1 text-lg font-semibold text-highlighted">Define the boundary</h2></div>
        <div class="space-y-5 p-5">
          <section class="rounded-lg border border-default bg-elevated/30 p-4" aria-labelledby="monday-permissions-title">
            <div class="flex items-start gap-3">
              <UIcon name="i-lucide-key-round" class="mt-0.5 size-5 shrink-0 text-primary" />
              <div class="min-w-0">
                <h3 id="monday-permissions-title" class="text-sm font-semibold text-highlighted">Connection permissions</h3>
                <p class="mt-1 text-xs leading-5 text-muted">Review these permissions before approving an HR evidence scope. Approval narrows boards, fields and dates; it does not expand the Monday connection.</p>
              </div>
            </div>
            <div v-if="readiness.connection" class="mt-4 space-y-3">
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <UBadge color="neutral" variant="subtle" :label="readiness.connection.authMethod === 'oauth' ? 'OAuth connection' : 'API token connection'" />
                <span class="text-muted">{{ readiness.connection.accountName || readiness.connection.accountId || 'Connected Monday account' }}</span>
              </div>
              <ul class="grid gap-1.5 sm:grid-cols-2" aria-label="Monday requested permissions">
                <li v-for="permission in readiness.connection.requestedPermissions" :key="permission" class="flex items-center gap-2 font-mono text-xs text-muted">
                  <UIcon name="i-lucide-check" class="size-3.5 text-success" />{{ permission }}
                </li>
              </ul>
            </div>
            <UAlert v-else class="mt-4" color="warning" variant="soft" icon="i-lucide-unplug" title="Monday is not connected" description="Connect Monday before approving this scope." />
          </section>
          <section v-if="selectedBoards.length" class="space-y-3"><div><p class="text-sm font-medium text-highlighted">Internal destinations</p><p class="mt-1 text-xs leading-5 text-muted">Choose where each board will land. The mapping is locked into this scope.</p></div><UFormField v-for="boardId in selectedBoards" :key="boardId" :label="boards.find(board => board.id === boardId)?.name || boardId" required><USelect v-model="destinationByBoard[boardId]" :items="departmentItems" value-key="value" placeholder="Choose department" class="w-full" /></UFormField></section>
          <UFormField label="Allowed fields" required help="One Monday column or approved field per line."><UTextarea v-model="form.allowedFields" :rows="6" class="w-full" /></UFormField>
          <UFormField label="Purpose" required><UTextarea v-model="form.purpose" :rows="4" class="w-full" /></UFormField>
          <UFormField label="Explicit exclusions" required><UTextarea v-model="form.exclusions" :rows="4" class="w-full" /></UFormField>
          <div class="grid gap-3 sm:grid-cols-2"><UFormField label="Period starts" required><UInput v-model="form.periodStart" type="date" class="w-full" /></UFormField><UFormField label="Period ends" required><UInput v-model="form.periodEnd" type="date" class="w-full" /></UFormField></div>
          <UFormField label="Retention days" required><UInput v-model.number="form.retentionDays" type="number" min="30" max="2555" class="w-full" /></UFormField>
          <div class="flex justify-end gap-2"><UButton color="neutral" variant="outline" label="Save draft" :loading="saving" @click="save('draft')" /><UButton icon="i-lucide-shield-check" label="Approve scope" :loading="saving" @click="save('approved')" /></div>
        </div>
      </aside>
    </section>
  </main>
</template>
