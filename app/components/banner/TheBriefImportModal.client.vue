<script setup lang="ts">
import { parseDate } from '@internationalized/date'
import type { DateValue } from '@internationalized/date'
import type { BannerProject, ArtboardState, BannerFolder } from '~/types/banner-studio'
import { bannerFolderPath } from '~/utils/banner-folders'
import { importTags, packageFile, sameImportedCanvas } from '~/utils/thebrief-import'
import { importRowStates, readImportBatch, reconcileImportRows, summariseImport, UNASSIGNED_CLIENT, UNFILED_FOLDER, type TheBriefImportRow, type TheBriefImportState } from '~/utils/thebrief-import-batch'
import { finishImportAttempt, importAttemptKey } from '~/utils/thebrief-import-attempt'
import { prepareBannerUploadRequest } from '~/utils/bannerUpload'
import { bindImportedFontFace, findImportedFontFace } from '~/utils/thebrief-font-bindings'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const api = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const { uploadCustomFont, refreshCustomFonts } = useBannerFonts()
const clients = ref<Array<{ id: string, name: string }>>([])
const folders = ref<BannerFolder[]>([])
const files = ref<File[]>([])
const rows = ref<TheBriefImportRow[]>([])
const busy = ref(false)
const error = ref('')
const progress = ref('')
const attempted = ref(false)
// Explicit, per-batch operator choice: import undated drafts and mark them for a
// later Created-date backfill instead of holding them. Never substitutes a date.
const importUndated = ref(false)
const showDraftUpdate = ref(false)
const draftUpdate = shallowRef<{ row: TheBriefImportRow, project: BannerProject, canvasData?: Record<string, ArtboardState> } | null>(null)
const draftUpdateError = ref('')
const draftUpdateConflict = ref(false)
// Reuse acknowledged uploads within this modal. Asset and font uploads are keyed by checksum.
const uploaded = new Map<string, string>()
const options = computed(() => [{ label: 'Choose client', value: UNASSIGNED_CLIENT }, ...clients.value.map(c => ({ label: c.name, value: c.id }))])
const folderOptions = computed(() => [{ label: 'Unfiled', value: UNFILED_FOLDER }, ...folders.value.map(folder => ({ label: bannerFolderPath(folders.value, folder.id).map(part => part.name).join(' / '), value: folder.id }))])
const states = computed(() => importRowStates(rows.value, { importUndated: importUndated.value }))
const counts = computed(() => summariseImport(states.value))
const readyRows = computed(() => rows.value.filter((_, index) => states.value[index]?.state === 'ready'))
// After an import the summary leads with outcomes: Saved, Needs attention, Failed.
const summaryOrder = computed<TheBriefImportState[]>(() => attempted.value ? ['saved', 'attention', 'failed', 'invalid', 'ready'] : ['ready', 'attention', 'invalid', 'saved', 'failed'])
const stateBadges: Record<TheBriefImportState, { label: string, color: 'neutral' | 'success' | 'warning' | 'error' | 'info' }> = {
  ready: { label: 'Ready', color: 'neutral' },
  attention: { label: 'Needs attention', color: 'warning' },
  invalid: { label: 'Invalid', color: 'error' },
  importing: { label: 'Importing', color: 'info' },
  saved: { label: 'Saved', color: 'success' },
  failed: { label: 'Failed', color: 'error' }
}

function calendarDate(value: string): DateValue | null {
  if (!value) return null
  try {
    return parseDate(value)
  } catch {
    return null
  }
}

function displayDate(value: string): string {
  const date = calendarDate(value)
  return date ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date.year, date.month - 1, date.day)) : ''
}

function failureOf(cause: unknown) {
  const failure = cause as { statusCode?: number, status?: number, data?: { statusMessage?: string, data?: { projectId?: string } }, statusMessage?: string }
  return {
    status: failure?.statusCode || failure?.status,
    message: failure?.data?.statusMessage || failure?.statusMessage || (cause instanceof Error ? cause.message : 'Import failed'),
    projectId: failure?.data?.data?.projectId
  }
}

watch(open, async (value) => {
  if (!value) return
  try {
    const [availableClients, availableFolders] = await Promise.all([
      api<Array<{ id: string, name: string }>>('/api/agency/clients'),
      api<BannerFolder[]>('/api/agency/banner-studio/folders')
    ])
    clients.value = availableClients
    folders.value = availableFolders
  } catch {
    error.value = 'Could not load clients. Close and reopen to retry.'
  }
})

