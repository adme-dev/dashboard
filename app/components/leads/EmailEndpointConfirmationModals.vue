<script setup lang="ts">
import type { SafeEmailLeadEndpoint } from '~/utils/emailEndpointUi'

const props = defineProps<{
  rotationOpen: boolean
  retirementOpen: boolean
  rotationTarget: SafeEmailLeadEndpoint | null
  retirementTarget: SafeEmailLeadEndpoint | null
  mutationPendingId: string | null
}>()

const emit = defineEmits<{
  'update:rotationOpen': [value: boolean]
  'update:retirementOpen': [value: boolean]
  rotate: []
  retire: []
}>()

function closeRotation() {
  emit('update:rotationOpen', false)
}

function closeRetirement() {
  emit('update:retirementOpen', false)
}
</script>

<template>
  <UModal
    :open="rotationOpen"
    title="Rotate email address?"
    description="A new address is generated immediately."
    @update:open="emit('update:rotationOpen', $event)"
  >
    <template #body>
      <div class="space-y-3 text-sm">
        <p>The current address remains valid for 24 hours, then stops accepting new mail.</p>
        <p class="text-muted">
          Update the sender integration during the grace period. Rotation is unavailable while another grace period is active.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          autofocus
          :disabled="Boolean(mutationPendingId)"
          @click="closeRotation"
        />
        <UButton
          label="Rotate address"
          icon="i-lucide-refresh-cw"
          :loading="mutationPendingId === props.rotationTarget?.id"
          :disabled="Boolean(mutationPendingId)"
          @click="emit('rotate')"
        />
      </div>
    </template>
  </UModal>

  <UModal
    :open="retirementOpen"
    title="Retire email address?"
    description="Retirement is permanent."
    @update:open="emit('update:retirementOpen', $event)"
  >
    <template #body>
      <div class="space-y-3 text-sm">
        <p>The address will be disabled and cannot be re-enabled, edited, or rotated.</p>
        <p class="text-muted">
          Existing leads and safe ingestion history remain available.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          autofocus
          :disabled="Boolean(mutationPendingId)"
          @click="closeRetirement"
        />
        <UButton
          label="Retire endpoint"
          icon="i-lucide-archive"
          color="error"
          :loading="mutationPendingId === props.retirementTarget?.id"
          :disabled="Boolean(mutationPendingId)"
          @click="emit('retire')"
        />
      </div>
    </template>
  </UModal>
</template>
