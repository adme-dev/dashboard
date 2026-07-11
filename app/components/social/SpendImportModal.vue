<script setup lang="ts">
const props = defineProps<{
  open: boolean
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: []
}>()

const toast = useToast()
const { importCsvSpend, importManualSpend } = useSocialConnections()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const isOpen = computed({
  get: () => props.open,
  set: (val: boolean) => emit('update:open', val),
})

const mode = ref<'csv' | 'manual'>('csv')
const selectedPlatform = ref('meta')
const now = new Date()
const selectedMonth = ref(now.getMonth() + 1)
const selectedYear = ref(now.getFullYear())
const importing = ref(false)

// CSV mode state
const csvFile = ref<File | null>(null)
const csvPreview = ref<string[][]>([])
const dragOver = ref(false)

// Manual mode state
const manualForm = ref({
  campaignName: '',
  date: '',
  spend: '',
  impressions: '',
  clicks: '',
  conversions: '',
})

// Import result
const importResult = ref<{ imported: number; skipped: number; errors: string[] } | null>(null)

const platformOptions = [
  { label: 'Meta Ads', value: 'meta' },
  { label: 'Google Ads', value: 'google' },
  { label: 'TikTok Ads', value: 'tiktok' },
  { label: 'LinkedIn Ads', value: 'linkedin' },
  { label: 'Pinterest Ads', value: 'pinterest' },
  { label: 'Snapchat Ads', value: 'snapchat' },
  { label: 'X (Twitter) Ads', value: 'twitter' },
  { label: 'Microsoft Ads', value: 'microsoft_ads' },
  { label: 'Other', value: 'other' },
]

const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: new Date(2024, i).toLocaleString('en', { month: 'long' }),
  value: i + 1,
}))

const yearOptions = Array.from({ length: 5 }, (_, i) => ({
  label: String(now.getFullYear() - 2 + i),
  value: now.getFullYear() - 2 + i,
}))

const period = computed(() => `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`)

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.[0]) {
    processFile(input.files[0])
  }
}

function handleDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file && file.name.endsWith('.csv')) {
    processFile(file)
  }
}

function processFile(file: File) {
  csvFile.value = file
  importResult.value = null

  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    csvPreview.value = lines.slice(0, 11).map(line => {
      // Simple CSV parse for preview
      const fields: string[] = []
      let current = ''
      let inQuotes = false
      for (const ch of line) {
        if (inQuotes) {
          if (ch === '"') inQuotes = false
          else current += ch
        } else if (ch === '"') {
          inQuotes = true
        } else if (ch === ',') {
          fields.push(current.trim())
          current = ''
        } else {
          current += ch
        }
      }
      fields.push(current.trim())
      return fields
    })
  }
  reader.readAsText(file)
}

function clearFile() {
  csvFile.value = null
  csvPreview.value = []
  importResult.value = null
}

async function downloadTemplate() {
  try {
    const csv = await apiFetch<string>('/api/agency/social/import/template')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'spend-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to download template', color: 'error' })
  }
}

async function handleCsvImport() {
  if (!csvFile.value) return
  importing.value = true
  importResult.value = null
  try {
    const result = await importCsvSpend(csvFile.value, selectedPlatform.value, period.value)
    importResult.value = result
    if (result.imported > 0) {
      toast.add({
        title: 'Import complete',
        description: `${result.imported} rows imported${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`,
        color: 'success',
      })
      emit('imported')
    } else {
      toast.add({
        title: 'No data imported',
        description: result.errors?.[0] || 'All rows were skipped',
        color: 'warning',
      })
    }
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    importing.value = false
  }
}

async function handleManualImport() {
  const { campaignName, date, spend } = manualForm.value
  if (!campaignName || !date || !spend) return

  importing.value = true
  try {
    await importManualSpend({
      platform: selectedPlatform.value,
      campaignName,
      date,
      spend: parseFloat(spend),
      impressions: manualForm.value.impressions ? parseInt(manualForm.value.impressions) : undefined,
      clicks: manualForm.value.clicks ? parseInt(manualForm.value.clicks) : undefined,
      conversions: manualForm.value.conversions ? parseInt(manualForm.value.conversions) : undefined,
      period: period.value,
    })
    toast.add({ title: 'Entry added', description: `${campaignName} — $${parseFloat(spend).toLocaleString()}`, color: 'success' })
    emit('imported')
    // Reset form
    manualForm.value = { campaignName: '', date: '', spend: '', impressions: '', clicks: '', conversions: '' }
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    importing.value = false
  }
}

function resetState() {
  csvFile.value = null
  csvPreview.value = []
  importResult.value = null
  manualForm.value = { campaignName: '', date: '', spend: '', impressions: '', clicks: '', conversions: '' }
}