async function reconcileWithLibrary() {
  // Saved drafts carry their source identity, so the library is the durable record of progress.
  reconcileImportRows(rows.value, await api<BannerProject[]>('/api/agency/banner-studio/projects'))
}

async function readPackages() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    rows.value = await readImportBatch(files.value, rows.value, clients.value, folders.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not read import packages'
    busy.value = false
    return
  }
  try {
    await reconcileWithLibrary()
  } catch {
    // Not fatal: the import reconciles again and the server deduplicates every write.
  } finally { busy.value = false }
}

function startNextBatch() {
  if (busy.value) return
  files.value = []
  rows.value = []
  attempted.value = false
  error.value = ''
}

async function prepareCanvas(row: TheBriefImportRow) {
  const pkg = row.pkg!
  const fonts = await refreshCustomFonts(row.clientId)
  const canvasData = structuredClone(toRaw(pkg.canvasData)) as Record<string, ArtboardState>
  for (const font of pkg.fonts) {
    let stored = findImportedFontFace(fonts, font, row.clientId)
    if (!stored) {
      stored = await uploadCustomFont(await packageFile(font), font.family, font.weight, row.clientId) || undefined
      if (stored) fonts.push(stored)
    }
    if (!stored) throw new Error('Could not store the prepared font')
    bindImportedFontFace(canvasData, font, stored, row.clientId)
  }
  for (const asset of pkg.assets) {
    const identity = `${row.clientId}:${asset.sha256}`
    if (!uploaded.has(identity)) {
      const request = await prepareBannerUploadRequest(await packageFile(asset), `thebrief-asset:${identity}`, row.clientId)
      const stored = await api<{ url: string, clientId: string }>('/api/agency/banner-studio/assets/upload', { method: 'POST', ...request })
      if (!stored.url || stored.clientId !== row.clientId) throw new Error('Upload did not return a managed asset for the selected client')
      uploaded.set(identity, stored.url)
    }
    for (const board of Object.values(canvasData)) for (const layer of board.layers) if (layer.src === asset.path) layer.src = uploaded.get(identity)!
  }
  return canvasData
}

async function openDraftUpdate(row: TheBriefImportRow) {
  if (busy.value || !row.projectId || !row.pkg) return
  busy.value = true
  error.value = ''
  try {
    const project = await api<BannerProject>(`/api/agency/banner-studio/projects/${row.projectId}`)
    if (project.clientId !== row.clientId || project.status !== 'draft' || !project.tags.includes('import:needs-review')
      || !project.tags.includes(`source-sha256:${row.pkg.source.sha256}`) || !project.tags.includes(`source-design:${row.pkg.source.designHash}`)) {
      throw new Error('Only an unreviewed draft from this exact source and client can be updated')
    }
    draftUpdate.value = { row, project }
    draftUpdateError.value = ''
    draftUpdateConflict.value = false
    showDraftUpdate.value = true
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Could not load the imported draft'
  } finally {
    busy.value = false
  }
}

async function updateImportedDraft() {
  const selection = draftUpdate.value
  if (busy.value || !selection || draftUpdateConflict.value) return
  busy.value = true
  draftUpdateError.value = ''
  progress.value = `Updating ${selection.project.name}`
  try {
    // Keep the same canvas and expected revision on a retry after an uncertain response.
    selection.canvasData ??= await prepareCanvas(selection.row)
    const updated = await api<BannerProject & { refreshed: boolean }>(`/api/agency/banner-studio/projects/${selection.project.id}/thebrief-refresh`, {
      method: 'PATCH', body: {
        clientId: selection.row.clientId, expectedUpdatedAt: selection.project.updatedAt,
        source: selection.row.pkg!.source, canvasData: selection.canvasData
      }
    })
    const saved = await api<BannerProject>(`/api/agency/banner-studio/projects/${updated.id}`)
    if (saved.clientId !== selection.row.clientId || saved.updatedAt !== updated.updatedAt || !sameImportedCanvas(saved.canvasData, selection.canvasData)) {
      throw new Error('The saved draft needs a persistence check. Retry this update to check the same revision safely.')
    }
    selection.row.result = { state: 'saved', message: updated.refreshed ? 'Draft updated · previous canvas saved in version history · needs visual review' : 'Draft matches this package · needs visual review' }
    finishImportAttempt(localStorage, importAttemptKey(selection.row.clientId, selection.row.pkg!.source.sha256))
    showDraftUpdate.value = false
    draftUpdate.value = null
    emit('imported')
  } catch (cause) {
    const failure = failureOf(cause)
    draftUpdateConflict.value = failure.status === 409
    draftUpdateError.value = failure.message
  } finally {
    busy.value = false
    progress.value = ''
  }
}

