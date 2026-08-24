<script setup lang="ts">
import { CalendarDate, getLocalTimeZone, today } from '@internationalized/date'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'

definePageMeta({ layout: 'agency' })

const route = useRoute()
const api = useQrCodes()
const toast = useToast()
const id = route.params.id as string

const { data, refresh } = await useFetch(`/api/agency/qr-codes/${id}`)
useHead({ title: () => data.value?.code?.name ?? 'QR code' })

// shallowRef avoids Vue deep-reactivating the CalendarDate class instances (which strips their
// prototype/type identity and breaks TS narrowing against @internationalized/date's CalendarDate).
const range = shallowRef({ start: today(getLocalTimeZone()).subtract({ days: 29 }), end: today(getLocalTimeZone()) })
const rangeOpen = ref(false)
const fmt = (d: CalendarDate) => d.toString()
const { data: analytics } = await useFetch(`/api/agency/qr-codes/${id}/analytics`, {
  query: computed(() => ({ from: fmt(range.value.start), to: fmt(range.value.end) })),
})

const editingUrl = ref(false)
const urlDraft = ref('')
const urlError = computed(() => {
  if (!urlDraft.value) return ''
  const d = validateDestinationUrl(urlDraft.value)
  if (isDestinationInvalid(d)) return d.reason
  return ''
})
function startEdit() {
  urlDraft.value = data.value?.code?.destination_url ?? ''
  editingUrl.value = true
}
async function saveUrl() {
  if (urlError.value) return
  try {
    await api.update(id, { destinationUrl: urlDraft.value })
    editingUrl.value = false
    toast.add({ title: 'Destination updated — printed codes now point here', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  }
}
const editorOpen = ref(false)
async function copy() {
  await navigator.clipboard.writeText(data.value!.shortUrl)
  toast.add({ title: 'Short link copied', color: 'success' })
}
</script>

<template>
  <div v-if="data" class="p-6 space-y-6">
    <UButton to="/agency/qr-codes" variant="link" color="neutral" icon="i-lucide-arrow-left" class="px-0">
      All QR codes
    </UButton>
    <div class="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-8">
      <aside class="space-y-4">
        <QrPreview :text="data.shortUrl" :style="data.code.style" :size="320" />
        <div class="flex gap-2">
          <UButton :to="api.exportUrl(id)" external icon="i-lucide-download" block>
            SVG
          </UButton>
          <UButton icon="i-lucide-image" variant="soft" block @click="() => api.downloadPng(data.code)">
            PNG
          </UButton>
        </div>
        <UButton icon="i-lucide-palette" variant="ghost" color="neutral" block @click="() => { editorOpen = true }">
          Edit design
        </UButton>
      </aside>
      <section class="space-y-6 min-w-0">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ data.code.name }}
          </h1>
          <p class="text-sm text-muted">
            {{ data.code.client_name ?? '' }}<span v-if="data.code.folder_name"> · {{ data.code.folder_name }}</span>
          </p>
        </div>
        <UCard>
          <dl class="space-y-4">
            <div>
              <dt class="text-xs text-muted">
                Short link (printed on the code)
              </dt>
              <dd class="flex items-center gap-2 font-mono text-sm">
                <span>{{ data.shortUrl }}</span>
                <UButton icon="i-lucide-copy" size="xs" variant="ghost" color="neutral" @click="copy" />
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Destination
              </dt>
              <dd v-if="!editingUrl" class="flex items-center gap-2 text-sm break-all">
                <a :href="data.code.destination_url" target="_blank" rel="noopener" class="text-primary hover:underline">{{ data.code.destination_url }}</a>
                <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral" @click="startEdit" />
              </dd>
              <dd v-else class="space-y-2">
                <UFormField :error="urlError">
                  <UInput v-model="urlDraft" icon="i-lucide-link" autofocus @keydown.enter="saveUrl" />
                </UFormField>
                <div class="flex gap-2">
                  <UButton size="sm" :disabled="!!urlError || !urlDraft" @click="saveUrl">
                    Save
                  </UButton>
                  <UButton size="sm" variant="ghost" color="neutral" @click="() => { editingUrl = false }">
                    Cancel
                  </UButton>
                </div>
              </dd>
            </div>
          </dl>
        </UCard>
        <div class="flex items-center justify-between">
          <h2 class="font-semibold">
            Scans
          </h2>
          <UPopover v-model:open="rangeOpen">
            <UButton icon="i-lucide-calendar" variant="soft" color="neutral" size="sm">
              {{ fmt(range.start) }} → {{ fmt(range.end) }}
            </UButton>
            <template #content>
              <div class="p-2">
                <UCalendar v-model="range" range :max-value="today(getLocalTimeZone())" />
              </div>
            </template>
          </UPopover>
        </div>
        <QrAnalytics v-if="analytics" :data="analytics" />
        <UCard v-if="data.history?.length">
          <template #header>
            <span class="text-sm font-medium">Destination history</span>
          </template>
          <ul class="divide-y divide-default text-sm">
            <li v-for="h in data.history" :key="h.changed_at" class="py-2">
              <p class="break-all">
                {{ h.new_url }}
              </p>
              <p class="text-xs text-muted">
                {{ new Date(h.changed_at).toLocaleString() }}<span v-if="h.changed_by_name"> · {{ h.changed_by_name }}</span><span v-if="h.old_url"> · previously {{ h.old_url }}</span>
              </p>
            </li>
          </ul>
        </UCard>
      </section>
    </div>
    <QrEditor v-model:open="editorOpen" :code="data.code" @saved="() => refresh()" />
  </div>
</template>
