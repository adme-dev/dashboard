<script setup lang="ts">
import { SEVERITY_ORDER, severityMeta } from '~~/app/utils/escalationDisplay'
import type { AutomationEscalation } from '~~/app/composables/useAutomationEscalations'

definePageMeta({
  title: 'Escalations',
  middleware: ['role-management'],
})

const { count, pending, error, refresh, decide, deciding, groups } = await useAutomationEscalations()

// Present by severity (critical → warning → info). The API also groups by client;
// client-level grouping is deferred until client names are joined into the payload.
const severitySections = computed(() =>
  SEVERITY_ORDER
    .map(severity => ({
      severity,
      items: groups.value.filter(g => g.severity === severity).flatMap(g => g.items),
    }))
    .filter(section => section.items.length > 0),
)

// Decision modal
const modalOpen = ref(false)
const target = ref<AutomationEscalation | null>(null)
const pendingDecision = ref<'approved' | 'rejected'>('approved')
const note = ref('')

function openDecision(escalation: AutomationEscalation, decision: 'approved' | 'rejected') {
  target.value = escalation
  pendingDecision.value = decision
  note.value = ''
  modalOpen.value = true
}

async function confirmDecision() {
  if (!target.value) return
  const ok = await decide(target.value.id, pendingDecision.value, note.value.trim() || undefined)
  if (ok) modalOpen.value = false
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Escalations">
        <template #right>
          <div class="flex items-center gap-2">
            <UBadge v-if="count" color="neutral" variant="subtle">{{ count }} pending</UBadge>
            <UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="pending"
              aria-label="Refresh"
              @click="refresh()"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          title="Couldn’t load escalations"
          :description="String((error as any)?.data?.statusMessage || (error as any)?.message || 'Please try again.')"
        />

        <div v-else-if="pending && count === 0" class="flex items-center justify-center py-24 text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
          <span class="ml-2 text-sm">Loading escalations…</span>
        </div>

        <div v-else-if="count === 0" class="flex flex-col items-center justify-center py-24 text-center">
          <div class="flex size-12 items-center justify-center rounded-full bg-success/10">
            <UIcon name="i-lucide-check-check" class="size-6 text-success" />
          </div>
          <p class="mt-4 text-base font-medium text-highlighted">All clear</p>
          <p class="mt-1 text-sm text-muted">Nothing needs your sign-off right now.</p>
        </div>

        <div v-else class="space-y-8">
          <section v-for="section in severitySections" :key="section.severity">
            <div class="mb-3 flex items-center gap-2">
              <UBadge
                :color="severityMeta(section.severity).color"
                variant="subtle"
                :icon="severityMeta(section.severity).icon"
              >
                {{ severityMeta(section.severity).label }}
              </UBadge>
              <span class="text-sm text-muted">{{ section.items.length }}</span>
            </div>
            <div class="space-y-3">
              <AutomationEscalationCard
                v-for="item in section.items"
                :key="item.id"
                :escalation="item"
                :busy="deciding === item.id"
                @approve="openDecision(item, 'approved')"
                @reject="openDecision(item, 'rejected')"
              />
            </div>
          </section>
        </div>
      </div>
    </UDashboardPanel>

    <UModal v-model:open="modalOpen">
      <template #header>
        <h3 class="font-semibold text-highlighted">
          {{ pendingDecision === 'approved' ? 'Approve escalation' : 'Reject escalation' }}
        </h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            {{ pendingDecision === 'approved' ? 'Approving' : 'Rejecting' }}:
            <span class="font-medium text-highlighted">{{ target?.title }}</span>
          </p>
          <UFormField label="Note" help="Optional — added to the audit trail.">
            <UTextarea
              v-model="note"
              :rows="3"
              autoresize
              placeholder="Add context…"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="modalOpen = false">Cancel</UButton>
          <UButton
            :color="pendingDecision === 'approved' ? 'success' : 'error'"
            :loading="deciding === target?.id"
            @click="confirmDecision"
          >
            {{ pendingDecision === 'approved' ? 'Approve' : 'Reject' }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