/** Imports one design. Every outcome is recorded on the row; nothing here stops the batch. */
async function importRow(row: TheBriefImportRow): Promise<boolean> {
  const pkg = row.pkg!
  const folderId = row.folderId === UNFILED_FOLDER ? null : row.folderId
  const datePending = !calendarDate(row.sourceCreatedDate)
  row.result = { state: 'importing', message: 'Uploading assets and fonts…' }
  try {
    if (!clients.value.some(c => c.id === row.clientId)) throw new Error('Select an existing client')
    if (folderId && !folders.value.some(folder => folder.id === folderId)) throw new Error('Select an existing folder')
    const canvasData = await prepareCanvas(row)
    row.result = { state: 'importing', message: 'Saving draft…' }
    // A fresh key per attempt: the server resolves retries and double submits by source identity,
    // so a retry after a lost response returns the saved draft instead of creating another.
    const project = await api<BannerProject & { importOutcome?: 'created' | 'existing' }>('/api/agency/banner-studio/projects', {
      method: 'POST', headers: { 'Idempotency-Key': `thebrief:${pkg.source.sha256.slice(0, 16)}:${crypto.randomUUID()}` },
      body: { name: pkg.name, clientId: row.clientId, folderId, canvasData, tags: importTags(pkg, row.sourceCreatedDate, { datePending }) }
    })
    // A write response alone is insufficient: verify persisted owner and layer data.
    const saved = await api<BannerProject>(`/api/agency/banner-studio/projects/${project.id}`)
    if (saved.clientId !== row.clientId) throw new Error('Saved project belongs to another client; check the library before retrying')
    row.projectId = saved.id
    finishImportAttempt(localStorage, importAttemptKey(row.clientId, pkg.source.sha256))
    if (project.importOutcome === 'existing') {
      // The existing draft may have been edited or moved since; it is kept exactly as it is.
      row.result = { state: 'saved', message: 'Already imported · existing draft kept · open for review' }
      return false
    }
    if (saved.folderId !== folderId || !sameImportedCanvas(saved.canvasData, canvasData)) throw new Error('Saved project needs a persistence check. Retry to resolve it to the saved draft.')
    row.result = { state: 'saved', message: datePending ? 'Saved as draft · creation date pending backfill · needs visual review' : 'Saved as draft · needs visual review' }
    return true
  } catch (cause) {
    const failure = failureOf(cause)
    if (failure.status === 409 && failure.projectId) {
      row.projectId = failure.projectId
      row.result = { state: 'attention', message: failure.message }
    } else {
      row.result = { state: 'failed', message: failure.message }
    }
    return false
  }
}

async function importDrafts() {
  if (busy.value || !readyRows.value.length) return
  busy.value = true
  error.value = ''
  attempted.value = true
  let changed = false
  try {
    await reconcileWithLibrary()
  } catch (cause) {
    error.value = `Could not check the banner library, so nothing was imported. ${failureOf(cause).message}`
    busy.value = false
    return
  }
  try {
    const queue = readyRows.value
    for (const [index, row] of queue.entries()) {
      progress.value = `Importing ${index + 1} of ${queue.length}: ${row.pkg!.name}`
      if (await importRow(row)) changed = true
    }
  } finally {
    busy.value = false
    progress.value = ''
    if (changed) emit('imported')
  }
}

