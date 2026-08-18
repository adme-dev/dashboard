<script setup lang="ts">
const props = defineProps<{
  ruleId: string
  formMeta: { source: string, form_id: string, form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ fired: [] }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const overrides = ref<{ key: string, value: string }[]>([])
const contextOverrides = reactive({
  campaign_id: '',
  campaign_name: '',
  ad_id: '',
  ad_name: '',
  page_id: '',
})
const running = ref(false)
interface TestFireResultItem {
  id: string
  type?: string
  status?: string
  skipped?: string
  error?: string
}

interface TestFireResult {
  results: TestFireResultItem[]
}

const result = ref<TestFireResult | null>(null)

const resultSummary = computed(() => {
  const results = result.value?.results ?? []
  return {
    delivered: results.filter(r => r.status === 'delivered').length,
    failed: results.filter(r => r.status === 'failed' || r.error).length,
    skipped: results.filter(r => r.skipped).length,
    total: results.length
  }
})

function errorMessage(e: unknown): string {
  return e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? ''
    : ''
}

function addOverride() {
  overrides.value.push({ key: '', value: '' })
}

function removeOverride(index: number) {
  overrides.value.splice(index, 1)
}

function closePanel() {
  open.value = false
}

async function run() {
  running.value = true
  try {
    const field_data: Record<string, string> = {}
    for (const o of overrides.value) {
      if (o.key) field_data[o.key] = o.value
    }
    result.value = await apiFetch<TestFireResult>(`/api/leads/rules/${props.ruleId}/test-fire`, {
      method: 'POST',
      body: {
        field_data,
        ...Object.fromEntries(
          Object.entries(contextOverrides).map(([key, value]) => [key, value.trim() || null]),
        ),
      }
    })
    toast.add({ title: 'Test fired', color: 'success' })
    emit('fired')
  } catch (e: unknown) {
    toast.add({ title: 'Test failed', description: errorMessage(e), color: 'error' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">
          Test fire — {{ formMeta.form_name || formMeta.form_id }}
        </h3>
        <p class="text-xs text-muted">
          Sends a synthetic lead through this rule so the team can verify AutoGate, Slack, email,
          webhooks, Sheets, portal visibility, and assignment before enabling live delivery.
        </p>
        <div class="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-muted">
          Test fire calls destination adapters but does not persist a lead in the inbox.
        </div>

        <div class="@container space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Campaign and ad context (optional)
          </h4>
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Campaign ID">
              <UInput v-model="contextOverrides.campaign_id" class="w-full" placeholder="120244032522920320" />
            </UFormField>
            <UFormField label="Campaign name">
              <UInput v-model="contextOverrides.campaign_name" class="w-full" placeholder="Northern EV Centre" />
            </UFormField>
            <UFormField label="Ad ID">
              <UInput v-model="contextOverrides.ad_id" class="w-full" placeholder="Meta ad ID" />
            </UFormField>
            <UFormField label="Ad name">
              <UInput v-model="contextOverrides.ad_name" class="w-full" placeholder="Meta ad name" />
            </UFormField>
            <UFormField label="Facebook Page ID" class="@lg:col-span-2">
              <UInput v-model="contextOverrides.page_id" class="w-full" placeholder="377100258985904" />
            </UFormField>
          </div>

          <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
            Lead field overrides (optional)
          </h4>
          <div v-for="(o, i) in overrides" :key="i" class="flex items-center gap-2">
            <UInput v-model="o.key" placeholder="key" class="w-40" />
            <UInput v-model="o.value" placeholder="value" class="flex-1" />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              aria-label="Remove override"
              @click="removeOverride(i)"
            />
          </div>
          <UButton
            icon="i-lucide-plus"
            variant="ghost"
            size="sm"
            @click="addOverride"
          >
            Add override
          </UButton>
        </div>

        <UButton
          :loading="running"
          icon="i-lucide-flask-conical"
          color="primary"
          @click="run"
        >
          Run test fire
        </UButton>

        <div v-if="result" class="space-y-2">
          <div class="grid grid-cols-4 gap-2">
            <div class="rounded border border-default p-2">
              <p class="text-[11px] text-muted">
                Total
              </p>
              <p class="text-sm font-semibold">
                {{ resultSummary.total }}
              </p>
            </div>
            <div class="rounded border border-default p-2">
              <p class="text-[11px] text-muted">
                Delivered
              </p>
              <p class="text-sm font-semibold">
                {{ resultSummary.delivered }}
              </p>
            </div>
            <div class="rounded border border-default p-2">
              <p class="text-[11px] text-muted">
                Skipped
              </p>
              <p class="text-sm font-semibold">
                {{ resultSummary.skipped }}
              </p>
            </div>
            <div class="rounded border border-default p-2">
              <p class="text-[11px] text-muted">
                Failed
              </p>
              <p class="text-sm font-semibold">
                {{ resultSummary.failed }}
              </p>
            </div>
          </div>
          <h4 class="text-xs font-semibold uppercase text-muted">
            Per-destination results
          </h4>
          <ul class="space-y-1">
            <li v-for="r in result.results" :key="r.id" class="border border-default rounded p-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs">{{ r.type ?? 'unknown' }}</span>
                <UBadge
                  :color="r.skipped ? 'neutral' : r.status === 'delivered' ? 'success' : 'error'"
                  variant="soft"
                  size="xs"
                >
                  {{ r.skipped ? 'skipped:' + r.skipped : r.status }}
                </UBadge>
              </div>
              <p v-if="r.error" class="text-xs text-error mt-1 break-words">
                {{ r.error }}
              </p>
            </li>
          </ul>
        </div>

        <div class="flex justify-end pt-2 border-t border-default">
          <UButton variant="ghost" @click="closePanel">
            Close
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
