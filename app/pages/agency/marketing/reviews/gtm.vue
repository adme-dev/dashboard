<script setup lang="ts">
definePageMeta({ layout: 'agency' })
const toast = useToast()
const {
  data: plans,
  status,
  error,
  refresh
} = await useFetch<any[]>('/api/agency/marketing/reviews/gtm')
const busy = ref<string | null>(null)
const selected = ref<any>(null)
const reason = ref('')
const decision = ref<'approve' | 'reject' | 'execute'>('approve')
const open = computed({
  get: () => !!selected.value,
  set: (value) => {
    if (!value && !busy.value) selected.value = null
  }
})
function choose(plan: any, action: 'approve' | 'reject' | 'execute') {
  selected.value = plan
  decision.value = action
  reason.value = ''
}
async function submit() {
  const plan = selected.value
  if (!plan || busy.value) return
  busy.value = plan.id
  try {
    const result: any = await $fetch(
      `/api/agency/marketing/reviews/gtm/${plan.id}/${decision.value}`,
      {
        method: 'POST',
        body: {
          expectedHash: plan.request_hash,
          ...(decision.value === 'execute'
            ? {}
            : { reason: reason.value || undefined })
        }
      }
    )
    toast.add({
      title:
        decision.value === 'execute'
          ? `Execution: ${result.status ?? 'recorded'}`
          : 'Review saved',
      description:
        decision.value === 'approve'
          ? 'Approval saved. Execution remains a separate action.'
          : undefined,
      color: result.ok === false ? 'warning' : 'success'
    })
    selected.value = null
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Action could not complete',
      description:
        err.data?.statusMessage
        ?? 'Refresh to inspect the current result before retrying.',
      color: 'error'
    })
    await refresh()
  } finally {
    busy.value = null
  }
}
const pending = (p: any) =>
  ['pending_review', 'pending_approval'].includes(p.status)
</script>

<template>
  <UDashboardPanel id="gtm-reviews" :ui="{ root: 'max-h-svh' }">
    <template #header>
      <UDashboardNavbar title="Tracking reviews" />
    </template>
    <template #body>
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6">
          <div class="max-w-3xl space-y-2">
            <h1 class="text-2xl font-semibold">
              Review the exact change
            </h1>
            <p class="text-muted">
              Check the client, account, requested change and expiry. Approval
              and execution are separate steps. The requester cannot approve
              their own work.
            </p>
            <UButton
              variant="ghost"
              icon="i-lucide-refresh-cw"
              :loading="status === 'pending'"
              @click="refresh()"
            >
              Refresh results
            </UButton>
          </div>
          <UAlert
            v-if="error"
            color="error"
            title="Reviews could not load"
            description="An active owner or admin account is required. Retry after checking your access."
          />
          <UAlert
            v-else-if="!plans?.length && status !== 'pending'"
            title="No reviews available"
            description="Staff proposals for your accessible clients will appear here."
          />
          <section
            v-for="plan in plans || []"
            :id="`proposal-${plan.id}`"
            :key="plan.id"
            class="border-b border-default pb-6 space-y-4"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="text-lg font-medium">
                  {{ plan.operation || plan.action_type }}
                </h2>
                <p class="text-sm text-muted">
                  Client {{ plan.clientId || plan.client_id }}
                </p>
              </div>
              <UBadge variant="subtle">
                {{ plan.status }}
              </UBadge>
            </div>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-muted">
                  Account / container
                </dt>
                <dd class="break-all">
                  {{ plan.customerId || plan.desired_state?.containerPath }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Connection
                </dt>
                <dd>{{ plan.connectionId || plan.connection_id }}</dd>
              </div>
              <div>
                <dt class="text-muted">
                  Requester
                </dt>
                <dd>{{ plan.actorId || plan.requester_id }}</dd>
              </div>
              <div>
                <dt class="text-muted">
                  Reviewer / executor
                </dt>
                <dd>
                  {{
                    plan.reviewedBy || plan.reviewer_id || 'Awaiting review'
                  }}
                  / {{ plan.executedBy || plan.executor_id || 'Not executed' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Expires
                </dt>
                <dd>{{ plan.expiresAt || plan.expires_at }}</dd>
              </div>
              <div>
                <dt class="text-muted">
                  Risk / live base version
                </dt>
                <dd>{{ plan.riskTier || plan.base_live_path }}</dd>
              </div>
            </dl>
            <MarketingGtmReviewDetails :review="plan.review" />
            <details>
              <summary class="cursor-pointer font-medium">
                Exact change and result
              </summary>
              <pre
                class="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-4 text-xs"
              >{{
                  JSON.stringify(
                    {
                      diff: plan.diff || plan.state_diff,
                      ownership: plan.ownership_evidence,
                      hash: plan.requestHash || plan.request_hash,
                      result: plan.verificationSummary || plan.result,
                      error: plan.error_code
                    },
                    null,
                    2
                  )
              }}</pre>
            </details>
            <div class="flex flex-wrap gap-2">
              <UButton
                v-if="pending(plan)"
                :disabled="!!busy || !plan.review || !!plan.review.unavailable"
                @click="choose(plan, 'approve')"
              >
                Approve exact change
              </UButton>
              <UButton
                v-if="pending(plan)"
                variant="outline"
                color="error"
                :disabled="!!busy"
                @click="choose(plan, 'reject')"
              >
                Reject
              </UButton>
              <UButton
                v-if="plan.status === 'approved'"
                color="warning"
                :disabled="!!busy"
                @click="choose(plan, 'execute')"
              >
                Execute approved change
              </UButton>
            </div>
          </section>
          <p class="text-sm text-muted max-w-3xl">
            Provider validation, compiled version, publication and read-back are
            separate results. Tag installation does not prove customer
            conversion delivery. An unknown result requires inspection before
            any further action.
          </p>
        </div>
      </div>
      <UModal
        v-model:open="open"
        :title="
          decision === 'execute'
            ? 'Execute this approved change?'
            : 'Record this review?'
        "
        :dismissible="!busy"
      >
        <template #body>
          <div class="@container space-y-4">
            <p>
              {{
                decision === 'execute'
                  ? 'This may change the connected provider account. Current authority and the reviewed version will be checked again.'
                  : 'Your decision covers only the exact version shown. Approval does not execute it.'
              }}
            </p>
            <MarketingGtmReviewDetails v-if="selected" :review="selected.review" />
            <UFormField
              v-if="decision !== 'execute'"
              label="Review note"
            >
              <UTextarea
                v-model="reason"
                class="w-full"
                :maxlength="1000"
              />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <UButton :loading="!!busy" @click="submit">
            {{
              decision === 'execute' ? 'Execute approved change' : 'Save review'
            }}
          </UButton><UButton
            variant="ghost"
            :disabled="!!busy"
            @click="selected = null"
          >
            Cancel
          </UButton>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
