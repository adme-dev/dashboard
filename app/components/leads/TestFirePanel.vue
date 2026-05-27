<script setup lang="ts">
const props = defineProps<{
  ruleId: string
  formMeta: { source: string, form_id: string, form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const overrides = ref<{ key: string, value: string }[]>([])
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

async function run() {
  running.value = true
  try {
    const field_data: Record<string, string> = {}
    for (const o of overrides.value) {
      if (o.key) field_data[o.key] = o.value
    }
    result.value = await $fetch<TestFireResult>(`/api/leads/rules/${props.ruleId}/test-fire`, {
      method: 'POST',
      body: { field_data }
    })
    toast.add({ title: 'Test fired', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Test failed', description: errorMessage(e), color: 'error' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ container: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">
          Test fire — {{ formMeta.form_name || formMeta.form_id }}
        </h3>
        <p class="text-xs text-muted">
          Sends a synthetic lead through this rule so the team can verify Slack, email, webhooks,
          Sheets, portal visibility, and assignment before disabling the matching Zap.
        </p>
        <div class="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-muted">
          Test fire calls destination adapters but does not persist a lead in the inbox.
        </div>

        <div class="space-y-2">
          <label class="text-xs text-muted">Field overrides (optional)</label>
          <div v-for="(o, i) in overrides" :key="i" class="flex items-center gap-2">
            <UInput v-model="o.key" placeholder="key" class="w-40" />
            <UInput v-model="o.value" placeholder="value" class="flex-1" />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              aria-label="Remove override"
              @click="overrides.splice(i, 1)"
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
          <UButton variant="ghost" @click="open = false">
            Close
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
