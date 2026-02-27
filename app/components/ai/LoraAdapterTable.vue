<script setup lang="ts">
import type { AiLoraAdapter, AiTrainingDataset, LoraAdapterType, LoraMetricsComparison } from '~/types'

const toast = useToast()

// Data fetching
const { data, pending, refresh } = useFetch('/api/agency/ai/training/adapters')
const adapters = computed(() => (Array.isArray(data.value) ? data.value : []) as AiLoraAdapter[])

// Ready datasets for the form selector
const { data: datasetsData } = useFetch('/api/agency/ai/training/datasets')
const readyDatasets = computed(() => {
  const datasets = ((datasetsData.value as any)?.items || []) as AiTrainingDataset[]
  return datasets
    .filter(d => d.status === 'ready')
    .map(d => ({ label: `${d.datasetType} v${d.version} (${d.rowCount} rows)`, value: d.id }))
})

// Table columns
const columns = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'adapterType', header: 'Type' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'trafficPct', header: 'Traffic %' },
  { accessorKey: 'version', header: 'Version' },
  { accessorKey: 'createdAt', header: 'Created' },
  { accessorKey: 'actions', header: '' },
]

const typeBadgeColor = (type: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
    chat: 'primary',
    intent: 'warning',
    rag: 'success',
  }
  return colors[type] || 'neutral'
}

const statusBadgeColor = (status: string): 'primary' | 'success' | 'warning' | 'error' | 'neutral' => {
  const colors: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'neutral'> = {
    active: 'success',
    testing: 'warning',
    pending: 'neutral',
    uploading: 'warning',
    retired: 'neutral',
    failed: 'error',
  }
  return colors[status] || 'neutral'
}

// Register Adapter Modal
const showRegisterModal = ref(false)
const saving = ref(false)
const form = ref({
  name: '',
  displayName: '',
  adapterType: 'chat' as LoraAdapterType,
  rank: 16,
  datasetId: 'none',
})

const adapterTypeOptions = [
  { label: 'Chat', value: 'chat' },
  { label: 'Intent', value: 'intent' },
  { label: 'RAG', value: 'rag' },
]

const openRegisterModal = () => {
  form.value = { name: '', displayName: '', adapterType: 'chat', rank: 16, datasetId: 'none' }
  showRegisterModal.value = true
}

