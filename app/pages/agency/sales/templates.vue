<script setup lang="ts">
definePageMeta({
  title: 'Price Templates',
  middleware: ['sales']
})

// Fetch templates
const { data: templatesData, pending, refresh } = await useFetch('/api/agency/pricing/templates')

const templates = computed(() => (templatesData.value?.templates || []) as any[])
const categories = computed(() => (templatesData.value?.categories || []) as string[])

// Filter state
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const selectedItemType = ref<string | null>(null)

// Filtered templates
const filteredTemplates = computed(() => {
  let result = templates.value

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(t =>
      t.name.toLowerCase().includes(query) ||
      (t.description || '').toLowerCase().includes(query)
    )
  }

  if (selectedCategory.value) {
    result = result.filter(t => t.category === selectedCategory.value)
  }

  if (selectedItemType.value) {
    result = result.filter(t => t.itemType === selectedItemType.value)
  }

  return result
})

// Group by category
const groupedTemplates = computed(() => {
  const grouped: Record<string, any[]> = {}
  for (const template of filteredTemplates.value) {
    const category = template.category || 'Other'
    if (!grouped[category]) {
      grouped[category] = []
    }
    grouped[category].push(template)
  }
  return grouped
})

// Format helpers
const formatCurrency = (value: number | null, currency = 'USD') => {
  if (value === null) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0
  }).format(value)
}

// Item type options
const itemTypes = [
  { label: 'All Types', value: null },
  { label: 'Service', value: 'service' },
  { label: 'Product', value: 'product' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Media Spend', value: 'media_spend' },
  { label: 'Production', value: 'production' }
]

// Type badge colors
const getItemTypeColor = (type: string): 'primary' | 'success' | 'warning' | 'secondary' | 'error' | 'info' | 'neutral' => {
  switch (type) {
    case 'service': return 'primary'
    case 'product': return 'success'
    case 'hourly': return 'warning'
    case 'fixed': return 'secondary'
    case 'media_spend': return 'error'
    case 'production': return 'info'
    default: return 'neutral'
  }
}

// Columns
const columns: any[] = [
  { key: 'name', label: 'Name' },
  { key: 'itemType', label: 'Type' },
  { key: 'defaultUnit', label: 'Unit' },
  { key: 'defaultUnitPrice', label: 'Unit Price' },
  { key: 'defaultHourlyRate', label: 'Hourly Rate' },
  { key: 'defaultAgencyFeePercent', label: 'Agency Fee' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Price Templates">
        <template #right>
          <UInput
            v-model="searchQuery"
            placeholder="Search templates..."
            icon="i-lucide-search"
            class="w-64"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Filters -->
        <div class="flex gap-4 mb-6">
          <USelectMenu
            v-model="selectedCategory"
            :items="[{ label: 'All Categories', value: null }, ...categories.map(c => ({ label: c, value: c }))]"
            placeholder="Category"
            value-key="value"
            class="w-48"
          />
          <USelectMenu
            v-model="selectedItemType"
            :items="itemTypes"
            placeholder="Item Type"
            value-key="value"
            class="w-48"
          />
        </div>

        <!-- Loading state -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Templates grouped by category -->
        <div v-else class="space-y-8">
          <template v-if="Object.keys(groupedTemplates).length === 0">
            <UCard>
              <div class="text-center py-8 text-gray-500">
                <UIcon name="i-lucide-layout-template" class="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p v-if="searchQuery || selectedCategory || selectedItemType">No templates match your filters</p>
                <p v-else>No price templates available</p>
              </div>
            </UCard>
          </template>

          <template v-for="(categoryTemplates, category) in groupedTemplates" :key="category">
            <UCard>
              <template #header>
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-folder" class="w-5 h-5 text-primary-500" />
                  <h3 class="font-semibold">{{ category }}</h3>
                  <UBadge color="neutral" variant="subtle" size="xs">
                    {{ categoryTemplates.length }}
                  </UBadge>
                </div>
              </template>

              <UTable
                :data="categoryTemplates"
                :columns="columns"
              >
                <template #name-cell="{ row: r }">
                  <div>
                    <p class="font-medium">{{ (r as any).name }}</p>
                    <p v-if="(r as any).description" class="text-sm text-gray-500">{{ (r as any).description }}</p>
                  </div>
                </template>

                <template #itemType-cell="{ row: r }">
                  <UBadge :color="getItemTypeColor((r as any).itemType)" variant="subtle" size="xs">
                    {{ (r as any).itemType }}
                  </UBadge>
                </template>

                <template #defaultUnit-cell="{ row: r }">
                  {{ (r as any).defaultUnit || '-' }}
                </template>

                <template #defaultUnitPrice-cell="{ row: r }">
                  {{ formatCurrency((r as any).defaultUnitPrice) }}
                </template>

                <template #defaultHourlyRate-cell="{ row: r }">
                  {{ formatCurrency((r as any).defaultHourlyRate) }}
                </template>

                <template #defaultAgencyFeePercent-cell="{ row: r }">
                  {{ (r as any).defaultAgencyFeePercent ? `${(r as any).defaultAgencyFeePercent}%` : '-' }}
                </template>
              </UTable>
            </UCard>
          </template>
        </div>

        <!-- Info card -->
        <UCard class="mt-8 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-info" class="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div>
              <p class="font-medium text-blue-700 dark:text-blue-300">About Price Templates</p>
              <p class="text-sm text-blue-600 dark:text-blue-400 mt-1">
                Price templates help you quickly add common line items when creating quotes.
                Templates can be selected when adding items to a new quote, pre-filling the name,
                description, unit, and pricing information.
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </UDashboardPanel>
  </div>
</template>
