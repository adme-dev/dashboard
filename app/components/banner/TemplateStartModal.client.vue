<script setup lang="ts">
import type { BannerTemplateDB, BannerProject, BannerFolder, ArtboardState } from '~/types/banner-studio'
import type { BannerCatalogPreset } from '~/utils/banner-format-catalog'
import { buildPresetCanvas } from '~/utils/banner-format-catalog'
import { resolveBannerFormat } from '~/utils/banner-constants'
import { copyTemplateCanvas } from '~/utils/banner-template-start'
import { bannerFolderPath } from '~/utils/banner-folders'
import { apiErrorDescription, apiErrorStatus, isPossiblyAppliedFailure } from '~/utils/apiError'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ preset?: BannerCatalogPreset | null, template?: BannerTemplateDB | null }>()
const emit = defineEmits<{ created: [project: BannerProject] }>()
const name = ref('')
const clientId = ref('__unassigned__')
const folderId = ref('__unfiled__')
const selectedKeys = ref<string[]>([])
const busy = ref(false)
const loading = ref(false)
const loadFailed = ref(false)
const error = ref('')
const uncertain = ref(false)
const clients = ref<Array<{ id: string, name: string }>>([])
const folders = ref<BannerFolder[]>([])
let pendingBody: { name: string, clientId: string | null, folderId: string | null, canvasData: Record<string, ArtboardState>, tags: string[] } | null = null
const api = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const title = computed(() => props.preset?.name || props.template?.name || 'New design')
const formats = computed(() => props.preset?.formats || Object.keys(props.template?.canvasData || {}).map(resolveBannerFormat).filter((f): f is NonNullable<typeof f> => !!f))
const clientOptions = computed(() => [{ label: 'Unassigned', value: '__unassigned__' }, ...clients.value.map(c => ({ label: c.name, value: c.id }))])
const folderOptions = computed(() => [{ label: 'Unfiled', value: '__unfiled__' }, ...folders.value.map(f => ({ label: bannerFolderPath(folders.value, f.id).map(p => p.name).join(' / '), value: f.id }))])
const locked = computed(() => busy.value || uncertain.value)

watch(open, async (value) => {
  if (!value) return
  uncertain.value = false
  name.value = props.template ? props.template.name + ' (copy)' : title.value
  selectedKeys.value = formats.value.map(f => f.key)
  clientId.value = '__unassigned__'
  folderId.value = '__unfiled__'
  error.value = ''
  pendingBody = null
  loadFailed.value = false
  loading.value = true
  try {
    const [clientRows, folderRows] = await Promise.all([
      api<Array<{ id: string, name: string }>>('/api/agency/clients'),
      api<BannerFolder[]>('/api/agency/banner-studio/folders')
    ])
    clients.value = clientRows
    folders.value = folderRows
  } catch (cause) {
    loadFailed.value = true
    error.value = apiErrorDescription(cause, 'Could not load clients and folders. Close and reopen to retry.')
  } finally { loading.value = false }
})

function toggleSize(key: string, checked: boolean | 'indeterminate') {
  if (locked.value) return
  selectedKeys.value = checked === true ? [...selectedKeys.value, key] : selectedKeys.value.filter(k => k !== key)
}

async function createDraft() {
  if (busy.value || loading.value || loadFailed.value || uncertain.value || !name.value.trim() || !selectedKeys.value.length) return
  busy.value = true
  error.value = ''
  let dispatched = false
  try {
    if (!pendingBody) {
      const source = props.preset ? buildPresetCanvas(props.preset) : props.template?.canvasData
      pendingBody = {
        name: name.value.trim(),
        clientId: clientId.value === '__unassigned__' ? null : clientId.value,
        folderId: folderId.value === '__unfiled__' ? null : folderId.value,
        canvasData: copyTemplateCanvas(source, selectedKeys.value),
        tags: props.preset ? ['preset:' + props.preset.id] : ['template:' + props.template!.id]
      }
    }
    dispatched = true
    const project = await api<BannerProject>('/api/agency/banner-studio/projects', {
      method: 'POST', body: pendingBody
    })
    if (!project?.id) throw new Error('The draft response could not be verified')
    if (props.template) void api('/api/agency/banner-studio/templates/' + props.template.id + '/use', { method: 'POST' }).catch(() => {})
    uncertain.value = false
    pendingBody = null
    open.value = false
    emit('created', project)
  } catch (cause) {
    uncertain.value = dispatched && (isPossiblyAppliedFailure(cause) || (apiErrorStatus(cause) ?? 0) >= 500)
    if (!uncertain.value) pendingBody = null
    error.value = uncertain.value
      ? 'The save could not be confirmed. Check your drafts before creating another copy.'
      : apiErrorDescription(cause, 'Could not create the draft')
  } finally { busy.value = false }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="'Start ' + title"
    description="Choose the layouts and where to save your new draft."
    :dismissible="!busy"
    :close="!busy"
    :ui="{ content: 'sm:max-w-2xl' }"
  >
    <template #body>
      <div class="@container space-y-5">
        <UAlert v-if="error" color="error" :title="error" />
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Project name" class="@lg:col-span-2">
            <UInput
              v-model="name"
              class="w-full"
              :disabled="locked"
              :maxlength="255"
              autofocus
            />
          </UFormField>
          <UFormField label="Client">
            <USelectMenu
              v-model="clientId"
              aria-label="Client"
              :items="clientOptions"
              value-key="value"
              class="w-full"
              :disabled="locked || loading"
            />
          </UFormField>
          <UFormField label="Folder">
            <USelectMenu
              v-model="folderId"
              aria-label="Folder"
              :items="folderOptions"
              value-key="value"
              class="w-full"
              :disabled="locked || loading"
            />
          </UFormField>
        </div>
        <div>
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold">
              Layouts
            </h3>
            <span class="text-xs text-muted">{{ selectedKeys.length }} of {{ formats.length }} selected</span>
          </div>
          <div class="grid max-h-60 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-default p-3 @lg:grid-cols-2">
            <UCheckbox
              v-for="format in formats"
              :key="format.key"
              :model-value="selectedKeys.includes(format.key)"
              :label="format.name"
              :description="format.w + ' × ' + format.h + ' px'"
              :disabled="locked"
              @update:model-value="toggleSize(format.key, $event)"
            />
          </div>
          <p v-if="preset?.note" class="mt-3 text-xs text-muted">
            {{ preset.note }}
          </p>
          <p v-if="template" class="mt-3 text-xs text-muted">
            Copies the saved artwork and timing into an independent project.
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <span class="text-xs text-muted">Saved as a draft</span>
        <div class="flex gap-2">
          <UButton
            label="Cancel"
            variant="ghost"
            color="neutral"
            :disabled="busy"
            @click="open = false"
          />
          <UButton
            v-if="uncertain"
            label="View drafts"
            to="/agency/banner-studio"
            icon="i-lucide-folder-open"
          />
          <UButton
            v-else
            label="Create draft"
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="loading || loadFailed || !name.trim() || !selectedKeys.length"
            @click="createDraft"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
