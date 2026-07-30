<script setup lang="ts">
// This authenticated management surface is intentionally client-only.
// Design intent: this is a security hand-off for agency operators, so the
// one-time address is a calm, selectable receipt rather than another dashboard card.
import { computed, onMounted, ref, toRef, watch } from 'vue'
import { useCrmInboundEmailRoute } from '~/composables/useCrmInboundEmailRoute'
import type { CrmInboundEmailRoute, CrmInboundEmailRouteIssuedResponse } from '~/types/crmEmailRoute'

const props = defineProps<{
  apiBase: string
  clientId?: string
  canManage: boolean
}>()

const manager = useCrmInboundEmailRoute({
  apiBase: toRef(props, 'apiBase'),
  clientId: toRef(props, 'clientId')
})
const inboxLabel = ref('CRM inbox')
const issuedAddress = ref<string | null>(null)
const rotationTarget = ref<CrmInboundEmailRoute | null>(null)
const revocationTarget = ref<CrmInboundEmailRoute | null>(null)
const showRotationModal = ref(false)
const showRevocationModal = ref(false)

const activeRoute = computed(() => manager.routes.value.find(route => route.status !== 'revoked') ?? null)
const latestRevokedRoute = computed(() => manager.routes.value.find(route => route.status === 'revoked') ?? null)
const awaitingRoute = computed(() => activeRoute.value?.status === 'never_used')
const readyRoute = computed(() => activeRoute.value?.status === 'active')
const expiredRoute = computed(() => activeRoute.value?.status === 'expired')

function formatRouteTimestamp(value: string | null, unavailableCopy = 'No messages received yet'): string {
  if (!value) return unavailableCopy
  const timestamp = new Date(value)
  return Number.isNaN(timestamp.getTime()) ? 'Unavailable' : timestamp.toLocaleString()
}

function dismissIssuedAddress() {
  issuedAddress.value = null
}

function clearTransientState() {
  dismissIssuedAddress()
  rotationTarget.value = null
  revocationTarget.value = null
  showRotationModal.value = false
  showRevocationModal.value = false
}

function revealIssuedAddress(issued: CrmInboundEmailRouteIssuedResponse | null) {
  if (issued?.addressShownOnce) issuedAddress.value = issued.issuedAddress
}

async function refresh() {
  clearTransientState()
  await manager.refresh()
}

async function createAddress() {
  if (!props.canManage) return
  revealIssuedAddress(await manager.create(inboxLabel.value))
}

function requestRotation(route: CrmInboundEmailRoute) {
  if (!props.canManage || !route.canRotate) return
  rotationTarget.value = route
  showRotationModal.value = true
}

async function rotateAddress() {
  if (!props.canManage || !rotationTarget.value || !rotationTarget.value.canRotate) return
  const issued = await manager.rotate(rotationTarget.value)
  if (issued) {
    showRotationModal.value = false
    revealIssuedAddress(issued)
  }
}

function requestRevocation(route: CrmInboundEmailRoute) {
  if (!props.canManage || !route.canRevoke) return
  revocationTarget.value = route
  showRevocationModal.value = true
}

async function revokeAddress() {
  if (!props.canManage || !revocationTarget.value || !revocationTarget.value.canRevoke) return
  const revoked = await manager.revoke(revocationTarget.value)
  if (revoked) {
    showRevocationModal.value = false
    dismissIssuedAddress()
  }
}

async function copyIssuedAddress() {
  if (issuedAddress.value) await manager.copyAddress(issuedAddress.value)
}

watch([() => props.apiBase, () => props.clientId], () => {
  clearTransientState()
  manager.reset()
  void manager.refresh()
})

watch(() => props.canManage, (canManage) => {
  if (!canManage) clearTransientState()
})

onMounted(refresh)
</script>

