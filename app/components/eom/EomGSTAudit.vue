<script setup lang="ts">
const props = defineProps<{
  summary: {
    gstBreakdown: Array<{ taxType: string; count: number; total: number; percentage: number }>
    coaBreakdown: Array<{ accountCode: string; count: number; total: number }>
    clientBreakdown: Array<{ clientName: string; invoiceNumber: number | null; lineCount: number; total: number }>
    sourceBreakdown: Array<{ source: string; count: number; total: number }>
  }
}>()

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

const gstColors: Record<string, string> = {
  'GST on Income': 'bg-blue-500',
  'GST Free Expenses': 'bg-green-500',
  'GST on Expenses': 'bg-orange-500',
}

const totalGst = computed(() => props.summary.gstBreakdown.reduce((s, g) => s + g.total, 0))
</script>

<template>
  <div class="space-y-6">
    <!-- GST Breakdown -->
    <div>
      <h3 class="font-semibold mb-3">GST Breakdown</h3>
      <div class="space-y-3">
        <div v-for="gst in summary.gstBreakdown" :key="gst.taxType" class="flex items-center gap-3">
          <div class="w-3 h-3 rounded-full" :class="gstColors[gst.taxType] || 'bg-neutral-400'" />
          <div class="flex-1">
            <div class="flex justify-between text-sm">
              <span class="font-medium">{{ gst.taxType }}</span>
              <span>{{ formatCurrency(gst.total) }} ({{ gst.percentage }}%)</span>
            </div>
            <div class="w-full bg-elevated rounded-full h-2 mt-1">
              <div class="h-2 rounded-full" :class="gstColors[gst.taxType] || 'bg-neutral-400'" :style="{ width: `${gst.percentage}%` }" />
            </div>
          </div>
          <span class="text-sm text-muted">{{ gst.count }} items</span>
        </div>
      </div>
      <p class="text-sm text-muted mt-2">Total: {{ formatCurrency(totalGst) }}</p>
    </div>

    <!-- COA Breakdown -->
    <div>
      <h3 class="font-semibold mb-3">Account Code Breakdown</h3>
      <div class="border border-default rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default bg-elevated/50">
              <th class="py-2 px-3 text-left font-medium text-muted">Code</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Items</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coa in summary.coaBreakdown" :key="coa.accountCode" class="border-b border-default/50">
              <td class="py-2 px-3 font-medium">{{ coa.accountCode }}</td>
              <td class="py-2 px-3 text-right">{{ coa.count }}</td>
              <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(coa.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Source Breakdown -->
    <div>
      <h3 class="font-semibold mb-3">Data Sources</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="src in summary.sourceBreakdown" :key="src.source" class="border border-default rounded-lg p-3">
          <p class="text-xs text-muted capitalize">{{ src.source.replace('_', ' ') }}</p>
          <p class="text-lg font-bold">{{ src.count }}</p>
          <p class="text-xs text-muted">{{ formatCurrency(src.total) }}</p>
        </div>
      </div>
    </div>

    <!-- Top Clients -->
    <div>
      <h3 class="font-semibold mb-3">By Client (Top 20)</h3>
      <div class="border border-default rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default bg-elevated/50">
              <th class="py-2 px-3 text-left font-medium text-muted">Client</th>
              <th class="py-2 px-3 text-center font-medium text-muted">Inv #</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Lines</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="client in summary.clientBreakdown.slice(0, 20)" :key="client.clientName" class="border-b border-default/50">
              <td class="py-2 px-3 font-medium max-w-[250px] truncate">{{ client.clientName }}</td>
              <td class="py-2 px-3 text-center text-muted">{{ client.invoiceNumber || '-' }}</td>
              <td class="py-2 px-3 text-right">{{ client.lineCount }}</td>
              <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(client.total) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