async function retryRow(row: TheBriefImportRow) {
  if (busy.value || row.result?.state !== 'failed') return
  busy.value = true
  progress.value = `Retrying ${row.pkg!.name}`
  try {
    if (await importRow(row)) emit('imported')
  } finally {
    busy.value = false
    progress.value = ''
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Import from TheBrief"
    description="Assign each prepared design to its client and save it as a draft for review."
    :dismissible="!busy"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="space-y-5">
        <UAlert
          icon="i-lucide-info"
          color="neutral"
          variant="subtle"
          title="Prepared native packages"
          description="This pilot accepts .xeroflow.json files prepared from HTML5 exports. Original ZIP upload is not yet supported here. Imports retain editable layers; playback, fonts and loop behaviour still need visual review."
        />
        <UFormField label="Import packages" help="Up to 50 prepared packages per batch. Keep the original HTML5 archives for reference.">
          <UFileUpload
            v-model="files"
            multiple
            :preview="false"
            accept=".json"
            label="Choose prepared banner packages"
            class="w-full"
            :disabled="busy"
            @update:model-value="readPackages"
          />
        </UFormField>
        <UButton
          v-if="files.length"
          variant="ghost"
          color="neutral"
          icon="i-lucide-list-restart"
          :disabled="busy"
          @click="startNextBatch"
        >
          Start next batch
        </UButton>
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          title="Import needs attention"
          :description="error"
        />
        <UAlert
          v-if="rows.some(row => row.pkg && !row.result && row.clientId !== UNASSIGNED_CLIENT && !row.sourceCreatedDate)"
          color="warning"
          variant="subtle"
          title="Original dates needed"
          :description="importUndated ? 'Drafts without a verified TheBrief creation date will be saved and marked for a later date backfill. No date is assigned.' : 'New drafts without a verified TheBrief creation date need attention and are not imported.'"
        >
          <template #actions>
            <UCheckbox
              v-model="importUndated"
              label="Import undated drafts and backfill the date later"
              :disabled="busy"
            />
          </template>
        </UAlert>
        <div
          v-if="rows.length"
          class="flex flex-wrap items-center gap-2"
          role="status"
          aria-label="Batch summary"
        >
          <template v-for="state in summaryOrder" :key="state">
            <UBadge
              v-if="counts[state]"
              :color="stateBadges[state].color"
              variant="subtle"
            >
              {{ stateBadges[state].label }}: {{ counts[state] }}
            </UBadge>
          </template>
        </div>
        <div class="max-h-[45vh] space-y-3 overflow-y-auto">
          <section v-for="(row, index) in rows" :key="`${row.file.name}:${index}`" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="break-words font-medium">
                  {{ row.pkg?.name || row.file.name }}
                </h3>
                <p v-if="row.pkg" class="text-xs text-muted">
                  {{ row.pkg.source.folder }} · {{ row.pkg.source.duration }} seconds · {{ row.pkg.source.loopCount === 0 ? 'Source loops continuously' : `Source plays ${row.pkg.source.loopCount} time(s)` }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge v-if="row.pkg" color="neutral" variant="outline">
                  {{ Object.keys(row.pkg.canvasData).map(key => key.replace('custom_', '')).join(' · ') }}
                </UBadge>
                <UBadge :color="stateBadges[states[index]!.state].color" variant="subtle">
                  {{ stateBadges[states[index]!.state].label }}
                </UBadge>
              </div>
            </div>
            <template v-if="row.pkg">
              <UFormField label="Client" help="Confirm ownership before importing. Designs without a client are not imported.">
                <USelectMenu
                  v-model="row.clientId"
                  :items="options"
                  value-key="value"
                  class="w-full"
                  :disabled="busy || !!row.projectId"
                />
              </UFormField>
              <UFormField label="Folder" help="Choose where this design appears in the banner library. You can move it later.">
                <USelectMenu
                  v-model="row.folderId"
                  :items="folderOptions"
                  value-key="value"
                  class="w-full"
                  :disabled="busy || !!row.projectId"
                />
              </UFormField>
              <UFormField label="Original creation date" help="Use the Created date in TheBrief's Info panel. The export or last-updated date is different.">
                <UPopover>
                  <UButton
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-calendar"
                    class="w-full justify-start font-normal"
                    :class="!row.sourceCreatedDate && 'text-muted'"
                    :disabled="busy || !!row.projectId"
                  >
                    {{ displayDate(row.sourceCreatedDate) || 'Choose TheBrief creation date' }}
                  </UButton>
                  <template #content>
                    <UCalendar
                      :model-value="calendarDate(row.sourceCreatedDate)"
                      class="p-2"
                      @update:model-value="value => { row.sourceCreatedDate = value?.toString() || '' }"
                    />
                    <div v-if="row.sourceCreatedDate" class="flex justify-end border-t border-default p-2">
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        @click="row.sourceCreatedDate = ''"
                      >
                        Clear
                      </UButton>
                    </div>
                  </template>
                </UPopover>
              </UFormField>
              <details v-if="row.pkg.warnings.length" class="text-sm text-muted">
                <summary class="cursor-pointer">
                  {{ row.pkg.warnings.length }} conversion notes
                </summary>
                <ul class="mt-2 list-disc space-y-1 pl-5">
                  <li v-for="note in row.pkg.warnings" :key="note">
                    {{ note }}
                  </li>
                </ul>
              </details>
            </template>
            <p class="text-sm" :class="['invalid', 'failed'].includes(states[index]!.state) && 'text-error'" role="status">
              {{ states[index]!.message }}
            </p>
            <div v-if="row.projectId || states[index]!.state === 'failed'" class="flex flex-wrap gap-2">
              <UButton
                v-if="states[index]!.state === 'failed'"
                color="neutral"
                variant="outline"
                icon="i-lucide-rotate-cw"
                :disabled="busy"
                @click="retryRow(row)"
              >
                Retry
              </UButton>
              <UButton
                v-if="row.projectId"
                :to="`/agency/banner-studio/${row.projectId}`"
                variant="outline"
                color="neutral"
                icon="i-lucide-arrow-up-right"
              >
                Open in Banner Studio
              </UButton>
              <UButton
                v-if="row.projectId && row.pkg"
                variant="outline"
                color="neutral"
                icon="i-lucide-history"
                :disabled="busy"
                @click="openDraftUpdate(row)"
              >
                Update imported draft
              </UButton>
            </div>
          </section>
        </div>
        <p
          v-if="progress"
          role="status"
          aria-live="polite"
          class="text-sm text-muted"
        >
          {{ progress }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-muted">
          All imports stay as drafts. Designs import one at a time; a failure does not stop the rest.
        </p>
        <UButton
          :loading="busy"
          :disabled="!readyRows.length || busy"
          icon="i-lucide-download"
          @click="importDrafts"
        >
          {{ readyRows.length ? `Import ${readyRows.length} ready ${readyRows.length === 1 ? 'draft' : 'drafts'}` : 'Import ready drafts' }}
        </UButton>
      </div>
    </template>
  </UModal>
  <UModal
    v-model:open="showDraftUpdate"
    title="Update imported draft"
    description="Replace the imported canvas with this prepared package and retain a version backup."
    :dismissible="!busy"
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div v-if="draftUpdate" class="space-y-4">
        <div class="space-y-1">
          <p class="font-medium">
            {{ draftUpdate.project.name }}
          </p>
          <p class="text-sm text-muted">
            {{ clients.find(client => client.id === draftUpdate?.row.clientId)?.name }} ·
            {{ Object.keys(draftUpdate.row.pkg.canvasData).length }} prepared size(s)
          </p>
        </div>
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-history"
          title="The current canvas will be replaced"
          description="This includes any edits in the draft. The current canvas is saved in version history before replacement. The project name, client and folder stay the same. If the draft changes while this update is prepared, the update stops."
        />
        <p class="text-sm text-muted">
          Replacing sizes: {{ Object.keys(draftUpdate.project.canvasData).map(key => key.replace('custom_', '')).join(' · ') }}.
          Prepared sizes: {{ Object.keys(draftUpdate.row.pkg.canvasData).map(key => key.replace('custom_', '')).join(' · ') }}.
        </p>
        <UAlert
          v-if="draftUpdateError"
          color="error"
          variant="subtle"
          title="Draft update needs attention"
          :description="draftUpdateError"
        />
        <p v-if="draftUpdateConflict" class="text-sm text-muted">
          Close this confirmation and reopen the draft update to review its latest revision.
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="busy"
          @click="showDraftUpdate = false"
        >
          Cancel
        </UButton>
        <UButton
          icon="i-lucide-history"
          :loading="busy"
          :disabled="busy || draftUpdateConflict"
          @click="updateImportedDraft"
        >
          {{ draftUpdateError && !draftUpdateConflict ? 'Retry same update' : 'Back up and update draft' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