const registerAdapter = async () => {
  if (!form.value.name) {
    toast.add({ title: 'Name is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    const body = {
      ...form.value,
      datasetId: form.value.datasetId === 'none' ? '' : form.value.datasetId,
    }
    await $fetch('/api/agency/ai/training/adapters', {
      method: 'POST',
      body,
    })
    toast.add({ title: 'Adapter registered', color: 'success' })
    showRegisterModal.value = false
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Failed to register adapter',
      description: error.data?.statusMessage || error.message,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

// Inline traffic % edit
const editingTraffic = ref<string | null>(null)
const trafficValue = ref(0)

const startTrafficEdit = (adapter: AiLoraAdapter) => {
  editingTraffic.value = adapter.id
  trafficValue.value = adapter.trafficPct
}

const saveTraffic = async (adapter: AiLoraAdapter) => {
  try {
    await $fetch(`/api/agency/ai/training/adapters/${adapter.id}`, {
      method: 'PUT',
      body: { trafficPct: trafficValue.value },
    })
    toast.add({ title: 'Traffic updated', color: 'success' })
    editingTraffic.value = null
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Failed to update traffic', description: error.data?.statusMessage || error.message, color: 'error' })
  }
}

// Status actions
const updateStatus = async (adapter: AiLoraAdapter, status: string) => {
  try {
    await $fetch(`/api/agency/ai/training/adapters/${adapter.id}`, {
      method: 'PUT',
      body: { status },
    })
    toast.add({ title: `Adapter ${status}`, color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({ title: 'Failed to update status', description: error.data?.statusMessage || error.message, color: 'error' })
  }
}

// File upload
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadingAdapter = ref<string | null>(null)

const triggerUpload = (adapterId: string) => {
  uploadingAdapter.value = adapterId
  fileInputRef.value?.click()
}

const onFileSelected = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file || !uploadingAdapter.value) return

  try {
    const formData = new FormData()
    formData.append('file', file)
    await $fetch(`/api/agency/ai/training/adapters/${uploadingAdapter.value}/upload`, {
      method: 'POST',
      body: formData,
    })
    toast.add({ title: 'Adapter weights uploaded', color: 'success' })
    refresh()
  } catch (error: any) {
    toast.add({
      title: 'Upload failed',
      description: error.data?.statusMessage || error.message,
      color: 'error',
    })
  } finally {
    uploadingAdapter.value = null
    target.value = ''
  }
}

// Metrics modal
const showMetricsModal = ref(false)
const selectedAdapter = ref<AiLoraAdapter | null>(null)
const { data: metricsData, refresh: refreshMetrics } = useFetch(
  () => selectedAdapter.value ? `/api/agency/ai/training/adapters/${selectedAdapter.value.id}/metrics` : null as any,
  { immediate: false }
)

const viewMetrics = (adapter: AiLoraAdapter) => {
  selectedAdapter.value = adapter
  showMetricsModal.value = true
  refreshMetrics()
}

const metrics = computed(() => metricsData.value as LoraMetricsComparison | null)
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <p class="text-sm text-[var(--ui-text-muted)]">Manage LoRA adapters for fine-tuned AI models</p>
      <UButton
        label="Register Adapter"
        icon="i-lucide-plus"
        color="primary"
        @click="openRegisterModal"
      />
    </div>

    <!-- Hidden file input for uploads -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".safetensors"
      class="hidden"
      @change="onFileSelected"
    >

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
    </div>

    <!-- Table -->
    <UCard v-else>
      <UTable :data="adapters" :columns="columns">
        <template #name-cell="{ row }">
          <div>
            <p class="font-medium">{{ row.original.displayName || row.original.name }}</p>
            <p v-if="row.original.displayName" class="text-xs text-[var(--ui-text-muted)]">{{ row.original.name }}</p>
          </div>
        </template>

        <template #adapterType-cell="{ row }">
          <UBadge :color="typeBadgeColor(row.original.adapterType)" variant="subtle">
            {{ row.original.adapterType }}
          </UBadge>
        </template>

        <template #status-cell="{ row }">
          <UBadge :color="statusBadgeColor(row.original.status)" variant="subtle">
            {{ row.original.status }}
          </UBadge>
        </template>

        <template #trafficPct-cell="{ row }">
          <div class="flex items-center gap-1">
            <template v-if="editingTraffic === row.original.id">
              <UInput
                v-model.number="trafficValue"
                type="number"
                :min="0"
                :max="100"
                size="xs"
                class="w-16"
                @keyup.enter="saveTraffic(row.original)"
              />
              <UButton icon="i-lucide-check" variant="ghost" color="success" size="xs" @click="saveTraffic(row.original)" />
              <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="editingTraffic = null" />
            </template>
            <template v-else>
              <span class="font-medium">{{ row.original.trafficPct }}%</span>
              <UButton
                icon="i-lucide-edit"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="startTrafficEdit(row.original)"
              />
            </template>
          </div>
        </template>

        <template #version-cell="{ row }">
          <span class="font-mono text-sm">v{{ row.original.version }}</span>
        </template>

        <template #createdAt-cell="{ row }">
          <span class="text-sm text-[var(--ui-text-muted)]">
            {{ new Date(row.original.createdAt).toLocaleDateString() }}
          </span>
        </template>

        <template #actions-cell="{ row }">
          <UDropdownMenu
            :items="[
              [{
                label: 'View Metrics',
                icon: 'i-lucide-bar-chart-3',
                click: () => viewMetrics(row.original),
              }],
              [{
                label: 'Upload Weights',
                icon: 'i-lucide-upload',
                click: () => triggerUpload(row.original.id),
              }],
              [{
                label: 'Activate',
                icon: 'i-lucide-play',
                disabled: row.original.status === 'active',
                click: () => updateStatus(row.original, 'active'),
              },
              {
                label: 'Retire',
                icon: 'i-lucide-archive',
                disabled: row.original.status === 'retired',
                click: () => updateStatus(row.original, 'retired'),
              }],
            ]"
          >
            <UButton icon="i-lucide-more-horizontal" variant="ghost" color="neutral" size="xs" />
          </UDropdownMenu>
        </template>
      </UTable>
    </UCard>

    <!-- Register Adapter Modal -->
    <UModal v-model:open="showRegisterModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">Register LoRA Adapter</h3>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Name</label>
            <UInput v-model="form.name" placeholder="e.g. agency-chat-v1" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Display Name</label>
            <UInput v-model="form.displayName" placeholder="e.g. Agency Chat Adapter v1" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Type</label>
            <USelectMenu
              v-model="form.adapterType"
              :items="adapterTypeOptions"
              value-key="value"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Rank (1-32)</label>
            <UInput v-model.number="form.rank" type="number" :min="1" :max="32" />
          </div>

          <div>
            <label class="block text-sm font-medium text-[var(--ui-text)] mb-1.5">Dataset</label>
            <USelectMenu
              v-model="form.datasetId"
              :items="[{ label: 'None', value: 'none' }, ...readyDatasets]"
              value-key="value"
              class="w-full"
            />
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="showRegisterModal = false" />
            <UButton
              label="Register"
              color="primary"
              :loading="saving"
              @click="registerAdapter"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Metrics Modal -->
    <UModal v-model:open="showMetricsModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold text-[var(--ui-text-highlighted)]">
            Metrics: {{ selectedAdapter?.displayName || selectedAdapter?.name }}
          </h3>

          <div v-if="metrics" class="grid grid-cols-2 gap-4">
            <UCard>
              <div class="text-center">
                <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase mb-2">LoRA Adapter</p>
                <div class="space-y-2">
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Avg Latency</p>
                    <p class="text-lg font-bold">{{ metrics.lora.avgLatencyMs.toFixed(0) }}ms</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Avg Rating</p>
                    <p class="text-lg font-bold">{{ metrics.lora.avgRating.toFixed(2) }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Error Rate</p>
                    <p class="text-lg font-bold">{{ (metrics.lora.errorRate * 100).toFixed(1) }}%</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Samples</p>
                    <p class="text-lg font-bold">{{ metrics.lora.sampleCount }}</p>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-xs font-medium text-[var(--ui-text-muted)] uppercase mb-2">Base Model</p>
                <div class="space-y-2">
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Avg Latency</p>
                    <p class="text-lg font-bold">{{ metrics.base.avgLatencyMs.toFixed(0) }}ms</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Avg Rating</p>
                    <p class="text-lg font-bold">{{ metrics.base.avgRating.toFixed(2) }}</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Error Rate</p>
                    <p class="text-lg font-bold">{{ (metrics.base.errorRate * 100).toFixed(1) }}%</p>
                  </div>
                  <div>
                    <p class="text-xs text-[var(--ui-text-muted)]">Samples</p>
                    <p class="text-lg font-bold">{{ metrics.base.sampleCount }}</p>
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <div v-else class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="w-6 h-6 animate-spin text-primary-500" />
          </div>

          <div class="flex justify-end pt-2">
            <UButton label="Close" variant="ghost" color="neutral" @click="showMetricsModal = false" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
