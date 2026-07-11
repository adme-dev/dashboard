<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <div class="p-4 space-y-4">
        <h3 class="text-lg font-semibold">Link to Quote Line Item</h3>

        <!-- Step 1: Search quote -->
        <div v-if="!selectedQuote">
          <UInput
            v-model="searchQuery"
            placeholder="Search quotes by number or title..."
            icon="i-lucide-search"
            @input="debouncedSearch"
          />
          <div v-if="searching" class="flex items-center gap-2 py-4 justify-center">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            <span class="text-sm text-gray-500">Searching...</span>
          </div>
          <div v-else-if="quotes.length > 0" class="mt-3 max-h-64 overflow-y-auto space-y-1">
            <button
              v-for="q in quotes"
              :key="q.id"
              class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
              @click="selectQuote(q)"
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-mono text-sm font-medium">{{ q.quoteNumber }}</span>
                  <span class="text-sm text-gray-500 ml-2">{{ q.title }}</span>
                </div>
                <UBadge :color="q.status === 'accepted' ? 'success' : 'neutral'" variant="subtle" size="xs">
                  {{ q.status }}
                </UBadge>
              </div>
              <p v-if="q.clientName" class="text-xs text-gray-400 mt-0.5">{{ q.clientName }}</p>
            </button>
          </div>
          <p v-else-if="searchQuery.length >= 2 && !searching" class="text-sm text-gray-500 text-center py-4">
            No quotes found
          </p>
        </div>

        <!-- Step 2: Select line item -->
        <div v-else>
          <div class="flex items-center gap-2 mb-3">
            <UButton size="xs" variant="ghost" icon="i-lucide-arrow-left" @click="selectedQuote = null" />
            <span class="font-mono text-sm">{{ selectedQuote.quoteNumber }}</span>
            <span class="text-sm text-gray-500">{{ selectedQuote.title }}</span>
          </div>

          <div v-if="loadingLineItems" class="flex items-center gap-2 py-4 justify-center">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
            <span class="text-sm text-gray-500">Loading line items...</span>
          </div>
          <div v-else-if="lineItems.length > 0" class="space-y-1 max-h-64 overflow-y-auto">
            <button
              v-for="item in lineItems"
              :key="item.id"
              class="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors border border-transparent hover:border-primary-200 dark:hover:border-primary-800"
              :disabled="linking"
              @click="linkLineItem(item)"
            >
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">{{ item.name }}</span>
                <span class="text-sm font-semibold">{{ formatCurrency(item.lineTotal) }}</span>
              </div>
              <div class="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                <span>{{ item.quantity }} {{ item.unit }}</span>
                <span v-if="item.estimatedHours">· {{ item.estimatedHours }}h</span>
                <span v-if="item.linkedTasks?.length" class="text-amber-500">
                  · {{ item.linkedTasks.length }} task{{ item.linkedTasks.length > 1 ? 's' : '' }} linked
                </span>
              </div>
            </button>
          </div>
          <p v-else class="text-sm text-gray-500 text-center py-4">No line items</p>
        </div>

        <!-- Footer -->
        <div class="flex justify-end pt-2 border-t border-gray-200 dark:border-neutral-700">
          <UButton variant="ghost" label="Cancel" @click="isOpen = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
const props = defineProps<{
  taskId: string
}>()

const isOpen = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ linked: [] }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}) => Promise<T>

const searchQuery = ref('')
const quotes = ref<any[]>([])
const searching = ref(false)
const selectedQuote = ref<any>(null)
const lineItems = ref<any[]>([])
const loadingLineItems = ref(false)
const linking = ref(false)

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSearch() {
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => searchQuotes(), 300)
}

async function searchQuotes() {
  const q = searchQuery.value.trim()
  if (q.length < 2) {
    quotes.value = []
    return
  }
  searching.value = true
  try {
    const data = await apiFetch<any>('/api/agency/quotes', {
      query: { search: q, limit: 10 }
    })
    quotes.value = (data.quotes || data || []).map((quote: any) => ({
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      status: quote.status,
      clientName: quote.clientName,
      total: quote.total,
      currency: quote.currency,
    }))
  } catch {
    quotes.value = []
  } finally {
    searching.value = false
  }
}

async function selectQuote(q: any) {
  selectedQuote.value = q
  loadingLineItems.value = true
  try {
    const data = await apiFetch<any>(`/api/agency/quotes/${q.id}`)
    lineItems.value = data.quote?.lineItems || []
  } catch {
    lineItems.value = []
  } finally {
    loadingLineItems.value = false
  }
}

async function linkLineItem(item: any) {
  linking.value = true
  try {
    await apiFetch(`/api/agency/tasks/${props.taskId}`, {
      method: 'PUT',
      body: { quoteLineItemId: item.id, budgetSource: 'quote' }
    })
    toast.add({ title: 'Linked to quote line item', description: item.name, color: 'success' })
    isOpen.value = false
    emit('linked')
  } catch (err: any) {
    toast.add({ title: 'Failed to link', description: err.message, color: 'error' })
  } finally {
    linking.value = false
  }
}

function formatCurrency(amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: selectedQuote.value?.currency || 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `$${amount.toFixed(0)}`
  }
}

// Reset state when modal closes
watch(isOpen, (v) => {
  if (!v) {
    searchQuery.value = ''
    quotes.value = []
    selectedQuote.value = null
    lineItems.value = []
  }
})
</script>
