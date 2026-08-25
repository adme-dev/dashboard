<script setup lang="ts">
import { QR_PAGE_TEMPLATES, QR_FIELD_TYPES, QrPageConfigSchema, defaultPageConfig, type QrPageConfig, type QrPageTemplate, type QrPageField } from '~~/shared/qr/page'
import type { QrCode, QrPage } from '~/composables/useQrCodes'

const props = defineProps<{ code: QrCode }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'saved', page: QrPage): void }>()

const api = useQrCodes()
const toast = useToast()

const page = ref<QrPage | null>(null)
const template = ref<QrPageTemplate>('lead')
const config = ref<QrPageConfig>(defaultPageConfig('lead'))
const loading = ref(false)
const saving = ref(false)
const publishing = ref(false)
const dirty = ref(false)
const previewNonce = ref(0)
const heroInput = ref<HTMLInputElement>()
const logoInput = ref<HTMLInputElement>()

const templateItems = [
  { label: 'Lead capture', value: 'lead', description: 'Name + mobile → callback' },
  { label: 'Register interest', value: 'interest', description: 'Launches and pre-sales' },
  { label: 'Subscribe', value: 'subscribe', description: 'Email list with an offer' },
  { label: 'Competition entry', value: 'competition', description: 'Entry form (draw + T&Cs in Competitions)' }
].filter(t => (QR_PAGE_TEMPLATES as readonly string[]).includes(t.value))
const fieldTypeItems = QR_FIELD_TYPES.map(t => ({ label: { text: 'Text', email: 'Email', tel: 'Mobile', postcode: 'Postcode', select: 'Choice', checkbox: 'Checkbox', textarea: 'Long text' }[t] ?? t, value: t }))

const previewUrl = computed(() => `${api.previewPageUrl(props.code.code)}&n=${previewNonce.value}`)
const validation = computed(() => {
  const r = QrPageConfigSchema.safeParse(config.value)
  return r.success ? '' : (r.error.issues[0]?.message ?? 'Check the page settings')
})
const fieldHint = computed(() => config.value.fields.length > 3 ? `Each extra field costs roughly 4% of completions — ${config.value.fields.length} fields is a lot for a phone.` : '')

async function load() {
  loading.value = true
  try {
    const res = await api.page(props.code.id)
    if (res.page) {
      page.value = res.page
      template.value = res.page.template
      config.value = QrPageConfigSchema.parse(res.page.config)
    } else if (res.draft) {
      page.value = null
      template.value = res.draft.template
      config.value = res.draft.config
    }
    dirty.value = false
  } finally {
    loading.value = false
  }
}
watch(open, (o) => {
  if (o) load()
}, { immediate: true })
watch(config, () => {
  dirty.value = true
}, { deep: true })

function applyTemplate(t: QrPageTemplate) {
  template.value = t
  const keep = { theme: config.value.theme, pixels: config.value.pixels, footer: config.value.footer, hero_asset_id: config.value.hero_asset_id, logo_asset_id: config.value.logo_asset_id }
  config.value = { ...defaultPageConfig(t, { clientName: props.code.client_name }), ...keep }
}
function addField() {
  if (config.value.fields.length >= 6) return
  config.value.fields.push({ key: `field_${config.value.fields.length + 1}`, label: 'New field', type: 'text', required: false })
}
function removeField(i: number) {
  config.value.fields.splice(i, 1)
}
function moveField(i: number, dir: -1 | 1) {
  const j = i + dir
  if (j < 0 || j >= config.value.fields.length) return
  const arr = config.value.fields
  ;[arr[i], arr[j]] = [arr[j] as QrPageField, arr[i] as QrPageField]
}
function slugKey(f: QrPageField) {
  f.key = f.key.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').replace(/^[^a-z]/, 'f') || 'field'
}

