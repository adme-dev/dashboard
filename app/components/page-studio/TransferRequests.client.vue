<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TransferControlsListSchema, type TransferControlsView } from '~~/shared/pageStudio/transferControls'

const { user } = useAuth()
// Candidate visibility only: the server checks the current built-in role.
const canManage = computed(() => Boolean(user.value && ['owner', 'admin'].includes(user.value.role)))
const actorKey = computed(() => JSON.stringify(user.value))
const requests = ref<TransferControlsView[]>([]), selected = ref<TransferControlsView | null>(null)
const cursor = ref<string | null>(null), history = ref<Array<string | null>>([]), nextCursor = ref<string | null>(null)
const loading = ref(false), detailBusy = ref(false), message = ref('')
let generation = 0
async function load() {
  if (!canManage.value || loading.value || detailBusy.value) return
  const current = generation
  loading.value = true
  selected.value = null
  requests.value = []
  message.value = ''
  try {
    const result = TransferControlsListSchema.parse(await $fetch<unknown>('/api/agency/page-studio/transfer-requests', { query: cursor.value ? { cursor: cursor.value } : {} }))
    if (current !== generation) return
    requests.value = result.requests
    nextCursor.value = result.nextCursor
  } catch {
    if (current === generation) {
      nextCursor.value = null
      message.value = 'Requests could not be loaded. Check your platform access and refresh.'
    }
  } finally { if (current === generation) loading.value = false }
}
function updateRequest(value: TransferControlsView) {
  if (selected.value?.siteId !== value.siteId || selected.value?.requestId !== value.requestId) return
  requests.value = requests.value.map(request => request.siteId === value.siteId && request.requestId === value.requestId ? value : request)
  selected.value = value
}
function page(next: boolean) {
  if (loading.value || detailBusy.value) return
  if (next && nextCursor.value) {
    history.value.push(cursor.value)
    cursor.value = nextCursor.value
  } else if (!next && history.value.length) cursor.value = history.value.pop() ?? null
  else return
  void load()
}
watch(actorKey, () => {
  generation++
  requests.value = []
  selected.value = null
  detailBusy.value = false
  cursor.value = null
  nextCursor.value = null
  history.value = []
  loading.value = false
  message.value = ''
  if (canManage.value) void load()
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => {
  generation++
})
</script>

<template>
  <UDashboardPanel id="page-studio-transfer-requests">
    <template #header>
      <UDashboardNavbar title="Website preparations">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template><template #right>
          <UButton
            class="min-h-11"
            label="Refresh queue"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :disabled="loading || detailBusy || !canManage"
            @click="load"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-7xl space-y-6">
        <header class="max-w-prose space-y-2">
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
            Reviewed website preparations
          </h1><p class="text-muted">
            Review owner requests, reserve the approved copy and continue each saved phase explicitly.
          </p>
        </header>
        <UAlert
          v-if="!canManage"
          title="Platform administrator access required"
          description="Sign in with a built-in owner or administrator account."
          color="warning"
        />
        <template v-else>
          <div aria-live="polite">
            <p v-if="loading" class="text-sm text-muted">
              Reading saved requests…
            </p><UAlert
              v-if="message"
              title="Check your access"
              :description="message"
              color="warning"
            />
          </div>
          <div class="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
            <section class="min-w-0 space-y-4" aria-label="Preparation queue">
              <p v-if="!loading && !message && !requests.length" class="text-sm text-muted">
                No preparation requests on this page.
              </p>
              <ul class="divide-y divide-default rounded-lg border border-default">
                <li v-for="request in requests" :key="request.requestId" class="min-w-0 p-4">
                  <p class="break-all text-sm font-medium">
                    Website {{ request.siteId }}
                  </p><p class="mt-1 text-sm text-muted">
                    {{ request.state }}
                  </p><UButton
                    class="mt-3 min-h-11"
                    label="Open request"
                    color="neutral"
                    :variant="selected?.requestId === request.requestId ? 'solid' : 'outline'"
                    :disabled="loading || detailBusy"
                    :aria-pressed="selected?.requestId === request.requestId"
                    @click="() => { if (!loading && !detailBusy) selected = request }"
                  />
                </li>
              </ul>
              <div class="flex justify-between gap-3">
                <UButton
                  class="min-h-11"
                  label="Previous"
                  color="neutral"
                  variant="ghost"
                  :disabled="loading || detailBusy || !history.length"
                  @click="page(false)"
                /><UButton
                  class="min-h-11"
                  label="Next"
                  color="neutral"
                  variant="ghost"
                  :disabled="loading || detailBusy || !nextCursor"
                  @click="page(true)"
                />
              </div>
            </section>
            <PageStudioTransferRequestDetail
              v-if="selected"
              :key="`${actorKey}:${selected.siteId}:${selected.requestId}`"
              :site-id="selected.siteId"
              :request-id="selected.requestId"
              :actor-key="actorKey"
              @busy="detailBusy = $event"
              @changed="updateRequest"
            />
            <p v-else class="text-sm text-muted">
              Choose a request to review its saved website and next available action.
            </p>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
