<script setup lang="ts">
import { AI_PERSONA_OPTIONS } from '~~/app/utils/aiPersonas'
import type { MyAssistantView } from '~~/shared/types/aiAssistant'

definePageMeta({ layout: 'agency' })

interface MyConfig { personaKey: string | null, disabledTools: string[], memoryEnabled: boolean }
interface MemoryView { id: string, content: string, memType: string, scope: string, source: string, salience: number, createdAt: string }

const toast = useToast()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>
const config = ref<MyAssistantView | null>(null)
const memData = ref<{ observed: MemoryView[], shared: MemoryView[] } | null>(null)

async function refreshMemories() {
  memData.value = await apiFetch<{ observed: MemoryView[], shared: MemoryView[] }>('/api/agency/ai/my-assistant/memories')
}

async function refreshSettings() {
  const [nextConfig] = await Promise.all([
    apiFetch<MyAssistantView>('/api/agency/ai/my-assistant'),
    refreshMemories(),
  ])
  config.value = nextConfig
}

await refreshSettings()

const observedMemories = computed(() => memData.value?.observed ?? [])
const sharedMemories = computed(() => memData.value?.shared ?? [])

// Delete-an-observed-memory flow (right-to-forget on the transparency panel).
const showDeleteMemory = ref(false)
const memoryToDelete = ref<MemoryView | null>(null)
const deletingMemory = ref(false)
function confirmDeleteMemory(m: MemoryView) {
  memoryToDelete.value = m
  showDeleteMemory.value = true
}
async function deleteMemory() {
  if (!memoryToDelete.value) return
  deletingMemory.value = true
  try {
    await apiFetch(`/api/agency/ai/my-assistant/memories/${memoryToDelete.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Forgotten', description: 'The assistant has forgotten that.', color: 'success' })
    showDeleteMemory.value = false
    memoryToDelete.value = null
    await refreshMemories()
  } catch (e: any) {
    toast.add({ title: 'Couldn’t remove it', description: e?.data?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    deletingMemory.value = false
  }
}
const prettyType = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const sharedScopeLabel = (m: MemoryView) => (m.scope === 'org' ? 'Agency' : 'Team')

// Local editable state (seeded from the server, saved on demand).
const personaKey = ref<string>(config.value?.personaKey ?? 'general')
const memoryEnabled = ref<boolean>(config.value?.memoryEnabled ?? true)
const disabled = ref<Set<string>>(new Set(config.value?.disabledTools ?? []))

const personaItems = AI_PERSONA_OPTIONS.map(o => ({ label: o.label, value: o.key }))
const personaDescription = computed(() => AI_PERSONA_OPTIONS.find(o => o.key === personaKey.value)?.description)
const authority = computed(() => config.value?.authority ?? null)
const tools = computed(() => config.value?.tools ?? [])
const restrictions = computed(() => config.value?.restrictions ?? [])

const prettyTool = (t: string) => t.replace(/^(propose_|get_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const prettyKey = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const roleLabel = computed(() => authority.value ? prettyKey(authority.value.currentRole) : '')
const rolloutModeLabel = computed(() => {
  const mode = authority.value?.runtimeMode ?? 'legacy'
  return mode === 'enforced' ? 'Enforced rollout' : mode === 'pilot' ? 'Pilot rollout' : 'Legacy rollback'
})
const coverageLabel = computed(() => {
  const status = authority.value?.coverageStatus
  if (status === 'governed') return 'Governed catalog'
  if (status === 'authenticated_core') return 'Authenticated core tools'
  return 'Legacy role-based tools'
})
const coverageDescription = computed(() => {
  const status = authority.value?.coverageStatus
  if (status === 'governed') return 'Only tools in active or assigned-pilot evaluated releases are available.'
  if (status === 'authenticated_core') return 'No active evaluated pack covers this scope, so only the authenticated core may be available after role and personal restrictions.'
  return 'Your existing role-based tool access applies while this rollout mode is in effect.'
})
const clientScopeLabel = computed(() => authority.value?.clientScope.mode === 'all_active'
  ? 'All active clients'
  : `${authority.value?.clientScope.assignments.length ?? 0} assigned client${authority.value?.clientScope.assignments.length === 1 ? '' : 's'}`)
const accessReasonLabel = (reason: 'membership' | 'manager' | 'company_policy') => ({
  membership: 'Department member',
  manager: 'Department manager',
  company_policy: 'Company-wide role'
})[reason]
const isEnabled = (name: string) => !disabled.value.has(name)
function toggleTool(name: string, on: boolean) {
  const next = new Set(disabled.value)
  if (on) next.delete(name)
  else next.add(name)
  disabled.value = next
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const saved = await apiFetch<MyConfig>('/api/agency/ai/my-assistant', {
      method: 'PUT',
      body: { personaKey: personaKey.value, disabledTools: [...disabled.value], memoryEnabled: memoryEnabled.value }
    })
    // Reconcile with what the server actually persisted (it's the source of truth).
    personaKey.value = saved.personaKey ?? 'general'
    memoryEnabled.value = saved.memoryEnabled
    disabled.value = new Set(saved.disabledTools)
    config.value = await apiFetch<MyAssistantView>('/api/agency/ai/my-assistant')
    toast.add({ title: 'Saved', description: 'Your assistant settings are updated.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Couldn’t save', description: e?.data?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">
          My Assistant
        </h1>
        <p class="text-sm text-muted">
          Tune how your co-pilot works for you. These settings only narrow what it can do — they never grant access your role doesn’t already have.
        </p>
      </div>
      <UButton icon="i-lucide-check" :loading="saving" @click="save">
        Save changes
      </UButton>
    </header>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">
              Your access
            </h2>
            <p class="mt-0.5 text-xs text-muted">
              This is resolved from your current role, departments, client assignments, and evaluated releases each time the assistant runs.
            </p>
          </div>
          <UBadge :color="authority?.readOnly ? 'warning' : 'success'" variant="soft">
            {{ authority?.readOnly ? 'Read only' : 'Read and propose' }}
          </UBadge>
        </div>
      </template>

      <div aria-live="polite" class="grid gap-4 md:grid-cols-3">
        <section class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Current role
          </p>
          <p class="mt-1 text-sm font-semibold text-highlighted">
            {{ roleLabel }}
          </p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <UBadge v-for="group in authority?.permissionGroups" :key="group" color="neutral" variant="soft" size="sm">
              {{ prettyKey(group) }}
            </UBadge>
            <span v-if="!authority?.permissionGroups.length" class="text-xs text-muted">No specialist permission areas</span>
          </div>
        </section>

        <section class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Client scope
          </p>
          <p class="mt-1 text-sm font-semibold text-highlighted">
            {{ clientScopeLabel }}
          </p>
          <ul v-if="authority?.clientScope.mode === 'assigned' && authority.clientScope.assignments.length" class="mt-2 space-y-1">
            <li v-for="client in authority.clientScope.assignments" :key="`${client.name}:${client.role}`" class="text-xs text-muted">
              {{ client.name }} · {{ prettyKey(client.role) }}
            </li>
          </ul>
          <p v-else-if="authority?.clientScope.mode === 'assigned'" class="mt-2 text-xs text-muted">
            No active client assignments. Client-specific work will be unavailable.
          </p>
        </section>

        <section class="rounded-lg border border-default p-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Capability policy
          </p>
          <p class="mt-1 text-sm font-semibold text-highlighted">
            {{ coverageLabel }}
          </p>
          <p class="mt-2 text-xs text-muted">
            {{ coverageDescription }}
          </p>
          <p class="mt-2 text-xs text-muted">
            Runtime: {{ rolloutModeLabel }} ({{ authority?.runtimeMode }}) · Coverage: {{ authority?.coverageStatus }}
          </p>
        </section>
      </div>
    </UCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-highlighted">
              Department scope
            </h2>
            <span class="text-xs text-muted">{{ authority?.departments.length ?? 0 }} active</span>
          </div>
        </template>
        <div v-if="!authority?.departments.length" class="py-5 text-sm text-muted">
          No active department scope. Ask an administrator to review your department membership.
        </div>
        <ul v-else class="divide-y divide-default">
          <li v-for="department in authority.departments" :key="department.name" class="py-3 first:pt-0 last:pb-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-sm font-medium text-highlighted">
                {{ department.name }}
              </p>
              <UBadge v-if="department.primary" color="primary" variant="soft" size="sm">Primary</UBadge>
              <UBadge v-if="department.manager" color="info" variant="soft" size="sm">Manager</UBadge>
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ accessReasonLabel(department.accessReason) }}<template v-if="department.membershipRole"> · {{ prettyKey(department.membershipRole) }}</template>
            </p>
            <p v-if="department.escalationManagerName" class="mt-1 text-xs text-muted">
              Escalation: {{ department.escalationManagerName }}
            </p>
          </li>
        </ul>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="text-sm font-semibold text-highlighted">
              Capability packs
            </h2>
            <span class="text-xs text-muted">{{ authority?.activePacks.length ?? 0 }} available</span>
          </div>
        </template>
        <div v-if="!authority?.activePacks.length" class="py-5 text-sm text-muted">
          No evaluated departmental pack is active or assigned to you as a pilot yet. The capability policy above shows the access available in the current rollout mode.
        </div>
        <ul v-else class="divide-y divide-default">
          <li v-for="pack in authority.activePacks" :key="`${pack.key}:${pack.version}:${pack.departmentName}`" class="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div>
              <p class="text-sm font-medium text-highlighted">
                {{ pack.label }}
              </p>
              <p class="mt-1 text-xs text-muted">
                {{ pack.departmentName }}
              </p>
            </div>
            <UBadge :color="pack.releaseState === 'pilot' ? 'warning' : 'success'" variant="soft" size="sm">
              {{ pack.releaseState === 'pilot' ? 'Pilot · ' : '' }}v{{ pack.version }}
            </UBadge>
          </li>
        </ul>
      </UCard>
    </div>

    <!-- Default focus -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-highlighted">
          Default focus
        </h2>
      </template>
      <UFormField label="Skill-pack" help="The assistant starts each chat in this focus. It still auto-switches per question, and your role’s permissions always apply.">
        <USelect v-model="personaKey" :items="personaItems" class="w-full sm:w-80" />
      </UFormField>
      <p v-if="personaDescription" class="mt-2 text-xs text-muted">
        {{ personaDescription }}
      </p>
    </UCard>

    <!-- Memory -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-highlighted">
          Memory
        </h2>
      </template>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-default">
            Remember helpful details about you
          </p>
          <p class="mt-0.5 text-xs text-muted">
            Controls whether saved personal details and preferences can be recalled between chats. Turn off to keep every chat fresh.
          </p>
        </div>
        <USwitch v-model="memoryEnabled" />
      </div>
    </UCard>

    <!-- What I've learned from your work (Observe & Learn W-3) -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-semibold text-highlighted">
            What I’ve learned from your work
          </h2>
          <UBadge :color="config?.observedMemoryEnabled ? 'success' : 'neutral'" variant="soft" size="sm">
            {{ config?.observedMemoryEnabled ? 'Observe and learn is on' : 'Observe and learn is off' }}
          </UBadge>
        </div>
      </template>
      <p v-if="config?.observedMemoryEnabled" class="mb-3 text-xs text-muted">
        Private observations previously retained for you appear here. You can remove anything you would rather the assistant forget.
      </p>
      <p v-else class="mb-3 text-xs text-muted">
        Automatic routine learning is not running. Existing private observations remain visible so you can review or remove them.
      </p>

      <div v-if="!observedMemories.length" class="py-6 text-center text-sm text-muted">
        {{ config?.observedMemoryEnabled
          ? 'No private observations have been retained.'
          : 'No private observations are stored, and automatic routine learning is off.' }}
      </div>
      <ul v-else class="divide-y divide-default">
        <li v-for="m in observedMemories" :key="m.id" class="flex items-start justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <p class="text-sm text-highlighted">
              {{ m.content }}
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
                class="ml-1.5"
              >
                {{ prettyType(m.memType) }}
              </UBadge>
            </p>
          </div>
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            size="xs"
            color="error"
            class="mt-0.5 shrink-0"
            aria-label="Forget this"
            @click="confirmDeleteMemory(m)"
          />
        </li>
      </ul>

      <div v-if="sharedMemories.length" class="mt-5 border-t border-default pt-4">
        <p class="mb-2 text-xs font-medium text-default">
          Team &amp; agency knowledge
        </p>
        <p class="mb-3 text-xs text-muted">
          Curated memory shared with your team. Visible to your assistant but managed by your team — not deletable here.
        </p>
        <ul class="divide-y divide-default">
          <li v-for="m in sharedMemories" :key="m.id" class="flex items-start justify-between gap-4 py-2.5">
            <p class="min-w-0 text-sm text-default">
              {{ m.content }}
            </p>
            <UBadge
              color="info"
              variant="soft"
              size="sm"
              class="mt-0.5 shrink-0"
            >
              {{ sharedScopeLabel(m) }}
            </UBadge>
          </li>
        </ul>
      </div>
    </UCard>

    <!-- Tools -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-highlighted">
            Tools
          </h2>
          <span class="text-xs text-muted">{{ tools.filter(t => isEnabled(t.name)).length }}/{{ tools.length }} on</span>
        </div>
      </template>
      <p class="mb-3 text-xs text-muted">
        Turn off any tool you don’t want your assistant to use. Everything here is already permitted by your role.
      </p>
      <div v-if="!tools.length" class="py-6 text-center text-sm text-muted">
        No tools available for your role yet.
      </div>
      <ul v-else class="divide-y divide-default">
        <li v-for="t in tools" :key="t.name" class="flex items-start justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              {{ prettyTool(t.name) }}
              <UBadge
                v-if="t.mutates"
                color="warning"
                variant="soft"
                size="sm"
                class="ml-1.5"
              >
                write
              </UBadge>
            </p>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted">
              {{ t.description }}
            </p>
            <p v-if="!t.availableInCurrentFocus && t.currentFocusReason === 'persona_narrowed'" class="mt-1 text-xs text-warning">
              Not used by your current focus.
            </p>
          </div>
          <USwitch
            :model-value="isEnabled(t.name)"
            class="mt-0.5 shrink-0"
            :aria-label="`${isEnabled(t.name) ? 'Disable' : 'Enable'} ${prettyTool(t.name)}`"
            @update:model-value="(v: boolean) => toggleTool(t.name, v)"
          />
        </li>
      </ul>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-highlighted">
          Why something may be unavailable
        </h2>
      </template>
      <p class="mb-3 text-xs text-muted">
        Access is the intersection of company policy, your current permissions and scope, active evaluated releases, your focus, and the controls above. Tools not listed are outside your current role or permission scope.
      </p>
      <div v-if="!restrictions.length" class="rounded-lg bg-elevated p-3 text-sm text-muted">
        No additional tool restrictions apply to your current focus.
      </div>
      <ul v-else class="space-y-2">
        <li v-for="restriction in restrictions" :key="`${restriction.toolName}:${restriction.reason}`" class="flex items-start gap-2 rounded-lg bg-elevated p-3">
          <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0 text-muted" />
          <p class="text-xs text-muted">
            <span class="font-medium text-default">{{ prettyTool(restriction.toolName) }}:</span>
            {{ restriction.message }}
          </p>
        </li>
      </ul>
    </UCard>

    <UModal v-model:open="showDeleteMemory">
      <template #content>
        <div class="space-y-4 p-6">
          <h3 class="text-base font-semibold text-highlighted">
            Forget this?
          </h3>
          <p class="text-sm text-muted">
            The assistant will no longer remember:
          </p>
          <p class="rounded-md bg-elevated p-3 text-sm text-default">
            {{ memoryToDelete?.content }}
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              variant="ghost"
              color="neutral"
              @click="showDeleteMemory = false"
            />
            <UButton
              label="Forget"
              color="error"
              :loading="deletingMemory"
              @click="deleteMemory"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
