<script setup lang="ts">
import type { QrCode } from '~/composables/useQrCodes'

const props = defineProps<{ code: QrCode }>()
const emit = defineEmits<{ (e: 'edit'): void, (e: 'delete'): void, (e: 'toggle'): void }>()
const api = useQrCodes()
const toast = useToast()
const short = computed(() => api.shortUrl(props.code.code))

async function copy() {
  await navigator.clipboard.writeText(short.value)
  toast.add({ title: 'Short link copied', color: 'success' })
}

async function downloadPng() {
  try {
    await api.downloadPng(props.code, 2048)
  } catch (e: any) {
    toast.add({ title: 'Could not generate PNG', description: e?.message ?? 'Unknown error', color: 'error' })
  }
}

const spark = computed(() => props.code.sparkline ?? [])
const max = computed(() => Math.max(1, ...spark.value))
const menu = computed(() => [[
  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
  { label: 'Download SVG', icon: 'i-lucide-download', to: api.exportUrl(props.code.id), external: true },
  { label: 'Download PNG (2048px)', icon: 'i-lucide-image', onSelect: downloadPng },
  { label: props.code.is_active ? 'Deactivate' : 'Activate', icon: 'i-lucide-power', onSelect: () => emit('toggle') },
], [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }]])
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <div class="flex gap-4">
      <NuxtLink :to="`/agency/qr-codes/${code.id}`" class="shrink-0"><QrPreview :text="short" :style="code.style" :size="96" /></NuxtLink>
      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <NuxtLink :to="`/agency/qr-codes/${code.id}`" class="font-medium truncate hover:underline">{{ code.name }}</NuxtLink>
          <UDropdownMenu :items="menu"><UButton icon="i-lucide-ellipsis" variant="ghost" color="neutral" size="xs" /></UDropdownMenu>
        </div>
        <p class="text-xs text-muted truncate">{{ code.destination_url }}</p>
        <button type="button" class="mt-1 text-xs font-mono text-primary hover:underline" @click="copy">{{ short.replace('https://', '') }}</button>
        <div class="mt-3 flex items-end justify-between">
          <div>
            <p class="text-lg font-semibold tabular-nums leading-none">{{ code.scan_count }}</p>
            <p class="text-[11px] text-muted">scans</p>
          </div>
          <div class="flex items-end gap-0.5 h-6" aria-hidden="true">
            <span v-for="(n, i) in spark" :key="i" class="w-1.5 rounded-sm bg-primary/70" :style="{ height: `${Math.max(2, (n / max) * 24)}px` }" />
          </div>
          <UBadge v-if="!code.is_active" color="neutral" variant="subtle" size="xs">Inactive</UBadge>
        </div>
      </div>
    </div>
  </UCard>
</template>
