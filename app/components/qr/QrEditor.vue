<script setup lang="ts">
import { DEFAULT_STYLE, type QrStyle } from '~~/shared/qr/style'
import { QR_UTM_MEDIUMS, buildTrackedUrl, type QrUtmMedium } from '~~/shared/qr/tracking'
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
  utmEnabled: true,
  utmMedium: 'print' as QrUtmMedium
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
  set: (v: string) => { form.folderId = v === 'none' ? null : v }
})
const previewText = computed(() => (props.code ? api.shortUrl(props.code.code) : 'https://app.xeroflow.io/q/AbC1234'))
const mediumItems = QR_UTM_MEDIUMS.map(m => ({ label: m.charAt(0).toUpperCase() + m.slice(1), value: m }))
const folderName = computed(() => folders.value.find(f => f.id === form.folderId)?.name ?? null)
const trackedPreview = computed(() => {
  if (!form.destinationUrl || urlError.value) return ''
  return buildTrackedUrl(form.destinationUrl, { code: props.code?.code ?? 'AbC1234', enabled: form.utmEnabled, medium: form.utmMedium, campaign: folderName.value || form.name })
})
const canSave = computed(() => !!form.name.trim() && !!form.clientId && !!form.destinationUrl && !urlError.value)

watch(() => open.value, (o) => {
  if (!o) return
  const c = props.code
  form.name = c?.name ?? ''
  form.clientId = c?.client_id ?? props.clientId ?? ''
  form.folderId = c?.folder_id ?? props.folderId ?? null
  form.destinationUrl = c?.destination_url ?? ''
  form.style = { ...DEFAULT_STYLE, ...(c?.style ?? {}) }
  form.utmEnabled = c?.utm_enabled ?? true
  form.utmMedium = (c?.utm_medium as QrUtmMedium) ?? 'print'
}, { immediate: true })

watch(() => form.clientId, async (id) => {
  folders.value = id ? (await api.folders(id)).folders : []
}, { immediate: true })

async function onLogo(file: File) {
  try {
    const { dataUri } = await api.uploadLogo(file)
    form.style = { ...form.style, logo: { dataUri, sizePct: form.style.logo?.sizePct ?? 20, padding: 1 } }
  } catch (e: any) {
    toast.add({ title: 'Logo rejected', description: e?.data?.statusMessage ?? 'Upload failed', color: 'error' })
  }
}

async function save() {
  if (!canSave.value) return
  saving.value = true
  try {
    const res = props.code
      ? await api.update(props.code.id, { name: form.name, folderId: form.folderId, destinationUrl: form.destinationUrl, style: form.style, utmEnabled: form.utmEnabled, utmMedium: form.utmMedium })
      : await api.create({ name: form.name, clientId: form.clientId, folderId: form.folderId, destinationUrl: form.destinationUrl, style: form.style, utmEnabled: form.utmEnabled, utmMedium: form.utmMedium })
    toast.add({ title: props.code ? 'QR code updated' : 'QR code created', description: props.code ? undefined : 'Download it from the card or open it for scan tracking.', color: 'success' })
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
  <USlideover
    v-model:open="open"
    :title="code ? 'Edit QR code' : 'New QR code'"
    :description="code ? 'Design changes apply to future downloads only — already-printed codes keep working.' : 'The short link is fixed once created; everything else can change later.'"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div class="space-y-6 min-w-0">
          <UFormField label="Name" required help="Where it lives — e.g. front window decal, flyer, table tent.">
            <UInput
              v-model="form.name"
              placeholder="Front window decal"
              class="w-full"
              autofocus
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Client" required>
              <USelectMenu
                v-model="form.clientId"
                :items="clients"
                value-key="value"
                :disabled="!!code"
                placeholder="Select client"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Folder">
              <USelectMenu
                v-model="folderModel"
                :items="folderItems"
                value-key="value"
                :disabled="!form.clientId"
                class="w-full"
              />
            </UFormField>
          </div>
          <UFormField
            label="Destination URL"
            required
            :error="urlError || undefined"
            help="Change this any time — printed codes keep working."
          >
            <UInput
              v-model="form.destinationUrl"
              placeholder="https://client.com.au/landing"
              icon="i-lucide-link"
              class="w-full"
            />
          </UFormField>
          <section class="space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Analytics tagging
            </h4>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Tag the destination" help="Adds utm_source=qr and a click id so the client's GA4 / Meta / XeroFlow tracking attributes visits to this code.">
                <USwitch v-model="form.utmEnabled" :label="form.utmEnabled ? 'On' : 'Off'" />
              </UFormField>
              <UFormField label="Placement (utm_medium)">
                <USelectMenu
                  v-model="form.utmMedium"
                  :items="mediumItems"
                  value-key="value"
                  :disabled="!form.utmEnabled"
                  class="w-full"
                />
              </UFormField>
            </div>
            <p v-if="trackedPreview" class="break-all rounded-md bg-elevated/60 px-3 py-2 font-mono text-[11px] text-muted">
              {{ trackedPreview }}
            </p>
          </section>
          <USeparator />
          <QrStylePicker v-model="form.style" @upload-logo="onLogo" />
        </div>
        <aside class="min-w-0 lg:sticky lg:top-0 lg:self-start">
          <div class="rounded-xl bg-elevated/60 p-4 space-y-3">
            <p class="text-xs font-semibold uppercase tracking-wider text-muted">
              Preview
            </p>
            <QrPreview
              :text="previewText"
              :style="form.style"
              :size="260"
              fluid
            />
            <p class="font-mono text-[11px] text-muted break-all">
              {{ previewText.replace('https://', '') }}
            </p>
            <p v-if="!code" class="text-xs text-muted">
              Sample link — the real one is generated on create.
            </p>
          </div>
        </aside>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="() => { open = false }">
          Cancel
        </UButton>
        <UButton :loading="saving" :disabled="!canSave" @click="save">
          {{ code ? 'Save changes' : 'Create QR code' }}
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