<template>
  <section class="space-y-5" aria-labelledby="inbound-email-onboarding-title">
    <div class="flex items-start gap-3">
      <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <UIcon name="i-lucide-mail-plus" class="size-5" />
      </div>
      <div class="min-w-0 space-y-1">
        <h3 id="inbound-email-onboarding-title" class="text-sm font-semibold text-highlighted">
          Inbound CRM email
        </h3>
        <p class="text-sm text-muted">
          Create a dedicated address for messages that should become CRM conversations.
        </p>
      </div>
    </div>

    <UAlert
      v-if="manager.loadError.value"
      color="error"
      variant="soft"
      icon="i-lucide-circle-alert"
      title="Email routes could not be loaded"
      :description="manager.loadError.value"
    >
      <template #actions>
        <UButton
          color="error"
          variant="ghost"
          size="xs"
          icon="i-lucide-refresh-cw"
          @click="refresh"
        >
          Retry
        </UButton>
      </template>
    </UAlert>

    <div v-else-if="manager.pending.value" class="flex items-center gap-2 py-4 text-sm text-muted" aria-live="polite">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
      Loading inbox address…
    </div>

    <template v-else>
      <div
        v-if="!activeRoute && latestRevokedRoute"
        class="space-y-4 rounded-xl border border-default bg-elevated/20 p-4"
      >
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 space-y-1">
            <p class="text-sm font-medium text-highlighted">
              {{ latestRevokedRoute.label }}
            </p>
            <p class="text-sm text-muted">
              This inbox address no longer accepts inbound CRM email.
            </p>
          </div>
          <UBadge color="neutral" variant="subtle" class="shrink-0">
            Revoked
          </UBadge>
        </div>
        <p class="text-xs text-muted">
          The address itself is never shown again after its one-time reveal.
        </p>
        <dl class="grid grid-cols-1 gap-3 border-t border-default pt-4 sm:grid-cols-3">
          <div>
            <dt class="text-xs text-muted">
              Created
            </dt>
            <dd class="mt-1 text-sm text-highlighted">
              {{ formatRouteTimestamp(latestRevokedRoute.createdAt) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Last received
            </dt>
            <dd class="mt-1 text-sm text-highlighted">
              {{ formatRouteTimestamp(latestRevokedRoute.lastUsedAt) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Revoked on
            </dt>
            <dd class="mt-1 text-sm text-highlighted">
              {{ formatRouteTimestamp(latestRevokedRoute.revokedAt, 'Unavailable') }}
            </dd>
          </div>
        </dl>
      </div>

      <form v-if="!activeRoute && canManage" class="@container space-y-4 rounded-xl border border-default bg-elevated/30 p-4" @submit.prevent="createAddress">
        <div class="space-y-1">
          <p class="text-sm font-medium text-highlighted">
            {{ latestRevokedRoute ? 'Create a new inbox address' : 'No CRM inbox address yet' }}
          </p>
          <p class="text-sm text-muted">
            {{ latestRevokedRoute
              ? 'Create a replacement when you are ready to copy it into the sending system.'
              : 'Create one when you are ready to copy it into the sending system.' }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Inbox label" help="A private label for this CRM inbox.">
            <UInput v-model="inboxLabel" class="w-full" maxlength="128" />
          </UFormField>
          <div class="flex items-end">
            <UButton
              type="submit"
              class="w-full @lg:w-auto"
              icon="i-lucide-plus"
              :loading="manager.mutationPendingId.value === 'create'"
            >
              Create inbox address
            </UButton>
          </div>
        </div>
      </form>

      <UAlert
        v-else-if="!activeRoute"
        color="neutral"
        variant="soft"
        icon="i-lucide-mail"
        :title="latestRevokedRoute ? 'CRM inbox address revoked' : 'No CRM inbox address yet'"
        :description="latestRevokedRoute
          ? 'Ask a CRM administrator to create a new inbound address.'
          : 'Ask a CRM administrator to create an inbound address.'"
      />

      <div v-else class="space-y-4 rounded-xl border border-default bg-elevated/20 p-4">
        <div class="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              {{ activeRoute.label }}
            </p>
            <p v-if="awaitingRoute" class="mt-1 text-sm text-muted">
              Awaiting first message
            </p>
            <p v-else-if="readyRoute" class="mt-1 text-sm text-muted">
              Ready for inbound CRM email
            </p>
            <p v-else-if="expiredRoute" class="mt-1 text-sm text-muted">
              Inbox address expired
            </p>
            <p v-else class="mt-1 text-sm text-muted">
              Active inbox address
            </p>
          </div>
          <UBadge :color="expiredRoute ? 'neutral' : awaitingRoute ? 'warning' : 'success'" variant="subtle" class="shrink-0">
            {{ expiredRoute ? 'Expired' : awaitingRoute ? 'Awaiting message' : 'Ready' }}
          </UBadge>
        </div>
        <p class="text-xs text-muted">
          The address itself is never shown again after its one-time reveal.
        </p>
        <dl class="grid grid-cols-1 gap-3 border-t border-default pt-4 sm:grid-cols-2">
          <div>
            <dt class="text-xs text-muted">
              Created
            </dt>
            <dd class="mt-1 text-sm text-highlighted">
              {{ formatRouteTimestamp(activeRoute.createdAt) }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">
              Last received
            </dt>
            <dd class="mt-1 text-sm text-highlighted">
              {{ formatRouteTimestamp(activeRoute.lastUsedAt) }}
            </dd>
          </div>
        </dl>
        <div v-if="canManage" class="flex flex-wrap gap-2 border-t border-default pt-4">
          <UButton
            color="neutral"
            variant="soft"
            icon="i-lucide-refresh-cw"
            :disabled="!activeRoute.canRotate"
            @click="requestRotation(activeRoute)"
          >
            Rotate address
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-ban"
            :disabled="!activeRoute.canRevoke"
            @click="requestRevocation(activeRoute)"
          >
            Revoke address
          </UButton>
        </div>
      </div>

      <UAlert
        v-if="activeRoute && manager.routes.value.some(route => route.status === 'revoked')"
        color="neutral"
        variant="soft"
        icon="i-lucide-circle-off"
        title="Revoked"
        description="A previously issued address has been revoked and no longer accepts inbound CRM email."
      />
    </template>

    <div v-if="issuedAddress" class="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-live="polite">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <p class="text-sm font-semibold text-highlighted">
            Your new inbound email address
          </p>
          <p class="text-sm text-muted">
            Copy this address now. For security, XeroFlow cannot show it again.
          </p>
        </div>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          icon="i-lucide-x"
          aria-label="Dismiss inbound email address"
          @click="dismissIssuedAddress"
        />
      </div>
      <UFormField label="Inbound email address">
        <div class="flex min-w-0 items-center gap-2">
          <UInput :model-value="issuedAddress" readonly class="min-w-0 flex-1" />
          <UButton
            class="shrink-0"
            icon="i-lucide-copy"
            aria-label="Copy inbound email address"
            @click="copyIssuedAddress"
          >
            Copy
          </UButton>
        </div>
      </UFormField>
    </div>

    <UModal v-model:open="showRotationModal">
      <template #content>
        <div class="space-y-4 p-5">
          <div class="space-y-1">
            <h4 class="text-base font-semibold text-highlighted">
              Rotate inbox address?
            </h4>
            <p class="text-sm text-muted">
              The current address stops working as soon as rotation completes.
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showRotationModal = false">
              Cancel
            </UButton>
            <UButton
              icon="i-lucide-refresh-cw"
              :disabled="!canManage || !rotationTarget?.canRotate"
              :loading="manager.mutationPendingId.value === rotationTarget?.id"
              @click="rotateAddress"
            >
              Rotate address
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showRevocationModal">
      <template #content>
        <div class="space-y-4 p-5">
          <div class="space-y-1">
            <h4 class="text-base font-semibold text-highlighted">
              Revoke inbox address?
            </h4>
            <p class="text-sm text-muted">
              Messages sent to this address will no longer create CRM conversations.
            </p>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showRevocationModal = false">
              Cancel
            </UButton>
            <UButton
              color="error"
              icon="i-lucide-ban"
              :disabled="!canManage || !revocationTarget?.canRevoke"
              :loading="manager.mutationPendingId.value === revocationTarget?.id"
              @click="revokeAddress"
            >
              Revoke address
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
