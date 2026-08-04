<script setup lang="ts">
import type { AiCatalogGovernanceItem, AiDepartmentOwnerCandidate, AiPilotMemberView } from '~/types/aiGovernance'

const props = defineProps<{
  item: AiCatalogGovernanceItem
  candidates: AiDepartmentOwnerCandidate[]
  headingId?: string
}>()
const emit = defineEmits<{ changed: [] }>()

const open = ref(false)
const pending = ref(false)
const error = ref<string | null>(null)
const members = ref<AiPilotMemberView[]>([])
const memberId = ref('__select_member__')
const reason = ref('')
const acknowledged = ref(false)
const mode = ref<'enroll' | 'revoke'>('enroll')

const headingId = computed(() => props.headingId ?? `pilots-${props.item.release.id}`)
const enrolledIds = computed(() => new Set(members.value.map(member => member.memberUserId)))
const eligibleCandidates = computed(() => props.candidates.filter(candidate => candidate.eligible && candidate.source === 'department_member' && !enrolledIds.value.has(candidate.id)))
const candidateOptions = computed(() => [{ label: 'Choose an active member', value: '__select_member__' }, ...eligibleCandidates.value.map(candidate => ({ label: candidate.name, value: candidate.id }))])
const currentMembers = computed(() => members.value.filter(member => member.eligible))
const canSubmit = computed(() => Boolean(memberId.value !== '__select_member__' && reason.value.trim().length >= 10 && acknowledged.value && !pending.value))

function errorMessage(caught: unknown) {
  return (caught as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Pilot membership could not be updated.'
}

async function load() {
  pending.value = true
  error.value = null
  try {
    const result = await $fetch<{ memberships: AiPilotMemberView[] }>(`/api/admin/ai/governance/releases/${props.item.release.id}/pilots`, {
      query: { kind: props.item.kind }
    })
    members.value = result.memberships
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    pending.value = false
  }
}

function reset() {
  memberId.value = '__select_member__'
  reason.value = ''
  acknowledged.value = false
  mode.value = 'enroll'
  error.value = null
}

function openDialog() {
  open.value = true
}

function closeDialog() {
  open.value = false
}

function revoke(member: AiPilotMemberView) {
  mode.value = 'revoke'
  memberId.value = member.memberUserId
  reason.value = ''
  acknowledged.value = false
}

async function submit() {
  if (!canSubmit.value) return
  pending.value = true
  error.value = null
  try {
    await $fetch(`/api/admin/ai/governance/releases/${props.item.release.id}/pilots`, {
      method: mode.value === 'enroll' ? 'POST' : 'DELETE',
      body: { kind: props.item.kind, memberUserId: memberId.value, reason: reason.value.trim() }
    })
    await load()
    emit('changed')
    reset()
  } catch (caught) {
    error.value = errorMessage(caught)
  } finally {
    pending.value = false
  }
}

watch(open, value => { if (value) { reset(); load() } })
</script>

<template>
  <section class="space-y-3" :aria-labelledby="headingId">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div><h4 :id="headingId" class="text-sm font-semibold text-highlighted">Pilots</h4><p class="mt-0.5 text-xs text-muted">Pilot access is individual, department-bound, and auditable.</p></div>
      <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-users" @click="openDialog">Manage pilot members</UButton>
    </div>

    <UModal v-model:open="open" title="Pilot membership" description="Assign or revoke only active members of this department.">
      <template #body>
        <div class="@container space-y-4">
          <UAlert color="info" variant="soft" icon="i-lucide-users-round" title="Active department members only" description="Inactive people and people without a current department membership are excluded." />
          <div v-if="pending && !members.length" class="space-y-2" aria-busy="true" aria-label="Loading pilot members"><USkeleton class="h-12 w-full" /><USkeleton class="h-12 w-full" /></div>
          <UAlert v-else-if="error && !members.length" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Pilot members unavailable" :description="error"><template #actions><UButton size="xs" color="error" variant="soft" @click="load">Try again</UButton></template></UAlert>
          <template v-else>
            <div class="rounded-md border border-default p-3">
              <p class="text-xs font-medium text-default">Current eligible pilot members</p>
              <ul v-if="currentMembers.length" class="mt-2 divide-y divide-default" aria-label="Eligible department pilot members">
                <li v-for="member in currentMembers" :key="member.id" class="flex items-center justify-between gap-3 py-2"><span class="min-w-0 truncate text-sm text-default">{{ member.memberName }}</span><UButton size="xs" color="error" variant="ghost" icon="i-lucide-user-minus" @click="revoke(member)">Revoke</UButton></li>
              </ul>
              <p v-else class="mt-1 text-sm text-muted">No eligible pilot members</p>
            </div>
            <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
              <UFormField :label="mode === 'revoke' ? 'Member to revoke' : 'Eligible department member'">
                <USelectMenu v-if="mode === 'enroll'" v-model="memberId" :items="candidateOptions" value-key="value" placeholder="Choose an active member" class="w-full" />
                <UInput v-else :model-value="currentMembers.find(member => member.memberUserId === memberId)?.memberName ?? 'Selected pilot member'" disabled class="w-full" />
              </UFormField>
              <UFormField label="Audit reason" help="At least 10 characters; stored with the membership change."><UTextarea v-model="reason" :rows="3" class="w-full" /></UFormField>
            </div>
            <UFormField label="Confirmation"><UCheckbox v-model="acknowledged" :label="mode === 'revoke' ? 'I confirm this pilot access revocation.' : 'I confirm this pilot membership assignment.'" /></UFormField>
            <UAlert v-if="error" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Membership not updated" :description="error" />
          </template>
        </div>
      </template>
      <template #footer><div class="flex w-full justify-between gap-2"><UButton color="neutral" variant="ghost" @click="closeDialog">Cancel</UButton><UButton :color="mode === 'revoke' ? 'error' : 'primary'" :loading="pending" :disabled="!canSubmit" @click="submit">{{ mode === 'revoke' ? 'Confirm revoke' : 'Add pilot member' }}</UButton></div></template>
    </UModal>
  </section>
</template>