async function save(opts: { silent?: boolean } = {}) {
  if (validation.value) {
    toast.add({ title: 'Fix the page first', description: validation.value, color: 'error' })
    return null
  }
  saving.value = true
  try {
    const res = await api.savePage(props.code.id, { template: template.value, config: config.value })
    page.value = res.page
    dirty.value = false
    previewNonce.value++
    if (!opts.silent) toast.add({ title: 'Draft saved', color: 'success' })
    emit('saved', res.page)
    return res.page
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' })
    return null
  } finally {
    saving.value = false
  }
}
async function togglePublish() {
  if (dirty.value || !page.value) {
    const saved = await save({ silent: true })
    if (!saved) return
  }
  publishing.value = true
  try {
    const next = !page.value?.is_published
    const res = await api.publishPage(props.code.id, next)
    page.value = res.page
    toast.add({
      title: next ? 'Page published' : 'Page unpublished',
      description: next ? `Scans of ${props.code.code} now open this page.` : 'Scans go back to the destination URL.',
      color: 'success'
    })
    emit('saved', res.page)
  } catch (e: any) {
    toast.add({ title: 'Could not update', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    publishing.value = false
  }
}
async function upload(kind: 'hero' | 'logo', e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!page.value) {
    const saved = await save({ silent: true })
    if (!saved) return
  }
  try {
    const { asset } = await api.uploadPageAsset(props.code.id, file, kind)
    if (kind === 'hero') config.value.hero_asset_id = asset.id
    else config.value.logo_asset_id = asset.id
    await save({ silent: true })
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Hosted page"
    :description="`Scans of ${code.code} open this page instead of the destination URL once it's published.`"
    :ui="{ content: 'max-w-6xl' }"
  >
    <template #body>
      <div v-if="loading" class="space-y-3">
        <USkeleton class="h-8 w-1/2" />
        <USkeleton class="h-40" />
      </div>
      <div v-else class="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="min-w-0 space-y-7">
          <section>
            <h4 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Template
            </h4>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button
                v-for="t in templateItems"
                :key="t.value"
                type="button"
                class="rounded-lg p-3 text-left ring-1 transition"
                :class="template === t.value ? 'ring-2 ring-primary bg-primary/5' : 'ring-default hover:ring-accented'"
                @click="applyTemplate(t.value as QrPageTemplate)"
              >
                <p class="text-sm font-medium">
                  {{ t.label }}
                </p>
                <p class="mt-0.5 text-[11px] text-muted">
                  {{ t.description }}
                </p>
              </button>
            </div>
          </section>

          <section class="space-y-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Copy
            </h4>
            <UFormField label="Headline" required>
              <UInput v-model="config.headline" class="w-full" maxlength="120" />
            </UFormField>
            <UFormField label="Sub-headline">
              <UInput v-model="config.subheadline" class="w-full" maxlength="200" />
            </UFormField>
            <UFormField label="Body" help="Plain text. **bold**, *italic*, [links](https://…) and - lists work.">
              <UTextarea v-model="config.body_md" :rows="4" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Logo">
                <input
                  ref="logoInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  class="hidden"
                  @change="upload('logo', $event)"
                >
                <div class="flex items-center gap-2">
                  <UButton
                    size="sm"
                    variant="soft"
                    icon="i-lucide-image-plus"
                    @click="logoInput?.click()"
                  >
                    {{ config.logo_asset_id ? 'Replace' : 'Add logo' }}
                  </UButton>
                  <UButton
                    v-if="config.logo_asset_id"
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-x"
                    @click="config.logo_asset_id = null"
                  />
                </div>
              </UFormField>
              <UFormField label="Hero image" help="Under 2 MB. Shown above the headline.">
                <input
                  ref="heroInput"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  class="hidden"
                  @change="upload('hero', $event)"
                >
                <div class="flex items-center gap-2">
                  <UButton
                    size="sm"
                    variant="soft"
                    icon="i-lucide-image-plus"
                    @click="heroInput?.click()"
                  >
                    {{ config.hero_asset_id ? 'Replace' : 'Add image' }}
                  </UButton>
                  <UButton
                    v-if="config.hero_asset_id"
                    size="sm"
                    variant="ghost"
                    color="neutral"
                    icon="i-lucide-x"
                    @click="config.hero_asset_id = null"
                  />
                </div>
              </UFormField>
            </div>
          </section>

          <section class="space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
                Form fields
              </h4>
              <UButton
                size="xs"
                variant="soft"
                icon="i-lucide-plus"
                :disabled="config.fields.length >= 6"
                @click="addField"
              >
                Add field
              </UButton>
            </div>
            <p v-if="fieldHint" class="text-xs text-warning">
              {{ fieldHint }}
            </p>
            <div v-for="(f, i) in config.fields" :key="i" class="grid grid-cols-[1fr_1fr_120px_auto] items-end gap-2 rounded-lg bg-elevated/50 p-2">
              <UFormField label="Label" size="sm">
                <UInput
                  v-model="f.label"
                  size="sm"
                  class="w-full"
                  maxlength="80"
                />
              </UFormField>
              <UFormField label="Key" size="sm" help="Lead field name">
                <UInput
                  v-model="f.key"
                  size="sm"
                  class="w-full font-mono"
                  maxlength="40"
                  @blur="slugKey(f)"
                />
              </UFormField>
              <UFormField label="Type" size="sm">
                <USelectMenu
                  v-model="f.type"
                  :items="fieldTypeItems"
                  value-key="value"
                  size="sm"
                  class="w-full"
                />
              </UFormField>
              <div class="flex items-center gap-1 pb-1">
                <UTooltip text="Required">
                  <UCheckbox v-model="f.required" />
                </UTooltip>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-chevron-up"
                  :disabled="i === 0"
                  @click="moveField(i, -1)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-chevron-down"
                  :disabled="i === config.fields.length - 1"
                  @click="moveField(i, 1)"
                />
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-trash-2"
                  @click="removeField(i)"
                />
              </div>
              <UFormField
                v-if="f.type === 'select'"
                label="Options (comma separated)"
                size="sm"
                class="col-span-4"
              >
                <UInput
                  :model-value="(f.options ?? []).join(', ')"
                  size="sm"
                  class="w-full"
                  @update:model-value="(v: string) => f.options = v.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20)"
                />
              </UFormField>
            </div>
            <UFormField label="Button text" class="max-w-xs">
              <UInput v-model="config.cta_label" maxlength="40" class="w-full" />
            </UFormField>
          </section>

          <section class="space-y-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Consent
            </h4>
            <UFormField label="Privacy collection notice" help="Shown under the form. Say why you collect the details and how to opt out.">
              <UTextarea v-model="config.consent_text" :rows="3" class="w-full" />
            </UFormField>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-[auto_1fr]">
              <UFormField label="Marketing opt-in" help="Unticked by default (Spam Act).">
                <USwitch v-model="config.marketing_consent" />
              </UFormField>
              <UFormField label="Opt-in label">
                <UInput
                  v-model="config.marketing_consent_label"
                  :disabled="!config.marketing_consent"
                  class="w-full"
                  maxlength="200"
                />
              </UFormField>
            </div>
          </section>

          <section class="space-y-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              After submitting
            </h4>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField label="Success headline" required>
                <UInput v-model="config.success_headline" class="w-full" maxlength="120" />
              </UFormField>
              <UFormField label="Then send them to" help="Optional. Tagged with the code's UTMs.">
                <UInput
                  :model-value="config.success_redirect_url ?? ''"
                  placeholder="https://client.com.au/thanks"
                  class="w-full"
                  @update:model-value="(v: string) => config.success_redirect_url = v.trim() || null"
                />
              </UFormField>
            </div>
            <UFormField label="Success message">
              <UTextarea v-model="config.success_body" :rows="2" class="w-full" />
            </UFormField>
          </section>

          <section class="space-y-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Look
            </h4>
            <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <UFormField label="Scheme">
                <USelectMenu
                  v-model="config.theme.scheme"
                  :items="[{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <QrColorField v-model="config.theme.bg" label="Background" />
              <QrColorField v-model="config.theme.fg" label="Text" />
              <QrColorField v-model="config.theme.accent" label="Button" />
            </div>
          </section>

          <section class="space-y-4">
            <h4 class="text-xs font-semibold uppercase tracking-wider text-muted">
              Footer &amp; tracking
            </h4>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField label="Promoter / business name">
                <UInput v-model="config.footer.promoter_name" class="w-full" maxlength="120" />
              </UFormField>
              <UFormField label="Privacy policy URL">
                <UInput :model-value="config.footer.privacy_url ?? ''" class="w-full" @update:model-value="(v: string) => config.footer.privacy_url = v.trim() || null" />
              </UFormField>
              <UFormField label="Terms URL">
                <UInput :model-value="config.footer.terms_url ?? ''" class="w-full" @update:model-value="(v: string) => config.footer.terms_url = v.trim() || null" />
              </UFormField>
            </div>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <UFormField label="GA4 measurement ID" help="G-XXXXXXX">
                <UInput :model-value="config.pixels.ga4_measurement_id ?? ''" class="w-full font-mono" @update:model-value="(v: string) => config.pixels.ga4_measurement_id = v.trim() || null" />
              </UFormField>
              <UFormField label="Meta pixel ID">
                <UInput :model-value="config.pixels.meta_pixel_id ?? ''" class="w-full font-mono" @update:model-value="(v: string) => config.pixels.meta_pixel_id = v.trim() || null" />
              </UFormField>
              <UFormField label="GTM container" help="GTM-XXXXXX">
                <UInput :model-value="config.pixels.gtm_container_id ?? ''" class="w-full font-mono" @update:model-value="(v: string) => config.pixels.gtm_container_id = v.trim() || null" />
              </UFormField>
            </div>
            <p class="text-xs text-muted">
              Pixels only load once the visitor's consent allows it — automatic in Australia, opt-in for EU visitors.
            </p>
          </section>
        </div>

        <aside class="lg:sticky lg:top-0 lg:self-start">
          <div class="rounded-xl bg-elevated/60 p-3">
            <div class="mb-2 flex items-center justify-between">
              <p class="text-xs font-semibold uppercase tracking-wider text-muted">
                Preview
              </p>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                icon="i-lucide-refresh-cw"
                :loading="saving"
                @click="() => { save({ silent: true }) }"
              >
                Refresh
              </UButton>
            </div>
            <div class="mx-auto w-[300px] overflow-hidden rounded-[28px] border-[6px] border-black/80 bg-black shadow-xl dark:border-white/20">
              <iframe
                :src="previewUrl"
                title="Page preview"
                class="block h-[560px] w-full bg-white"
                sandbox="allow-same-origin allow-scripts"
              />
            </div>
            <p class="mt-2 text-center text-[11px] text-muted">
              Preview shows the last saved draft.
            </p>
          </div>
        </aside>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UBadge :color="page?.is_published ? 'success' : 'neutral'" variant="subtle">
          {{ page?.is_published ? 'Published' : page ? 'Draft' : 'Not saved' }}
        </UBadge>
        <span v-if="page" class="text-xs text-muted tabular-nums">{{ page.submissions_count }} submissions</span>
        <span v-if="validation" class="text-xs text-error">{{ validation }}</span>
        <div class="ml-auto flex gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { open = false }">
            Close
          </UButton>
          <UButton
            variant="soft"
            :loading="saving"
            :disabled="!!validation"
            @click="() => { save() }"
          >
            Save draft
          </UButton>
          <UButton
            :loading="publishing"
            :disabled="!!validation"
            :color="page?.is_published ? 'neutral' : 'primary'"
            :icon="page?.is_published ? 'i-lucide-eye-off' : 'i-lucide-rocket'"
            @click="togglePublish"
          >
            {{ page?.is_published ? 'Unpublish' : 'Publish' }}
          </UButton>
        </div>
      </div>
    </template>
  </USlideover>
</template>
