<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PageStudioImageCreditAccount } from '~/types'

const props = defineProps<{ siteId: string }>()
const cursor = ref<string | null>(null)
const endpoint = computed(() => `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/images/account`)
const { data, error, pending, refresh } = await useFetch<PageStudioImageCreditAccount>(endpoint, {
  query: computed(() => ({ limit: 20, ...(cursor.value ? { before: cursor.value } : {}) }))
})
const columns: TableColumn<PageStudioImageCreditAccount['history']['items'][number]>[] = [
  { accessorKey: 'kind', header: 'Activity' },
  { accessorKey: 'credits', header: 'Credit change' }
]
const labels: Record<string, string> = { grant: 'Credits added', reserve: 'Image requested', settle: 'Image saved', release: 'Reservation returned', refund: 'Payment refunded', dispute: 'Payment disputed', reinstatement: 'Credits restored' }
function signed(value: number) {
  return value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()
}
function date(value: string) {
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function older() {
  if (data.value?.history.nextCursor) cursor.value = JSON.stringify(data.value.history.nextCursor)
}
</script>

<template>
  <section class="space-y-6" aria-label="Image credit account" :aria-busy="pending">
    <UAlert
      v-if="error"
      color="error"
      title="Credits could not be loaded"
      description="Refresh to check your current access and balance."
    />
    <div v-else-if="pending" class="space-y-4">
      <USkeleton class="h-24 w-full rounded-lg" />
      <USkeleton class="h-48 w-full rounded-lg" />
    </div>
    <template v-else-if="data">
      <div class="flex flex-wrap items-end justify-between gap-6 border-y border-default py-6">
        <div>
          <h2 class="text-sm font-medium text-muted">
            Available image credits
          </h2>
          <p class="mt-2 text-4xl font-semibold tabular-nums text-highlighted">
            {{ data.balance.available.toLocaleString() }}
          </p>
          <p class="mt-2 text-sm text-muted">
            {{ data.balance.reserved.toLocaleString() }} reserved · {{ data.balance.balance.toLocaleString() }} total
          </p>
        </div>
        <p class="max-w-md text-sm leading-6 text-muted">
          Credits are shared across your websites. Generation reserves the quoted amount and spends it when the image is saved. Reusing a saved image is free.
        </p>
      </div>
      <UAlert
        v-if="data.balance.frozen"
        color="warning"
        title="Spending is paused"
        description="Your credit account needs a billing review. Contact your website team before starting more image requests."
      />
      <UAlert
        v-else-if="data.balance.reserved"
        color="info"
        title="Some credits are reserved"
        description="These belong to requests in progress or being checked. They stay reserved until a saved image or a confirmed failure is recorded."
      />
      <PageStudioImageCreditTopUp v-if="data.canPurchase" :site-id="siteId" @settled="refresh()" />
      <p v-else class="text-sm text-muted">
        Only your billing owner can add credits. You can view image activity for this website.
      </p>
      <div class="space-y-4">
        <h2 class="text-lg font-semibold text-highlighted">
          Credit activity
        </h2>
        <p class="text-sm text-muted">
          {{ data.canPurchase ? 'Activity across this customer account.' : 'Image generation activity for the selected website.' }}
        </p>
        <UTable
          v-if="data.history.items.length"
          :data="data.history.items"
          :columns="columns"
          class="w-full"
        >
          <template #kind-cell="{ row }">
            <p class="font-medium text-highlighted">
              {{ labels[row.original.kind] || 'Adjustment' }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ date(row.original.createdAt) }}
            </p>
          </template>
          <template #credits-cell="{ row }">
            <p class="tabular-nums text-highlighted">
              {{ signed(row.original.credits) }}
            </p>
            <p class="mt-1 text-xs tabular-nums text-muted">
              {{ signed(row.original.reserved) }} reserved
            </p>
          </template>
        </UTable>
        <p v-else class="rounded-lg border border-dashed border-default p-6 text-sm text-muted">
          No credit activity yet. Saved images and credit adjustments will appear here.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            v-if="cursor"
            label="Newest activity"
            color="neutral"
            variant="outline"
            @click="cursor = null"
          />
          <UButton
            v-if="data.history.nextCursor"
            label="Older activity"
            color="neutral"
            variant="outline"
            @click="older"
          />
        </div>
      </div>
    </template>
    <UButton
      label="Refresh credits"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="outline"
      :loading="pending"
      @click="refresh()"
    />
  </section>
</template>
