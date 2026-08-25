<script setup lang="ts">
import JSZip from 'jszip'
import { renderQrPngBlob, renderQrSvgForExport, triggerDownload } from '~/composables/useQrCodes'

definePageMeta({ layout: 'agency' })
const route = useRoute()
const id = route.params.id as string
const api = useQrCodes()
const toast = useToast()
const { data, status, refresh } = await useAsyncData(`qr-campaign-${id}`, () => api.campaign(id))
useHead({ title: computed(() => data.value?.campaign?.name ? `${data.value.campaign.name} · QR campaign` : 'QR campaign') })
const codes = computed(() => data.value?.codes ?? [])
const totals = computed(() => data.value?.totals ?? { scans: 0, visitors: 0, leads: 0 })
const bulkOpen = ref(false)

const zipping = ref(false)
const zipProgress = ref(0)
function fileBase(name: string, code: string) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'qr'}-${code}`
}
/** Every code as SVG + 2048px PNG, zipped client-side (no server PNG path exists on Pages). */
async function downloadAll() {
  if (!codes.value.length) return
  zipping.value = true
  zipProgress.value = 0
  try {
    const zip = new JSZip()
    const svgDir = zip.folder('svg')!
    const pngDir = zip.folder('png')!
    const rows = ['name,code,short_url,destination_url']
    for (const c of codes.value) {
      const base = fileBase(c.name, c.code)
      svgDir.file(`${base}.svg`, renderQrSvgForExport(c))
      pngDir.file(`${base}.png`, await renderQrPngBlob(c, 2048))
      rows.push([c.name, c.code, c.short_url, c.destination_url].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      zipProgress.value++
    }
    zip.file('codes.csv', rows.join('\n'))
    const blob = await zip.generateAsync({ type: 'blob' })
    triggerDownload(blob, `${fileBase(data.value?.campaign?.name ?? 'campaign', 'qr')}.zip`)
  } catch (e: any) {
    toast.add({ title: 'Could not build the ZIP', description: e?.message ?? 'Unknown error', color: 'error' })
  } finally {
    zipping.value = false
  }
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—')
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <header class="flex flex-wrap items-center gap-3">
      <UButton
        to="/agency/qr-codes/campaigns"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        aria-label="Back to campaigns"
      />
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-semibold tracking-tight">
          {{ data?.campaign?.name ?? 'Campaign' }}
        </h1>
        <p class="text-sm text-muted">
          {{ data?.campaign?.client_name }} · {{ codes.length }} {{ codes.length === 1 ? 'code' : 'codes' }}
        </p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <UButton
          icon="i-lucide-copy-plus"
          variant="soft"
          color="neutral"
          @click="() => { bulkOpen = true }"
        >
          Add variants
        </UButton>
        <UButton
          icon="i-lucide-file-archive"
          :loading="zipping"
          :disabled="!codes.length"
          @click="downloadAll"
        >
          {{ zipping ? `Rendering ${zipProgress}/${codes.length}` : 'Download all (ZIP)' }}
        </UButton>
      </div>
    </header>

    <div class="grid grid-cols-3 gap-3">
      <div v-for="(v, k) in { scans: totals.scans, visitors: totals.visitors, leads: totals.leads }" :key="k" class="rounded-xl bg-elevated/60 px-4 py-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-muted">
          {{ k }}
        </p>
        <p class="mt-1 text-2xl font-semibold tabular-nums">
          {{ Number(v).toLocaleString() }}
        </p>
      </div>
    </div>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="i in 4" :key="i" class="h-12" />
    </div>
    <div v-else class="overflow-x-auto rounded-xl ring-1 ring-default">
      <table class="w-full text-sm">
        <thead class="bg-elevated/60 text-xs uppercase tracking-wider text-muted">
          <tr>
            <th class="px-4 py-2 text-left font-semibold">
              Code
            </th>
            <th class="px-4 py-2 text-right font-semibold">
              Scans
            </th>
            <th class="px-4 py-2 text-right font-semibold">
              Visitors
            </th>
            <th class="px-4 py-2 text-right font-semibold">
              Leads
            </th>
            <th class="px-4 py-2 text-right font-semibold">
              Last scan
            </th>
            <th class="px-4 py-2" />
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="c in codes" :key="c.id" :class="!c.is_active ? 'opacity-60' : ''">
            <td class="px-4 py-2">
              <NuxtLink :to="`/agency/qr-codes/${c.id}`" class="flex items-center gap-3 hover:underline">
                <QrPreview
                  :text="c.short_url!"
                  :style="c.style"
                  :frame="c.frame"
                  :size="36"
                />
                <span class="min-w-0">
                  <span class="block truncate font-medium">{{ c.name }}</span>
                  <span class="block font-mono text-[11px] text-muted">{{ c.code }}</span>
                </span>
              </NuxtLink>
            </td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ Number(c.scan_count).toLocaleString() }}
            </td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ Number(c.visitors).toLocaleString() }}
            </td>
            <td class="px-4 py-2 text-right tabular-nums">
              {{ c.leads }}
            </td>
            <td class="px-4 py-2 text-right text-muted">
              {{ fmtDate(c.last_scanned_at) }}
            </td>
            <td class="px-4 py-2 text-right">
              <UButton
                :to="api.exportUrl(c.id)"
                external
                icon="i-lucide-download"
                size="xs"
                variant="ghost"
                color="neutral"
                aria-label="Download SVG"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <QrBulkDialog
      v-model:open="bulkOpen"
      :client-id="data?.campaign?.client_id"
      @created="refresh"
    />
  </div>
</template>
