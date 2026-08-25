<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'QR campaigns' })
const api = useQrCodes()
const { data, status } = await useAsyncData('qr-campaigns', () => api.campaigns())
const rows = computed(() => data.value?.campaigns ?? [])
const bulkOpen = ref(false)
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <header class="flex flex-wrap items-center gap-3">
      <UButton
        to="/agency/qr-codes"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        aria-label="Back to QR codes"
      />
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          Campaigns
        </h1>
        <p class="text-sm text-muted">
          Sets of variant codes that share a destination — scans and leads rolled up per code.
        </p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-copy-plus" @click="() => { bulkOpen = true }">
        Create variants
      </UButton>
    </header>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-14" />
    </div>
    <div v-else-if="!rows.length" class="rounded-xl border border-dashed border-default px-6 py-16 text-center">
      <UIcon name="i-lucide-layers" class="mx-auto mb-3 size-6 text-muted" />
      <p class="font-medium">
        No campaigns yet
      </p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-muted">
        Paste a list of placements or pick a count and every code is created in one go.
      </p>
    </div>
    <div v-else class="divide-y divide-default rounded-xl ring-1 ring-default">
      <NuxtLink
        v-for="k in rows"
        :key="k.id"
        :to="`/agency/qr-codes/campaigns/${k.id}`"
        class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ k.name }}
          </p>
          <p class="truncate text-xs text-muted">
            {{ k.client_name }} · {{ k.codes_count }} {{ k.codes_count === 1 ? 'code' : 'codes' }}
          </p>
        </div>
        <span class="text-sm tabular-nums text-muted">{{ Number(k.scans).toLocaleString() }} scans</span>
        <span class="text-sm tabular-nums text-muted">{{ k.leads }} {{ k.leads === 1 ? 'lead' : 'leads' }}</span>
        <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
      </NuxtLink>
    </div>
    <QrBulkDialog v-model:open="bulkOpen" />
  </div>
</template>
