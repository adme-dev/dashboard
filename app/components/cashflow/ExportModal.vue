<script setup lang="ts">
interface ExportOptions {
  format: 'json' | 'csv' | 'excel'
  period: '30' | '60' | '90'
  includeScenarios: boolean
  includeWaterfall: boolean
  includeInvoices: boolean
}

const isOpen = defineModel<boolean>('open', { default: false })

const exportOptions = ref<ExportOptions>({
  format: 'csv',
  period: '90',
  includeScenarios: true,
  includeWaterfall: true,
  includeInvoices: true
})

const isExporting = ref(false)

const formatOptions = [
  { value: 'csv', label: 'CSV (Excel Compatible)', description: 'Comma-separated values for spreadsheet applications' },
  { value: 'excel', label: 'Excel Workbook', description: 'Multi-sheet Excel file with detailed data' },
  { value: 'json', label: 'JSON Data', description: 'Raw data format for developers and APIs' }
]

const periodOptions = [
  { value: '30', label: '30 Days', description: 'Next 30 days forecast' },
  { value: '60', label: '60 Days', description: 'Next 60 days forecast' },
  { value: '90', label: '90 Days', description: 'Next 90 days forecast' }
]

async function exportData() {
  if (isExporting.value) return

  isExporting.value = true

  try {
    const params = new URLSearchParams({
      format: exportOptions.value.format,
      period: exportOptions.value.period,
      scenarios: exportOptions.value.includeScenarios.toString(),
      waterfall: exportOptions.value.includeWaterfall.toString(),
      download: 'true'
    })

    if (exportOptions.value.format === 'excel') {
      // For Excel, we need to handle it differently since we need to generate the file client-side
      const response = await $fetch(`/api/exports/cashflow?${params}`)
      
      if (response.type === 'excel' && process.client) {
        try {
          // Import xlsx dynamically only on client side
          const XLSX = await import('xlsx')
          
          // Create workbook
          const wb = XLSX.utils.book_new()
          
          // Add sheets
          response.data.sheets.forEach((sheet: any) => {
            const ws = XLSX.utils.aoa_to_sheet(sheet.data)
            XLSX.utils.book_append_sheet(wb, ws, sheet.name)
          })
          
          // Download file
          XLSX.writeFile(wb, response.filename)
        } catch (xlsxError) {
          console.error('XLSX import failed:', xlsxError)
          throw new Error('Excel export is not available in this environment')
        }
      }
    } else {
      // For CSV and JSON, download directly
      const url = `/api/exports/cashflow?${params}`
      const link = document.createElement('a')
      link.href = url
      link.download = `cashflow-export-${new Date().toISOString().slice(0, 10)}.${exportOptions.value.format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }

    // Close modal on success
    isOpen.value = false
    
    // Show success message
    useToast().add({
      title: 'Export Successful',
      description: `Cash flow data exported as ${exportOptions.value.format.toUpperCase()}`,
      icon: 'i-lucide-download',
      color: 'green'
    })

  } catch (error: any) {
    console.error('Export failed:', error)
    useToast().add({
      title: 'Export Failed',
      description: error.message || 'Failed to export cash flow data',
      icon: 'i-lucide-alert-circle',
      color: 'red'
    })
  } finally {
    isExporting.value = false
  }
}

// Calculate estimated file size
const estimatedSize = computed(() => {
  const baseSize = exportOptions.value.period === '30' ? 2 : exportOptions.value.period === '60' ? 4 : 6
  const multiplier = exportOptions.value.format === 'excel' ? 3 : exportOptions.value.format === 'csv' ? 1 : 2
  const additionalData = (exportOptions.value.includeScenarios ? 1.5 : 0) + 
                         (exportOptions.value.includeWaterfall ? 0.5 : 0) + 
                         (exportOptions.value.includeInvoices ? 1 : 0)
  
  return Math.round((baseSize + additionalData) * multiplier * 10) / 10
})
</script>

<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-md' }">
    <UCard :ui="{ ring: '', divide: 'divide-y divide-gray-200 dark:divide-gray-800' }">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">Export Cash Flow Data</h3>
          <UButton color="gray" variant="ghost" icon="i-lucide-x" @click="isOpen = false" />
        </div>
      </template>

      <div class="space-y-6">
        <!-- Format Selection -->
        <div>
          <label class="block text-sm font-medium mb-3">Export Format</label>
          <div class="space-y-2">
            <div 
              v-for="format in formatOptions" 
              :key="format.value"
              class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
              :class="{
                'border-primary bg-primary/5': exportOptions.format === format.value,
                'border-gray-200 dark:border-gray-800': exportOptions.format !== format.value
              }"
              @click="exportOptions.format = format.value as any"
            >
              <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                :class="{
                  'border-primary bg-primary': exportOptions.format === format.value,
                  'border-gray-300 dark:border-gray-600': exportOptions.format !== format.value
                }"
              >
                <div v-if="exportOptions.format === format.value" 
                  class="w-2 h-2 rounded-full bg-white"
                />
              </div>
              <div class="flex-1">
                <div class="font-medium text-sm">{{ format.label }}</div>
                <div class="text-xs text-muted">{{ format.description }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Period Selection -->
        <div>
          <label class="block text-sm font-medium mb-3">Forecast Period</label>
          <USelectMenu
            v-model="exportOptions.period"
            :options="periodOptions"
            option-attribute="label"
            value-attribute="value"
            class="w-full"
          >
            <template #option="{ option }">
              <div>
                <div class="font-medium">{{ option.label }}</div>
                <div class="text-xs text-muted">{{ option.description }}</div>
              </div>
            </template>
          </USelectMenu>
        </div>

        <!-- Additional Data Options -->
        <div>
          <label class="block text-sm font-medium mb-3">Include Additional Data</label>
          <div class="space-y-3">
            <UCheckbox 
              v-model="exportOptions.includeScenarios" 
              label="Scenario Analysis" 
              help="Best/worst/likely case projections"
            />
            <UCheckbox 
              v-model="exportOptions.includeWaterfall" 
              label="Waterfall Breakdown" 
              help="Detailed cash flow components"
            />
            <UCheckbox 
              v-model="exportOptions.includeInvoices" 
              label="Outstanding Invoices" 
              help="Receivables and payables details"
            />
          </div>
        </div>

        <!-- File Size Estimate -->
        <div class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <div class="flex items-center gap-2 text-sm">
            <UIcon name="i-lucide-info" class="h-4 w-4 text-blue-500" />
            <span class="text-muted">
              Estimated file size: <strong>~{{ estimatedSize }} KB</strong>
            </span>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton 
            color="gray" 
            variant="ghost" 
            @click="isOpen = false"
            :disabled="isExporting"
          >
            Cancel
          </UButton>
          <UButton 
            icon="i-lucide-download" 
            :loading="isExporting"
            @click="exportData"
          >
            {{ isExporting ? 'Exporting...' : 'Export Data' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
