<script setup lang="ts">
// Owner picker for CRM records — staff dropdown + one-click "Claim" (assign to me).
// v-model is the owner user id (team_members.id) or null when unassigned.
const props = defineProps<{ modelValue: string | null | undefined }>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

// Owner assignment is an agency-staff concept; the staff directory endpoint is
// staff-authed. In the client portal (base !== '/api/crm') the control is inert.
const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const { user } = useAuth()
const { data } = useFetch<{ suggestions: { id: string, name: string }[] }>('/api/users/search', {
  query: { q: '', limit: '20' }, default: () => ({ suggestions: [] }), immediate: isAgency,
})
const NONE = '__none__'
const options = computed(() => [
  { label: 'Unassigned', value: NONE },
  ...(data.value?.suggestions ?? []).map(u => ({ label: u.name, value: u.id })),
])
const selected = computed({
  get: () => props.modelValue ?? NONE,
  set: (v: string) => emit('update:modelValue', v === NONE ? null : v),
})
const canClaim = computed(() => !!user.value?.id && props.modelValue !== user.value?.id)
function claim() { if (user.value?.id) emit('update:modelValue', user.value.id) }
</script>

<template>
  <div v-if="isAgency" class="flex items-end gap-2">
    <USelectMenu v-model="selected" :items="options" value-key="value" searchable class="flex-1" />
    <UButton v-if="canClaim" size="sm" variant="soft" color="neutral" icon="i-lucide-hand" @click="claim">Claim</UButton>
  </div>
  <p v-else class="text-xs text-muted">Managed by your agency.</p>
</template>
