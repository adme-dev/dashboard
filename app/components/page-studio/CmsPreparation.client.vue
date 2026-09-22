<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { z } from 'zod'
import type { $Fetch } from 'ofetch'

// Responses are validated below; avoid inferring every generated Nitro route here.
const nativeFetch = $fetch as $Fetch
const props = defineProps<{ audience: 'agency' | 'portal', siteId: string }>()
const steps = [
  { kind: 'connection', label: 'Connect storage', action: 'Connect CMS above' },
  { kind: 'collections', label: 'Prepare collections', action: 'Prepare collections' },
  { kind: 'workflows', label: 'Prepare content tools', action: 'Prepare content tools' },
  { kind: 'cms-staging', label: 'Prepare CMS storage', action: 'Prepare CMS storage' },
  { kind: 'adoption', label: 'Activate CMS', action: 'Activate CMS' }
] as const
const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
const Setup = z
  .object({
    status: z.enum(['pending', 'reserved', 'running', 'installed', 'disabled', 'reconciliation']),
    canConfigure: z.boolean(),
    requestId: z.uuid().optional()
  })
  .strict()
// Read only the redacted view fields; none authorizes the next native request.
const Adoption = z.object({
  phase: z.enum(['idle', 'freezing', 'importing', 'ready', 'managed']),
  adoptionId: Id.nullable(),
  recoveryId: Id.nullable(),
  recoveryRequired: z.boolean(),
  recoveryReason: z.string().max(500).nullable(),
  progressDigest: z.string().regex(/^[a-f0-9]{64}$/),
  progress: z.object({ consumed: z.number().int().nonnegative(), done: z.boolean() }).nullable()
})
const stage = ref(0),
  busy = ref(false),
  needsRefresh = ref(true),
  failure = ref('')
const setup = ref<z.infer<typeof Setup> | null>(null)
const adoption = ref<z.infer<typeof Adoption> | null>(null)
const connection = ref('')
let epoch = 0
let mounted = false
let controller = new AbortController()
let recovery: { adoptionId: string, expectedRecoveryId: string | null, recoveryId: string } | null
  = null
