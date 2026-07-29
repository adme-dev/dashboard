<script setup lang="ts">
import { formatDistanceToNowStrict } from 'date-fns'
import type { SafeEmailLeadEndpoint } from '~/utils/emailEndpointUi'

const props = defineProps<{
  endpoints: SafeEmailLeadEndpoint[]
  clientNameById: Map<string, string>
  mutationPendingId: string | null
}>()

const emit = defineEmits<{
  copy: [endpoint: SafeEmailLeadEndpoint]
  edit: [endpoint: SafeEmailLeadEndpoint]
  toggle: [endpoint: SafeEmailLeadEndpoint]
  rotate: [endpoint: SafeEmailLeadEndpoint]
  'open-rules': []
  retire: [endpoint: SafeEmailLeadEndpoint]
}>()

const columns = [
  { accessorKey: 'client_id', header: 'Client' },
  { accessorKey: 'email_address', header: 'Address' },
  { accessorKey: 'label', header: 'Label' },
  { accessorKey: 'expected_provider', header: 'Provider' },
  { accessorKey: 'form_name', header: 'Form' },
  { accessorKey: 'last_received_at', header: 'Last message' },
  { accessorKey: 'health', header: 'Health' },
  { accessorKey: 'recovery', header: 'Recovery' },
  { accessorKey: 'actions', header: '' }
]

function lastMessageLabel(value: string | null) {
  if (!value) return 'Never'
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true })
}

function actionItems(endpoint: SafeEmailLeadEndpoint) {
  const retired = Boolean(endpoint.retired_at)
  return [[
    { label: 'Copy address', icon: 'i-lucide-copy', onSelect: () => emit('copy', endpoint) },
    {
      label: 'Edit endpoint',
      icon: 'i-lucide-pencil',
      disabled: retired,
      onSelect: () => emit('edit', endpoint)
    },
    {
      label: endpoint.enabled ? 'Disable endpoint' : 'Enable endpoint',
      icon: endpoint.enabled ? 'i-lucide-circle-pause' : 'i-lucide-circle-play',
      disabled: retired,
      onSelect: () => emit('toggle', endpoint)
    },
    {
      label: 'Rotate address',
      icon: 'i-lucide-refresh-cw',
      disabled: retired || !endpoint.enabled,
      onSelect: () => emit('rotate', endpoint)
    },
    { label: 'Open form rule', icon: 'i-lucide-route', onSelect: () => emit('open-rules') },
    {
      label: 'Retire endpoint',
      icon: 'i-lucide-archive',
      color: 'error' as const,
      disabled: retired,
      onSelect: () => emit('retire', endpoint)
    }
  ]]
}
</script>

<template>
  <div class="min-w-[72rem]">
    <UTable
      :data="props.endpoints"
      :columns="columns"
      class="w-full"
      :ui="{ td: 'py-3 align-top' }"
    >
      <template #client_id-cell="{ row }">
        <span class="text-sm font-medium">
          {{ clientNameById.get(row.original.client_id) ?? 'Unknown client' }}
        </span>
      </template>
      <template #email_address-cell="{ row }">
        <div class="max-w-72">
          <p class="truncate font-mono text-xs" :title="row.original.email_address">
            {{ row.original.email_address }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Agency-only address
          </p>
        </div>
      </template>
      <template #label-cell="{ row }">
        <span class="text-sm">{{ row.original.label }}</span>
      </template>
      <template #expected_provider-cell="{ row }">
        <span class="text-sm">{{ row.original.expected_provider || 'Any' }}</span>
      </template>
      <template #form_name-cell="{ row }">
        <div>
          <p class="text-sm">
            {{ row.original.form_name }}
          </p>
          <p class="mt-1 max-w-48 truncate font-mono text-xs text-muted" :title="row.original.form_id">
            {{ row.original.form_id }}
          </p>
        </div>
      </template>
      <template #last_received_at-cell="{ row }">
        <span class="whitespace-nowrap text-sm">
          {{ lastMessageLabel(row.original.last_received_at) }}
        </span>
      </template>
      <template #health-cell="{ row }">
        <LeadsEmailIngestionStatusBadge :endpoint="row.original" />
      </template>
      <template #recovery-cell>
        <UTooltip text="Oldest non-terminal age and recovery state are not included in the safe list response.">
          <span class="whitespace-nowrap text-xs text-muted">
            Not supplied by endpoint list API
          </span>
        </UTooltip>
      </template>
      <template #actions-cell="{ row }">
        <UDropdownMenu :items="actionItems(row.original)">
          <UButton
            icon="i-lucide-ellipsis"
            label="Actions"
            color="neutral"
            variant="ghost"
            size="xs"
            :loading="mutationPendingId === row.original.id"
            :disabled="Boolean(mutationPendingId)"
          />
        </UDropdownMenu>
      </template>
    </UTable>
  </div>
</template>