watch(isOpen, (val) => {
  if (!val) resetState()
})
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">Import Spend Data</h3>
            <p class="text-sm text-muted mt-0.5">Upload CSV or enter manually for any platform</p>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="isOpen = false" />
        </div>

        <!-- Platform & Period -->
        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-medium text-muted mb-1.5 block">Platform</label>
            <USelectMenu
              v-model="selectedPlatform"
              :items="platformOptions"
              value-key="value"
              size="sm"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-muted mb-1.5 block">Month</label>
            <USelectMenu
              v-model="selectedMonth"
              :items="monthOptions"
              value-key="value"
              size="sm"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-muted mb-1.5 block">Year</label>
            <USelectMenu
              v-model="selectedYear"
              :items="yearOptions"
              value-key="value"
              size="sm"
            />
          </div>
        </div>

        <!-- Mode Toggle -->
        <div class="inline-flex items-center p-0.5 rounded-lg bg-elevated/50 border border-default gap-0.5">
          <UButton
            size="xs"
            :variant="mode === 'csv' ? 'soft' : 'ghost'"
            :color="mode === 'csv' ? 'primary' : 'neutral'"
            icon="i-lucide-file-spreadsheet"
            @click="mode = 'csv'"
          >
            CSV Upload
          </UButton>
          <UButton
            size="xs"
            :variant="mode === 'manual' ? 'soft' : 'ghost'"
            :color="mode === 'manual' ? 'primary' : 'neutral'"
            icon="i-lucide-pen-line"
            @click="mode = 'manual'"
          >
            Manual Entry
          </UButton>
        </div>

        <!-- CSV Upload Mode -->
        <template v-if="mode === 'csv'">
          <!-- Drop Zone -->
          <div
            v-if="!csvFile"
            class="border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
            :class="dragOver ? 'border-primary bg-primary/5' : 'border-default hover:border-primary/50'"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="handleDrop"
            @click="($refs.fileInput as HTMLInputElement)?.click()"
          >
            <input ref="fileInput" type="file" accept=".csv" class="hidden" @change="handleFileSelect">
            <UIcon name="i-lucide-upload-cloud" class="w-8 h-8 text-muted mx-auto mb-3" />
            <p class="text-sm font-medium">Drop a CSV file here or click to browse</p>
            <p class="text-xs text-muted mt-1">Requires columns: date, campaign_name, spend</p>
          </div>

          <!-- File Selected -->
          <div v-else class="space-y-3">
            <div class="flex items-center justify-between rounded-lg bg-elevated/50 border border-default px-4 py-2.5">
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-file-text" class="w-4 h-4 text-muted" />
                <span class="text-sm font-medium">{{ csvFile.name }}</span>
                <UBadge variant="subtle" size="xs">{{ csvPreview.length - 1 }} rows</UBadge>
              </div>
              <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="clearFile" />
            </div>

            <!-- Preview Table -->
            <div v-if="csvPreview.length > 1" class="rounded-lg border border-default overflow-hidden">
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="bg-elevated/50">
                      <th v-for="(h, idx) in csvPreview[0]" :key="idx" class="px-3 py-2 text-left font-medium text-muted whitespace-nowrap">
                        {{ h }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, rIdx) in csvPreview.slice(1, 6)" :key="rIdx" class="border-t border-default/50">
                      <td v-for="(cell, cIdx) in row" :key="cIdx" class="px-3 py-1.5 whitespace-nowrap">
                        {{ cell }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="csvPreview.length > 6" class="px-3 py-1.5 text-xs text-muted border-t border-default/50">
                ... and {{ csvPreview.length - 6 }} more rows
              </div>
            </div>
          </div>

          <!-- Import Result -->
          <div v-if="importResult" class="rounded-lg border px-4 py-3 space-y-1.5" :class="importResult.errors.length ? 'border-warning/30 bg-warning/5' : 'border-success/30 bg-success/5'">
            <p class="text-sm font-medium">
              {{ importResult.imported }} imported, {{ importResult.skipped }} skipped
            </p>
            <div v-if="importResult.errors.length" class="space-y-0.5">
              <p v-for="(err, idx) in importResult.errors.slice(0, 5)" :key="idx" class="text-xs text-muted">
                {{ err }}
              </p>
              <p v-if="importResult.errors.length > 5" class="text-xs text-muted">
                ... and {{ importResult.errors.length - 5 }} more errors
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-between pt-2">
            <UButton variant="ghost" color="neutral" size="sm" icon="i-lucide-download" @click="downloadTemplate">
              Download Template
            </UButton>
            <div class="flex items-center gap-2">
              <UButton variant="ghost" color="neutral" @click="isOpen = false">Cancel</UButton>
              <UButton color="primary" :loading="importing" :disabled="!csvFile" @click="handleCsvImport">
                Import {{ csvPreview.length > 1 ? `${csvPreview.length - 1} rows` : '' }}
              </UButton>
            </div>
          </div>
        </template>

        <!-- Manual Entry Mode -->
        <template v-if="mode === 'manual'">
          <div class="space-y-3">
            <div>
              <label class="text-xs font-medium text-muted mb-1.5 block">Campaign Name</label>
              <UInput v-model="manualForm.campaignName" placeholder="e.g. Brand Awareness Q1" size="sm" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-xs font-medium text-muted mb-1.5 block">Date</label>
                <UInput v-model="manualForm.date" type="date" size="sm" />
              </div>
              <div>
                <label class="text-xs font-medium text-muted mb-1.5 block">Spend ($)</label>
                <UInput v-model="manualForm.spend" type="number" step="0.01" min="0" placeholder="0.00" size="sm" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="text-xs font-medium text-muted mb-1.5 block">Impressions</label>
                <UInput v-model="manualForm.impressions" type="number" min="0" placeholder="Optional" size="sm" />
              </div>
              <div>
                <label class="text-xs font-medium text-muted mb-1.5 block">Clicks</label>
                <UInput v-model="manualForm.clicks" type="number" min="0" placeholder="Optional" size="sm" />
              </div>
              <div>
                <label class="text-xs font-medium text-muted mb-1.5 block">Conversions</label>
                <UInput v-model="manualForm.conversions" type="number" min="0" placeholder="Optional" size="sm" />
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="isOpen = false">Cancel</UButton>
            <UButton
              color="primary"
              :loading="importing"
              :disabled="!manualForm.campaignName || !manualForm.date || !manualForm.spend"
              @click="handleManualImport"
            >
              Add Entry
            </UButton>
          </div>
        </template>
      </div>
    </template>
  </UModal>
</template>