const endpoint = computed(
  () => `/api/${props.audience}/page-studio/sites/${encodeURIComponent(props.siteId)}`
)
const current = computed(() => steps[stage.value])
const complete = computed(() => stage.value === steps.length)
const primaryLabel = computed(() => {
  if (adoption.value?.recoveryRequired) return 'Resume with this sign-in'
  if (stage.value === 4 && adoption.value?.phase !== 'idle') return 'Continue activation'
  return current.value?.action ?? 'CMS ready'
})
const canAdvance = computed(() => {
  if (busy.value || needsRefresh.value || complete.value || stage.value === 0) return false
  if (stage.value === 4) return Boolean(adoption.value)
  return setup.value?.canConfigure && !['disabled', 'reconciliation'].includes(setup.value.status)
})
const detail = computed(() => {
  if (complete.value)
    return 'CMS is ready for custom components and actions. You can return to Studio when your current edits are saved.'
  if (setup.value?.status === 'reconciliation')
    return 'Preparation belongs to a previous sign-in and needs agency reconciliation. This sign-in cannot replace its original request.'
  if (setup.value?.status === 'disabled')
    return 'Preparation is disabled. Ask your agency to review this website’s setup.'
  if (adoption.value?.recoveryRequired)
    return (
      adoption.value.recoveryReason
      ?? 'Explicitly resume activation with this sign-in before continuing.'
    )
  if (stage.value === 0)
    return connection.value === 'connected'
      ? 'Checking preparation…'
      : 'Connect CMS using the control above, then refresh this status.'
  if (stage.value === 4) {
    const count = adoption.value?.progress?.consumed
    return count === undefined
      ? 'Activation temporarily pauses website saves. Your unsaved edits stay in this browser. Each click completes one step.'
      : `${count} saved items checked. Continue activation one step at a time; your unsaved edits stay in this browser.`
  }
  return 'Complete the preparation steps in order. This uses your current sign-in and does not publish the website.'
})
function errorMessage(error: unknown) {
  const value = error as { statusCode?: number, status?: number, data?: { statusMessage?: string } }
  const status = value?.statusCode ?? value?.status
  if (status === 401)
    return 'Your sign-in expired. Sign in again, then refresh status. Existing preparation may need agency reconciliation.'
  if (status === 403)
    return 'This sign-in cannot prepare this website. Ask an authorised agency or client administrator.'
  if (status === 503)
    return 'A reviewed website runtime is not available for this step yet. Your current content and unsaved edits are preserved.'
  return 'The setup result could not be confirmed. Refresh status before attempting another step.'
}
async function readStatus(base: string, turn: number) {
  const request = (path: string) =>
    nativeFetch<unknown>(`${base}/${path}`, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
      timeout: 30_000
    })
  // Once native adoption starts, ordinary content/setup reads are fenced.
  // Its own policy-only status remains available for explicit recovery.
  const active = Adoption.parse(await request('cms-adoption'))
  if (turn !== epoch) return
  adoption.value = active
  if (active.phase !== 'idle') {
    setup.value = null
    stage.value = active.phase === 'managed' ? steps.length : 4
    if (
      recovery
      && (active.adoptionId !== recovery.adoptionId
        || active.recoveryId !== recovery.expectedRecoveryId)
    )
      recovery = null
    return
  }
  const connected = z
    .object({
      status: z.enum([
        'connected',
        'unconnected',
        'connecting',
        'retry',
        'disabled',
        'reconciliation'
      ])
    })
    .parse(await request('content-connection'))
  if (turn !== epoch) return
  connection.value = connected.status
  stage.value = 0
  setup.value = null
  adoption.value = null
  if (connected.status !== 'connected') return
  for (let index = 1; index < 4; index++) {
    stage.value = index
    const status = Setup.parse(await request(`${steps[index]!.kind}/setup`))
    if (turn !== epoch) return
    setup.value = status
    if (status.status !== 'installed') return
  }
  setup.value = null
  stage.value = 4
  const status = Adoption.parse(await request('cms-adoption'))
  if (turn !== epoch) return
  adoption.value = status
  if (
    recovery
    && (status.adoptionId !== recovery.adoptionId || status.recoveryId !== recovery.expectedRecoveryId)
  )
    recovery = null
  if (status.phase === 'managed') stage.value = steps.length
}
async function refresh() {
  if (busy.value) return
  const turn = epoch,
    base = endpoint.value
  busy.value = true
  failure.value = ''
  try {
    await readStatus(base, turn)
    if (turn === epoch) needsRefresh.value = false
  } catch (error) {
    if (turn === epoch) {
      failure.value = errorMessage(error)
      needsRefresh.value = true
    }
  } finally {
    if (turn === epoch) busy.value = false
  }
}
function physicalRequestId(kind: string) {
  if (setup.value?.requestId) return setup.value.requestId
  // Match existing collections setup so lost acknowledgements retain one intent.
  const segment = kind === 'collections' ? 'collection' : kind
  const key = `page-studio-${segment}-setup:${props.audience}:${props.siteId}`
  const stored = localStorage.getItem(key)
  if (stored && z.uuid().safeParse(stored).success) return stored
  const requestId = crypto.randomUUID()
  localStorage.setItem(key, requestId)
  return requestId
}
function nextRequest(): { path: string, body: Record<string, unknown> } {
  if (stage.value !== 4) {
    const kind = current.value!.kind
    return { path: `${kind}/setup`, body: { requestId: physicalRequestId(kind) } }
  }
  const status = adoption.value!
  if (status.recoveryRequired) {
    if (!status.adoptionId) throw new Error('Missing activation identity')
    recovery ??= {
      adoptionId: status.adoptionId,
      expectedRecoveryId: status.recoveryId,
      recoveryId: `recovery_${crypto.randomUUID()}`
    }
    return { path: 'cms-adoption', body: { action: 'recover', ...recovery } }
  }
  if (status.phase === 'idle') return { path: 'cms-adoption', body: { action: 'start' } }
  if (!status.adoptionId) throw new Error('Missing activation identity')
  return {
    path: 'cms-adoption',
    body: {
      action: 'advance',
      adoptionId: status.adoptionId,
      expectedProgressDigest: status.progressDigest
    }
  }
}
async function advance() {
  if (!canAdvance.value) return
  const turn = epoch,
    base = endpoint.value
  busy.value = true
  failure.value = ''
  try {
    const request = nextRequest()
    await nativeFetch(`${base}/${request.path}`, {
      method: 'POST',
      body: request.body,
      credentials: 'same-origin',
      redirect: 'error',
      signal: controller.signal,
      timeout: 30_000
    })
    if (turn !== epoch) return
    await readStatus(base, turn)
    if (turn === epoch) needsRefresh.value = false
  } catch (error) {
    if (turn === epoch) {
      failure.value = errorMessage(error)
      needsRefresh.value = true
    }
  } finally {
    if (turn === epoch) busy.value = false
  }
}
function reset() {
  epoch++
  controller.abort()
  controller = new AbortController()
  busy.value = false
  needsRefresh.value = true
  failure.value = ''
  stage.value = 0
  setup.value = null
  adoption.value = null
  recovery = null
  if (mounted) refresh()
}
watch(() => [props.audience, props.siteId], reset)
onMounted(() => {
  mounted = true
  refresh()
})
onBeforeUnmount(() => {
  mounted = false
  epoch++
  controller.abort()
})
</script>

<template>
  <UCard class="mb-6" aria-label="Prepare website CMS">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-highlighted">
          Prepare your website CMS
        </h2>
        <UBadge
          v-if="complete"
          label="Ready"
          color="success"
          variant="subtle"
        />
      </div>
    </template>
    <ol class="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Setup progress">
      <li
        v-for="(step, index) in steps"
        :key="step.kind"
        :aria-current="index === stage ? 'step' : undefined"
        :class="index <= stage ? 'text-highlighted' : 'text-muted'"
      >
        <span class="mr-1 font-medium">{{ index < stage ? '✓' : `${index + 1}.` }}</span>{{ step.label }}
      </li>
    </ol>
    <p class="max-w-3xl text-sm text-muted" role="status" aria-live="polite">
      {{ detail }}
    </p>
    <UAlert
      v-if="failure"
      class="mt-4"
      title="Setup needs attention"
      :description="failure"
      color="warning"
      variant="subtle"
    />
    <template #footer>
      <div class="flex flex-wrap gap-3">
        <UButton
          v-if="!complete && stage > 0"
          :label="primaryLabel"
          :disabled="!canAdvance"
          :loading="busy"
          @click="advance"
        />
        <UButton
          label="Refresh status"
          color="neutral"
          variant="outline"
          :loading="busy"
          :disabled="busy"
          @click="refresh"
        />
      </div>
    </template>
  </UCard>
</template>
