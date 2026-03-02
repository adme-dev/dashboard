<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'

const props = defineProps<{ projectId: string }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()

// Fetch existing A/B tests
const { data: tests, refresh } = useFetch<any[]>(
  () => `/api/agency/banner-studio/ab-tests?projectId=${props.projectId}`,
  { default: () => [] },
)

// Fetch published banners (for variant selection)
const { data: published } = useFetch<any[]>(
  () => `/api/agency/banner-studio/published/by-project/${props.projectId}`,
  { default: () => [] },
)

// Create test form
const showCreate = ref(false)
const testName = ref('')
const testFormat = ref('')
const selectedVariants = ref<string[]>([])
const isCreating = ref(false)

const availableFormats = computed(() => {
  const fks = new Set((published.value || []).map((p: any) => p.formatKey))
  return Array.from(fks)
})

const variantsForFormat = computed(() =>
  (published.value || []).filter((p: any) => p.formatKey === testFormat.value),
)

async function createTest() {
  if (!testName.value.trim() || !testFormat.value || selectedVariants.value.length < 2) return
  isCreating.value = true
  try {
    const weight = Math.round(100 / selectedVariants.value.length)
    const variants = selectedVariants.value.map((id, i) => ({
      variantId: id,
      label: `Variant ${String.fromCharCode(65 + i)}`,
      weight,
    }))

    await $fetch('/api/agency/banner-studio/ab-tests', {
      method: 'POST',
      body: {
        projectId: props.projectId,
        formatKey: testFormat.value,
        name: testName.value.trim(),
        variants,
      },
    })

    showCreate.value = false
    testName.value = ''
    testFormat.value = ''
    selectedVariants.value = []
    await refresh()
    toast.add({ title: 'Created', description: 'A/B test created', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create test', color: 'error' })
  } finally {
    isCreating.value = false
  }
}

// View test detail
const activeTestId = ref<string | null>(null)
const { data: activeTest, refresh: refreshTest } = useFetch<any>(
  () => activeTestId.value ? `/api/agency/banner-studio/ab-tests/${activeTestId.value}` : null,
  { default: () => null, watch: [activeTestId] },
)

async function updateTestStatus(testId: string, status: string) {
  try {
    await $fetch(`/api/agency/banner-studio/ab-tests/${testId}`, {
      method: 'PATCH',
      body: { status },
    })
    await refresh()
    if (activeTestId.value === testId) await refreshTest()
    toast.add({ title: 'Updated', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to update', color: 'error' })
  }
}

function statusColor(s: string): string {
  if (s === 'running') return 'success'
  if (s === 'paused') return 'warning'
  if (s === 'completed') return 'primary'
  return 'neutral'
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ width: 'max-w-2xl' }">
    <template #content>
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold">A/B Tests</h2>
          <div class="flex gap-2">
            <UButton
              v-if="!showCreate && !activeTestId"
              label="New Test"
              icon="i-lucide-plus"
              size="xs"
              @click="showCreate = true"
            />
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="open = false" />
          </div>
        </div>

        <!-- Create form -->
        <div v-if="showCreate" class="space-y-4 mb-6">
          <div class="bg-(--ui-bg) rounded-lg border border-(--ui-border) p-4 space-y-3">
            <div>
              <label class="text-xs text-(--ui-text-muted) block mb-1">Test Name</label>
              <UInput v-model="testName" size="sm" placeholder="e.g. CTA Color Test" />
            </div>

            <div>
              <label class="text-xs text-(--ui-text-muted) block mb-1">Format</label>
              <USelect
                v-model="testFormat"
                :items="availableFormats.map(fk => ({ label: FORMATS[fk]?.name || fk, value: fk }))"
                size="sm"
                placeholder="Select format"
              />
            </div>

            <div v-if="testFormat">
              <label class="text-xs text-(--ui-text-muted) block mb-1">
                Select Variants ({{ selectedVariants.length }}/{{ variantsForFormat.length }})
              </label>
              <div class="space-y-1">
                <label
                  v-for="pub in variantsForFormat"
                  :key="pub.id"
                  class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-(--ui-bg-elevated) cursor-pointer"
                >
                  <UCheckbox
                    :model-value="selectedVariants.includes(pub.id)"
                    @update:model-value="v => {
                      if (v) selectedVariants.push(pub.id)
                      else selectedVariants = selectedVariants.filter(id => id !== pub.id)
                    }"
                  />
                  <span class="text-xs">
                    v{{ pub.version }}
                    <span class="text-(--ui-text-muted) ml-1">{{ pub.formatKey }}</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <UButton label="Cancel" variant="ghost" size="xs" @click="showCreate = false" />
              <UButton
                label="Create Test"
                size="xs"
                :loading="isCreating"
                :disabled="!testName.trim() || !testFormat || selectedVariants.length < 2"
                @click="createTest"
              />
            </div>
          </div>
        </div>

        <!-- Test detail view -->
        <div v-else-if="activeTestId && activeTest" class="space-y-4">
          <div class="flex items-center gap-2 mb-2">
            <UButton icon="i-lucide-arrow-left" variant="ghost" size="xs" @click="activeTestId = null" />
            <h3 class="text-sm font-bold">{{ activeTest.name }}</h3>
            <UBadge :color="statusColor(activeTest.status)" variant="subtle" size="xs">{{ activeTest.status }}</UBadge>
          </div>

          <!-- Confidence indicator -->
          <div v-if="activeTest.confidence > 0" class="bg-(--ui-bg) rounded-lg border border-(--ui-border) p-3">
            <div class="flex items-center justify-between">
              <span class="text-xs text-(--ui-text-muted)">Statistical Confidence</span>
              <span class="text-sm font-bold" :class="activeTest.confidence >= 95 ? 'text-green-500' : 'text-(--ui-text)'">
                {{ activeTest.confidence }}%
              </span>
            </div>
            <div class="mt-1.5 h-1.5 rounded-full bg-(--ui-bg-elevated) overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="activeTest.confidence >= 95 ? 'bg-green-500' : activeTest.confidence >= 80 ? 'bg-yellow-500' : 'bg-(--ui-text-muted)'"
                :style="{ width: `${Math.min(100, activeTest.confidence)}%` }"
              />
            </div>
            <p v-if="activeTest.confidence >= 95" class="text-[10px] text-green-500 mt-1">
              Statistically significant — you can pick a winner
            </p>
          </div>

          <!-- Variant results -->
          <div class="space-y-2">
            <div
              v-for="(v, i) in activeTest.variants"
              :key="v.variantId"
              class="bg-(--ui-bg) rounded-lg border border-(--ui-border) p-3"
              :class="activeTest.winnerId === v.variantId ? 'ring-2 ring-green-500' : ''"
            >
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-bold">{{ v.label || `Variant ${String.fromCharCode(65 + i)}` }}</span>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-(--ui-text-muted)">{{ v.weight }}% traffic</span>
                  <UBadge v-if="activeTest.winnerId === v.variantId" color="success" size="xs">Winner</UBadge>
                </div>
              </div>
              <div class="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div class="text-xs text-(--ui-text-muted)">Impressions</div>
                  <div class="text-sm font-bold font-mono">{{ v.impressions?.toLocaleString() || 0 }}</div>
                </div>
                <div>
                  <div class="text-xs text-(--ui-text-muted)">Clicks</div>
                  <div class="text-sm font-bold font-mono">{{ v.clicks?.toLocaleString() || 0 }}</div>
                </div>
                <div>
                  <div class="text-xs text-(--ui-text-muted)">CTR</div>
                  <div class="text-sm font-bold font-mono">{{ v.ctr }}%</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex gap-2 justify-end">
            <UButton
              v-if="activeTest.status === 'draft'"
              label="Start Test"
              size="xs"
              color="success"
              @click="updateTestStatus(activeTest.id, 'running')"
            />
            <UButton
              v-if="activeTest.status === 'running'"
              label="Pause"
              size="xs"
              variant="soft"
              color="warning"
              @click="updateTestStatus(activeTest.id, 'paused')"
            />
            <UButton
              v-if="activeTest.status === 'paused'"
              label="Resume"
              size="xs"
              @click="updateTestStatus(activeTest.id, 'running')"
            />
            <UButton
              v-if="activeTest.status !== 'completed'"
              label="End Test"
              size="xs"
              variant="soft"
              @click="updateTestStatus(activeTest.id, 'completed')"
            />
          </div>
        </div>

        <!-- Test list -->
        <div v-else>
          <div v-if="!tests?.length" class="py-8 text-center">
            <UIcon name="i-lucide-split" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-2" />
            <p class="text-xs text-(--ui-text-muted)">No A/B tests yet</p>
            <p class="text-[10px] text-(--ui-text-muted) mt-1">Create a test to compare variant performance</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="t in tests"
              :key="t.id"
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-(--ui-border) hover:bg-(--ui-bg-elevated) cursor-pointer transition-colors"
              @click="activeTestId = t.id"
            >
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium truncate">{{ t.name }}</div>
                <div class="text-[10px] text-(--ui-text-muted)">
                  {{ FORMATS[t.formatKey]?.name || t.formatKey }} · {{ t.variants?.length || 0 }} variants
                </div>
              </div>
              <UBadge :color="statusColor(t.status)" variant="subtle" size="xs">{{ t.status }}</UBadge>
              <UIcon name="i-lucide-chevron-right" class="w-3.5 h-3.5 text-(--ui-text-muted)" />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
