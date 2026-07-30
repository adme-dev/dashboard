<script setup lang="ts">
import { useEmailEndpointsManager } from '~/composables/useEmailEndpointsManager'

const emit = defineEmits<{
  'open-rules': []
}>()

const {
  clients,
  team,
  pending,
  mutationPendingId,
  loadError,
  forbidden,
  selectedClient,
  selectedStatus,
  showSlideover,
  editingEndpoint,
  rotationTarget,
  retirementTarget,
  showRotationModal,
  showRetirementModal,
  clientOptions,
  statusOptions,
  clientNameById,
  filteredEndpoints,
  refresh,
  replaceEndpoint,
  copyAddress,
  openCreate,
  openEdit,
  toggleEndpoint,
  requestRotation,
  requestRetirement,
  openRules,
  rotateEndpoint,
  retireEndpoint
} = useEmailEndpointsManager(() => emit('open-rules'))
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex flex-col gap-3 border-b border-default px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-base font-semibold">
          Email addresses
        </h2>
        <p class="text-sm text-muted">
          Agency-only inbound addresses, health, and routing entry points.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Create address"
        size="sm"
        @click="openCreate"
      />
    </div>

    <div class="grid grid-cols-1 gap-4 border-b border-default px-4 py-3 sm:grid-cols-2">
      <UFormField label="Client">
        <USelectMenu
          v-model="selectedClient"
          :items="clientOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Status">
        <USelectMenu
          v-model="selectedStatus"
          :items="statusOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="border-b border-default px-4 py-4">
      <CrmInboundEmailOnboarding
        v-if="selectedClient !== 'all'"
        :client-id="selectedClient"
        api-base="/api/crm/email-routes"
        :can-manage="!forbidden"
      />
      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        icon="i-lucide-building-2"
        title="Select a client to set up inbound CRM email"
        description="Choose a client above to create and manage its dedicated CRM inbox address."
      />
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      <div
        v-if="pending"
        role="status"
        aria-label="Loading email endpoints"
        aria-busy="true"
        class="space-y-3 p-4"
      >
        <USkeleton v-for="index in 6" :key="index" class="h-12 w-full" />
      </div>

      <div v-else-if="forbidden" class="flex h-full items-center justify-center p-6">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-lock-keyhole"
          title="Access denied"
          description="Email endpoint management is agency-only and requires lead management access."
        />
      </div>

      <div v-else-if="loadError && filteredEndpoints.length === 0" class="flex h-full items-center justify-center p-6">
        <div class="max-w-lg space-y-3 text-center">
          <UAlert
            color="error"
            variant="soft"
            icon="i-lucide-triangle-alert"
            title="Email addresses could not be loaded"
            :description="loadError"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="Retry"
            color="neutral"
            variant="outline"
            @click="refresh"
          />
        </div>
      </div>

      <div
        v-else-if="filteredEndpoints.length === 0"
        role="status"
        class="flex h-full flex-col items-center justify-center px-6 py-12 text-center"
      >
        <UIcon name="i-lucide-mail-plus" class="mb-3 size-10 text-dimmed" />
        <h3 class="text-base font-semibold">
          No email addresses
        </h3>
        <p class="mt-1 max-w-md text-sm text-muted">
          Create an address for a client, or change the filters to see existing endpoints.
        </p>
        <UButton
          class="mt-4"
          icon="i-lucide-plus"
          label="Create address"
          size="sm"
          @click="openCreate"
        />
      </div>

      <div v-else>
        <UAlert
          v-if="loadError"
          class="m-4"
          color="warning"
          variant="soft"
          icon="i-lucide-cloud-alert"
          title="Showing the last loaded email addresses"
          :description="`${loadError} Retry to refresh this view.`"
          :actions="[{ label: 'Retry', color: 'neutral', variant: 'outline', onClick: refresh }]"
        />
        <LeadsEmailEndpointsTable
          :endpoints="filteredEndpoints"
          :client-name-by-id="clientNameById"
          :mutation-pending-id="mutationPendingId"
          @copy="copyAddress"
          @edit="openEdit"
          @toggle="toggleEndpoint"
          @rotate="requestRotation"
          @open-rules="openRules"
          @retire="requestRetirement"
        />
      </div>
    </div>

    <LeadsEmailEndpointSlideover
      v-model:open="showSlideover"
      :endpoint="editingEndpoint"
      :clients="clients"
      :team="team"
      @saved="replaceEndpoint"
      @open-rule="openRules"
    />

    <LeadsEmailEndpointConfirmationModals
      v-model:rotation-open="showRotationModal"
      v-model:retirement-open="showRetirementModal"
      :rotation-target="rotationTarget"
      :retirement-target="retirementTarget"
      :mutation-pending-id="mutationPendingId"
      @rotate="rotateEndpoint"
      @retire="retireEndpoint"
    />
  </div>
</template>
