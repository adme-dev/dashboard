<script setup lang="ts">
import { DEFAULT_STYLE, type QrStyle } from '~~/shared/qr/style'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'
import type { QrCode, QrFolder } from '~/composables/useQrCodes'

const props = defineProps<{ clientId?: string, folderId?: string | null, code?: QrCode | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'saved', code: QrCode): void }>()

const api = useQrCodes()
const toast = useToast()
const { data: clientsData } = await useFetch<any[]>('/api/agency/clients') // bare array (see memory)
const clients = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))

const form = reactive({
  name: '',
  clientId: props.clientId ?? '',
  folderId: (props.folderId ?? null) as string | null,
  destinationUrl: '',
  style: { ...DEFAULT_STYLE } as QrStyle,
})
const folders = ref<QrFolder[]>([])
const saving = ref(false)
const urlError = computed(() => {
  if (!form.destinationUrl) return ''
  const d = validateDestinationUrl(form.destinationUrl)
  if (isDestinationInvalid(d)) return d.reason
  return ''
})
const folderItems = computed(() => [{ label: 'No folder', value: 'none' }, ...folders.value.map(f => ({ label: f.name, value: f.id }))])
const folderModel = computed({
  get: () => form.folderId ?? 'none',
  set: (v: string) => { form.folderId = v === 'none' ? null : v },
})
const previewText = computed(() => (props.code ? api.shortUrl(props.code.code) : 'https://app.xeroflow.io/q/AbC1234'))

watch(() => open.value, (o) => {
  if (!o) return
  const c = props.code
  form.name = c?.name ?? ''
  form.clientId = c?.client_id ?? props.clientId ?? ''
  form.folderId = c?.folder_id ?? props.folderId ?? null
  form.destinationUrl = c?.destination_url ?? ''
  form.style = { ...DEFAULT_STYLE, ...(c?.style ?? {}) }
}, { immediate: true })

watch(() => form.clientId, async (id) => { folders.value = id ? (await api.folders(id)).folders : [] }, { immediate: true })

async function onLogo(file: File) {
  try {
    const { dataUri } = await api.uploadLogo(file)
    form.style = { ...form.style, logo: { dataUri, sizePct: form.style.logo?.sizePct ?? 20, padding: 1 } }
  } catch (e: any) {
    toast.add({ title: 'Logo rejected', description: e?.data?.statusMessage ?? 'Upload failed', color: 'error' })
  }
}

async function save() {
  if (!form.name.trim() || !form.clientId || urlError.value) return
  saving.value = true
  try {
    const res = props.code
      ? await api.update(props.code.id, { name: form.name, folderId: form.folderId, destinationUrl: form.destinationUrl, style: form.style })
      : await api.create({ name: form.name, clientId: form.clientId, folderId: form.folderId, destinationUrl: form.destinationUrl, style: form.style })
    toast.add({ title: props.code ? 'QR code updated' : 'QR code created', color: 'success' })
    emit('saved', res.code)
    open.value = false
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage ?? 'Unknown error', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <USlideover v-model:open="open" :title="code ? 'Edit QR code' : 'New QR code'" :ui="{ content: 'max-w-3xl' }">
    <template #body>
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8">
        <div class="space-y-6">
          <UFormField label="Name" required><UInput v-model="form.name" placeholder="Front window decal" /></UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Client" required><USelectMenu v-model="form.clientId" :items="clients" value-key="value" :disabled="!!code" placeholder="Select client" /></UFormField>
            <UFormField label="Folder"><USelectMenu v-model="folderModel" :items="folderItems" value-key="value" /></UFormField>
          </div>
          <UFormField label="Destination URL" required :error="urlError" help="Change this any time — printed codes keep working.">
            <UInput v-model="form.destinationUrl" placeholder="https://client.com.au/landing" icon="i-lucide-link" />
          </UFormField>
          <QrStylePicker v-model="form.style" @upload-logo="onLogo" />
        </div>
        <aside class="lg:sticky lg:top-0 space-y-3">
          <QrPreview :text="previewText" :style="form.style" :size="280" />
          <p class="text-xs text-muted break-all">{{ previewText }}</p>
        </aside>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2 w-full">
        <UButton variant="ghost" color="neutral" @click="() => { open = false }">Cancel</UButton>
        <UButton :loading="saving" :disabled="!form.name.trim() || !form.clientId || !!urlError || !form.destinationUrl" @click="save">{{ code ? 'Save changes' : 'Create QR code' }}</UButton>
      </div>
    </template>
  </USlideover>
</template>
