<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'
import type { QrCode } from '~/composables/useQrCodes'

const props = defineProps<{ code: QrCode, showClient?: boolean }>()
const emit = defineEmits<{ (e: 'edit' | 'delete' | 'toggle'): void }>()
const api = useQrCodes()
const toast = useToast()
const short = computed(() => api.shortUrl(props.code.code))
const detail = computed(() => `/agency/qr-codes/${props.code.id}`)

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
const last7 = computed(() => spark.value.reduce((a, b) => a + b, 0))
const lastScanned = computed(() => props.code.last_scanned_at ? formatTimeAgo(new Date(props.code.last_scanned_at)) : null)
const destinationHost = computed(() => {
  try {
    return new URL(props.code.destination_url).host.replace(/^www\./, '')
  } catch {
    return props.code.destination_url
  }
})

const menu = computed(() => [[
  { label: 'Open', icon: 'i-lucide-arrow-up-right', to: detail.value },
  { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => emit('edit') },
  { label: props.code.destination_mode === 'page' ? 'Edit hosted page' : 'Add hosted page', icon: 'i-lucide-layout-template', to: `${detail.value}?page=1` },
  { label: 'Copy short link', icon: 'i-lucide-copy', onSelect: copy }
], [
  { label: 'Download SVG', icon: 'i-lucide-download', to: api.exportUrl(props.code.id), external: true },
  { label: 'Download PNG (2048px)', icon: 'i-lucide-image', onSelect: downloadPng }
], [
  { label: props.code.is_active ? 'Deactivate' : 'Activate', icon: 'i-lucide-power', onSelect: () => emit('toggle') },
  { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete') }
]])
</script>

<template>
  <UCard class="transition hover:ring-accented" :class="!code.is_active ? 'opacity-70' : ''" :ui="{ body: 'p-4' }">
    <div class="flex gap-4">
      <NuxtLink :to="detail" class="relative shrink-0" :aria-label="`Open ${code.name}`">
        <QrPreview :text="short" :style="code.style" :size="112" />
        <span
          v-if="!code.is_active"
          class="absolute inset-0 flex items-center justify-center rounded-xl bg-default/70 text-[11px] font-semibold uppercase tracking-wider text-muted"
        >Inactive</span>
      </NuxtLink>

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <NuxtLink :to="detail" class="block truncate font-medium hover:underline">
              {{ code.name }}
            </NuxtLink>
            <p v-if="code.destination_mode === 'page'" class="truncate text-[11px] font-medium text-primary">
              Hosted page
            </p>
            <p v-if="showClient" class="truncate text-xs text-muted">
              {{ code.client_name }}<span v-if="code.folder_name"> · {{ code.folder_name }}</span>
            </p>
            <p v-else-if="code.folder_name" class="truncate text-xs text-muted">
              {{ code.folder_name }}
            </p>
          </div>
          <UDropdownMenu :items="menu">
            <UButton
              icon="i-lucide-ellipsis"
              variant="ghost"
              color="neutral"
              size="xs"
              aria-label="More actions"
            />
          </UDropdownMenu>
        </div>

        <div class="mt-2 space-y-0.5 text-xs">
          <p class="flex items-center gap-1.5 truncate text-muted" :title="code.destination_url">
            <UIcon name="i-lucide-arrow-right" class="size-3 shrink-0" />
            <span class="truncate">{{ destinationHost }}</span>
          </p>
          <UTooltip text="Copy short link">
            <button type="button" class="flex max-w-full items-center gap-1.5 font-mono text-primary hover:underline" @click="copy">
              <UIcon name="i-lucide-link" class="size-3 shrink-0" />
              <span class="truncate">{{ short.replace('https://', '') }}</span>
            </button>
          </UTooltip>
        </div>

        <div class="mt-3 flex items-end justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xl font-semibold leading-none tabular-nums">
              {{ code.scan_count }}
            </p>
            <p class="mt-1 truncate text-[11px] text-muted">
              {{ code.scan_count === 1 ? 'scan' : 'scans' }}<template v-if="lastScanned">
                · last {{ lastScanned }}
              </template>
            </p>
          </div>
          <UTooltip :text="`${last7} in the last 7 days`">
            <div class="flex h-7 items-end gap-[3px]" aria-hidden="true">
              <span
                v-for="(n, i) in spark"
                :key="i"
                class="w-1.5 rounded-sm"
                :class="n ? 'bg-primary' : 'bg-accented'"
                :style="{ height: `${n ? Math.max(6, (n / max) * 28) : 3}px` }"
              />
            </div>
          </UTooltip>
        </div>
      </div>
    </div>
  </UCard>
</template>
