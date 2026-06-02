<script setup lang="ts">
const props = defineProps<{ startDate: string, endDate: string, clientId?: string | null }>()
const { fmtCurrency, fmtCompact } = useAnalytics()
const toast = useToast()

interface GroundingChannel {
  channel: string
  spend: number
  leads: number
  conversions: number
  revenue: number
  sessions: number
  cpl: number | null
  cpa: number | null
}
interface AskResponse {
  answer: string
  grounding: { window: { startDate: string, endDate: string }, scope: string, channels: GroundingChannel[] }
}

const question = ref('')
const answer = ref<AskResponse | null>(null)
const loading = ref(false)
const showNumbers = ref(false)

const EXAMPLES = [
  'Which channel had the best cost per lead?',
  'Where should we shift budget next month?',
  'How does spend compare to results this period?'
]

const groundingColumns = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'cpl', header: 'CPL' },
  { accessorKey: 'conversions', header: 'Conv.' },
  { accessorKey: 'cpa', header: 'CPA' }
]

function useExample(q: string) {
  question.value = q
  ask()
}

async function ask() {
  const q = question.value.trim()
  if (!q || loading.value) return
  loading.value = true
  showNumbers.value = false
  try {
    answer.value = await $fetch<AskResponse>('/api/agency/analytics/ask', {
      method: 'POST',
      body: {
        question: q,
        startDate: props.startDate,
        endDate: props.endDate,
        clientId: props.clientId ?? undefined
      }
    })
  } catch {
    answer.value = null
    toast.add({ title: 'Could not answer', description: 'The insight service is unavailable. Try again shortly.', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard>
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-sparkles" class="text-primary shrink-0" />
      <UInput
        v-model="question"
        placeholder="Ask anything about this data…"
        class="flex-1"
        :disabled="loading"
        @keydown.enter="ask"
      />
      <UButton label="Ask" icon="i-lucide-arrow-right" :loading="loading" @click="ask" />
    </div>

    <div v-if="!answer && !loading" class="flex flex-wrap gap-2 mt-3">
      <UButton
        v-for="ex in EXAMPLES"
        :key="ex"
        :label="ex"
        size="xs"
        variant="soft"
        color="neutral"
        @click="useExample(ex)"
      />
    </div>

    <div v-if="loading" class="mt-4 text-sm text-muted">
      Thinking…
    </div>

    <div v-else-if="answer" class="mt-4 rounded-lg bg-elevated p-4">
      <p class="text-sm text-default whitespace-pre-line">{{ answer.answer }}</p>
      <UButton
        label="Show the numbers"
        :icon="showNumbers ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        variant="link"
        color="neutral"
        size="xs"
        class="mt-3 px-0"
        @click="showNumbers = !showNumbers"
      />
      <div v-if="showNumbers" class="mt-3">
        <UTable :data="answer.grounding.channels" :columns="groundingColumns">
          <template #spend-cell="{ row }">{{ fmtCurrency(row.original.spend) }}</template>
          <template #leads-cell="{ row }">{{ fmtCompact(row.original.leads) }}</template>
          <template #cpl-cell="{ row }">{{ row.original.cpl == null ? '—' : fmtCurrency(row.original.cpl, 2) }}</template>
          <template #conversions-cell="{ row }">{{ fmtCompact(row.original.conversions) }}</template>
          <template #cpa-cell="{ row }">{{ row.original.cpa == null ? '—' : fmtCurrency(row.original.cpa, 2) }}</template>
        </UTable>
      </div>
    </div>
  </UCard>
</template>
