<script setup lang="ts">
import { DEFAULT_STYLE, type QrStyle } from '~~/shared/qr/style'
import { DEFAULT_FRAME, QR_FRAME_STYLES, QR_FRAME_STYLE_LABELS, QR_FRAME_LABEL_MAX, type QrFrame } from '~~/shared/qr/frame'
import { QR_UTM_MEDIUMS, type QrUtmMedium } from '~~/shared/qr/tracking'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'
import { BULK_MAX_VARIANTS, DEFAULT_NAME_PATTERN, expandNames, numberedVariants, parseVariantsInput } from '~~/shared/qr/bulk'
import type { QrFolder } from '~/composables/useQrCodes'

/**
 * "Create variants": N codes from one definition, grouped under a campaign.
 * Variants come from a pasted list (one per line) or a numbered count.
 */
const props = defineProps<{ clientId?: string, folderId?: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'created', campaignId: string): void }>()

const api = useQrCodes()
const toast = useToast()
const { data: clientsData } = await useFetch<any[]>('/api/agency/clients') // bare array (see memory)
const clients = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))

const form = reactive({
  clientId: props.clientId ?? '',
  folderId: (props.folderId ?? null) as string | null,
  campaignName: '',
  baseName: '',
  namePattern: DEFAULT_NAME_PATTERN,
  mode: 'list' as 'list' | 'count',
  variantsText: '',
  count: 10,
  countPrefix: '',
  destinationUrl: '',
  style: { ...DEFAULT_STYLE } as QrStyle,
  frame: { ...DEFAULT_FRAME } as QrFrame,
  utmEnabled: true,
  utmMedium: 'print' as QrUtmMedium
})
const folders = ref<QrFolder[]>([])
const creating = ref(false)

watch(open, (v) => {
  if (!v) return
  form.clientId = props.clientId ?? form.clientId
  form.folderId = props.folderId ?? null
})
watch(() => form.clientId, async (id) => {
  folders.value = id ? (await api.folders(id)).folders : []
}, { immediate: true })

const variants = computed(() => form.mode === 'list' ? parseVariantsInput(form.variantsText) : numberedVariants(form.count, form.countPrefix))
const previewNames = computed(() => expandNames(form.namePattern, form.baseName || 'Base name', variants.value).slice(0, 4))
const urlError = computed(() => {
  if (!form.destinationUrl) return ''
  const d = validateDestinationUrl(form.destinationUrl)
  return isDestinationInvalid(d) ? d.reason : ''
})
const canCreate = computed(() => !!form.clientId && !!form.campaignName.trim() && !!form.baseName.trim() && variants.value.length > 0 && !!form.destinationUrl && !urlError.value)

const folderItems = computed(() => [{ label: 'No folder', value: 'none' }, ...folders.value.map(f => ({ label: f.name, value: f.id }))])
const folderModel = computed({
  get: () => form.folderId ?? 'none',
  set: (v: string) => { form.folderId = v === 'none' ? null : v }
})
const modeItems = [{ label: 'Paste a list', value: 'list' }, { label: 'Numbered', value: 'count' }]
const mediumItems = QR_UTM_MEDIUMS.map(value => ({ label: value, value }))
const frameStyleItems = QR_FRAME_STYLES.map(value => ({ label: QR_FRAME_STYLE_LABELS[value], value }))

async function create() {
  if (!canCreate.value) return
  creating.value = true
  try {
    const res = await api.bulkCreate({
      clientId: form.clientId,
      folderId: form.folderId,
      campaignName: form.campaignName.trim(),
      baseName: form.baseName.trim(),
      namePattern: form.namePattern,
      variants: variants.value,
      destinationUrl: form.destinationUrl,
      style: form.style,
      frame: form.frame,
      utmEnabled: form.utmEnabled,
      utmMedium: form.utmMedium
    })
    toast.add({ title: `${res.codes.length} ${res.codes.length === 1 ? 'code' : 'codes'} created`, description: 'Download them all from the campaign.', color: 'success' })
    emit('created', res.campaignId)
    open.value = false
    await navigateTo(`/agency/qr-codes/campaigns/${res.campaignId}`)
  } catch (e: any) {
    toast.add({ title: 'Could not create variants', description: e?.data?.statusMessage ?? 'Unknown error', color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Create variants"
    description="One code per table, window, flyer or dealer — created together, tracked separately."
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Client" required>
            <USelectMenu
              v-model="form.clientId"
              :items="clients"
              value-key="value"
              :search-input="{ placeholder: 'Find a client…' }"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Folder">
            <USelectMenu
              v-model="folderModel"
              :items="folderItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Campaign" required help="Groups the codes for roll-up analytics and a single ZIP download.">
            <UInput v-model="form.campaignName" placeholder="Spring catalogue 2026" class="w-full" />
          </UFormField>
          <UFormField label="Base name" required help="Shared part of every code's name.">
            <UInput v-model="form.baseName" placeholder="Spring catalogue" class="w-full" />
          </UFormField>
        </div>
        <UFormField label="Destination URL" required :error="urlError || undefined">
          <UInput v-model="form.destinationUrl" placeholder="https://" class="w-full" />
        </UFormField>

        <section class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
            Variants
          </h4>
          <UTabs
            v-model="form.mode"
            :items="modeItems"
            value-key="value"
            size="sm"
            :content="false"
          />
          <UFormField v-if="form.mode === 'list'" :label="`One per line · ${variants.length}/${BULK_MAX_VARIANTS}`" help="Commas work too.">
            <UTextarea
              v-model="form.variantsText"
              :rows="5"
              placeholder="Front window&#10;Counter&#10;Service desk"
              class="w-full"
            />
          </UFormField>
          <div v-else class="grid grid-cols-2 gap-4">
            <UFormField label="How many">
              <UInput
                v-model.number="form.count"
                type="number"
                :min="1"
                :max="BULK_MAX_VARIANTS"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Prefix" help="e.g. “Table ” → Table 01, Table 02…">
              <UInput v-model="form.countPrefix" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Name pattern" help="{base}, {variant} and {n} are replaced per code.">
            <UInput v-model="form.namePattern" class="w-full font-mono text-sm" />
          </UFormField>
          <ul v-if="variants.length" class="rounded-lg bg-elevated/60 px-3 py-2 text-xs text-muted space-y-0.5">
            <li v-for="n in previewNames" :key="n" class="truncate">
              {{ n }}
            </li>
            <li v-if="variants.length > previewNames.length">
              … and {{ variants.length - previewNames.length }} more
            </li>
          </ul>
        </section>

        <section class="space-y-3">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
            Shared settings
          </h4>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Placement (utm_medium)">
              <USelectMenu
                v-model="form.utmMedium"
                :items="mediumItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="Tag the destination">
              <USwitch v-model="form.utmEnabled" :label="form.utmEnabled ? 'On' : 'Off'" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Frame">
              <USelectMenu
                v-model="form.frame.style"
                :items="frameStyleItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField v-if="form.frame.style !== 'none'" label="Label">
              <UInput
                v-model="form.frame.label"
                :maxlength="QR_FRAME_LABEL_MAX"
                placeholder="Scan me"
                class="w-full"
              />
            </UFormField>
          </div>
          <QrStylePicker v-model="form.style" />
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p class="text-xs text-muted">
          Every code gets its own short link; each can be edited later.
        </p>
        <div class="flex gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { open = false }">
            Cancel
          </UButton>
          <UButton
            :loading="creating"
            :disabled="!canCreate"
            icon="i-lucide-copy-plus"
            @click="create"
          >
            Create {{ variants.length || '' }} {{ variants.length === 1 ? 'code' : 'codes' }}
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
