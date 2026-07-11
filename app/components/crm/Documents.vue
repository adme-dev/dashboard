<script setup lang="ts">
// F13 — documents/attachments panel for a CRM record. Upload to R2 (via the API),
// list with expiry badges, signed download, delete. Agency + portal via crmApiBase.
const props = defineProps<{ clientId: string, targetType: 'person' | 'company' | 'opportunity', targetId: string }>()
const base = inject<string>('crmApiBase', '/api/crm')
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

interface Doc {
  id: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  document_type: string | null
  expires_at: string | null
  uploaded_by_name?: string | null
  created_at: string
}

const query = computed(() => ({ client_id: props.clientId, target_type: props.targetType, target_id: props.targetId }))
const data = ref<{ items: Doc[] }>({ items: [] })
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ items: Doc[] }>(`${base}/documents`, { query: query.value })
  } finally {
    pending.value = false
  }
}

watch(query, () => {
  refresh()
}, { immediate: true })

const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
function pick() { fileInput.value?.click() }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('client_id', props.clientId)
    fd.append('target_type', props.targetType)
    fd.append('target_id', props.targetId)
    await apiFetch(`${base}/documents`, { method: 'POST', body: fd })
    await refresh()
    toast.add({ title: 'Uploaded', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.data?.statusMessage || err?.message, color: 'error' })
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function remove(d: Doc) {
  try {
    await apiFetch(`${base}/documents/${d.id}`, { method: 'DELETE', query: { client_id: props.clientId } })
    await refresh()
  }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}

function downloadUrl(d: Doc) {
  return `${base}/documents/${d.id}/download?client_id=${encodeURIComponent(props.clientId)}`
}

const DAY = 86400_000
function expiry(d: Doc): { label: string, color: string } | null {
  if (!d.expires_at) return null
  const t = Date.parse(d.expires_at)
  if (Number.isNaN(t)) return null
  const now = Date.now()
  if (t <= now) return { label: 'Expired', color: 'error' }
  if (t - now <= 7 * DAY) return { label: 'Expiring soon', color: 'warning' }
  return { label: 'Active', color: 'success' }
}
function fmtSize(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}
function fileIcon(d: Doc) {
  const t = d.content_type || ''
  if (t.startsWith('image/')) return 'i-lucide-image'
  if (t === 'application/pdf') return 'i-lucide-file-text'
  if (t.includes('spreadsheet') || t.includes('excel')) return 'i-lucide-sheet'
  return 'i-lucide-file'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted">Documents</h3>
      <UButton size="xs" icon="i-lucide-upload" :loading="uploading" @click="pick">Upload</UButton>
      <input ref="fileInput" type="file" class="hidden" @change="onFile">
    </div>

    <div v-if="pending" class="text-sm text-muted py-3 text-center">Loading…</div>
    <div v-else-if="!data?.items?.length" class="text-sm text-muted py-5 text-center border border-dashed border-default rounded-lg">
      No documents yet.
    </div>
    <ul v-else class="space-y-1.5">
      <li v-for="d in data.items" :key="d.id" class="flex items-center gap-2.5 rounded-lg border border-default px-3 py-2 group">
        <UIcon :name="fileIcon(d)" class="size-4 text-muted shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <ULink :to="downloadUrl(d)" target="_blank" external class="text-sm font-medium truncate hover:underline">
              {{ d.file_name }}
            </ULink>
            <UBadge v-if="d.document_type" size="sm" variant="soft" color="neutral">{{ d.document_type }}</UBadge>
            <UBadge v-if="expiry(d)" size="sm" variant="subtle" :color="(expiry(d)!.color as any)">{{ expiry(d)!.label }}</UBadge>
          </div>
          <p class="text-xs text-muted">
            {{ fmtSize(d.size_bytes) }}<template v-if="d.uploaded_by_name"> · {{ d.uploaded_by_name }}</template>
          </p>
        </div>
        <UButton
          icon="i-lucide-trash-2" variant="ghost" color="neutral" size="xs"
          class="opacity-0 group-hover:opacity-100" @click="remove(d)"
        />
      </li>
    </ul>
  </div>
</template>
