<script setup lang="ts">
import type { BannerProject, ArtboardState } from '~/types/banner-studio'
import { importTags, packageFile, sameImportedCanvas } from '~/utils/thebrief-import'
import { readImportBatch, type TheBriefImportRow } from '~/utils/thebrief-import-batch'
import { beginImportAttempt, finishImportAttempt, importAttemptKey } from '~/utils/thebrief-import-attempt'
import { prepareBannerUploadRequest } from '~/utils/bannerUpload'

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [] }>()
const api = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const { uploadCustomFont, refreshCustomFonts } = useBannerFonts()
const clients = ref<Array<{ id: string, name: string }>>([])
const files = ref<File[]>([])
const rows = ref<TheBriefImportRow[]>([])
const filesValid = ref(true)
const busy = ref(false)
const error = ref('')
const progress = ref('')
// Reuse acknowledged uploads within this modal; uncertain attempts are held separately.
const uploaded = new Map<string, string>()
const options = computed(() => [{ label: 'Choose client', value: '__unassigned__' }, ...clients.value.map(c => ({ label: c.name, value: c.id }))])
const ready = computed(() => filesValid.value && rows.value.some(r => r.clientId !== '__unassigned__' && !r.projectId))

watch(open, async (value) => {
  if (!value) return
  try {
    clients.value = await api('/api/agency/clients')
  } catch {
    error.value = 'Could not load clients. Close and reopen to retry.'
  }
})

async function readPackages() {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    // Commit the new selection only after every added package is validated.
    rows.value = await readImportBatch(files.value, rows.value, clients.value)
    filesValid.value = true
  } catch (cause) {
    filesValid.value = false
    error.value = cause instanceof Error ? cause.message : 'Could not read import package'
  } finally { busy.value = false }
}

function startNextBatch() {
  if (busy.value) return
  files.value = []
  rows.value = []
  filesValid.value = true
  error.value = ''
}

async function importDrafts() {
  if (busy.value || !ready.value) return
  busy.value = true
  error.value = ''
  let changed = false
  try {
    const existing = await api<BannerProject[]>('/api/agency/banner-studio/projects')
    const fonts = await refreshCustomFonts()
    for (const row of rows.value) {
      if (row.projectId || row.clientId === '__unassigned__') continue
      if (!clients.value.some(c => c.id === row.clientId)) throw new Error('Select an existing client')
      const pkg = row.pkg
      const duplicate = existing.find(p => p.clientId === row.clientId && p.tags?.includes(`source-sha256:${pkg.source.sha256}`))
      if (duplicate) {
        row.projectId = duplicate.id
        row.status = 'Already imported — open the original for review'
        continue
      }
      progress.value = `Preparing ${pkg.name}`
      row.status = 'Uploading assets and fonts…'
      const attemptKey = importAttemptKey(row.clientId, pkg.source.sha256)
      try {
        beginImportAttempt(localStorage, attemptKey)
        for (const font of pkg.fonts) {
          if (fonts.some(f => f.name === font.family && f.tags.includes(`weight:${font.weight}`))) continue
          const stored = await uploadCustomFont(await packageFile(font), font.family, font.weight)
          if (!stored || stored.name !== font.family || !stored.tags.includes(`weight:${font.weight}`)) throw new Error('Stored font differs from the prepared package')
          fonts.push(stored)
        }
        const canvasData = structuredClone(toRaw(pkg.canvasData)) as Record<string, ArtboardState>
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
        const project = await api<BannerProject>('/api/agency/banner-studio/projects', {
          method: 'POST', headers: { 'Idempotency-Key': `thebrief-project:${row.clientId}:${pkg.source.sha256}` },
          body: { name: pkg.name, clientId: row.clientId, canvasData, tags: importTags(pkg) }
        })
        // A write response alone is insufficient: verify persisted owner and layer data.
        const saved = await api<BannerProject>(`/api/agency/banner-studio/projects/${project.id}`)
        if (saved.clientId !== row.clientId || !sameImportedCanvas(saved.canvasData, canvasData)) throw new Error('Saved project needs a persistence check before retrying')
        finishImportAttempt(localStorage, attemptKey)
        row.projectId = saved.id
        row.status = 'Saved as draft · needs visual review'
        existing.push(saved)
        changed = true
      } catch (cause) {
        row.status = cause instanceof Error ? cause.message : 'Import failed'
        // Retain the durable attempt marker on failure: a lost response may have committed.
        throw new Error(`${pkg.name}: ${row.status}`, { cause })
      }
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Import failed' } finally {
    busy.value = false
    progress.value = ''
    if (changed) emit('imported')
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
        <UFormField label="Import packages" help="Up to 10 packages. Keep the original HTML5 archives for reference.">
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
        <div class="max-h-[45vh] space-y-3 overflow-y-auto">
          <section v-for="(row, index) in rows" :key="`${row.pkg.source.sha256}:${index}`" class="space-y-3 rounded-lg border border-default p-4">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div class="min-w-0">
                <h3 class="break-words font-medium">
                  {{ row.pkg.name }}
                </h3>
                <p class="text-xs text-muted">
                  {{ row.pkg.source.folder }} · {{ row.pkg.source.duration }} seconds · {{ row.pkg.source.loopCount === 0 ? 'Source loops continuously' : `Source plays ${row.pkg.source.loopCount} time(s)` }}
                </p>
              </div>
              <UBadge color="neutral" variant="subtle">
                {{ Object.keys(row.pkg.canvasData)[0]?.replace('custom_', '') }}
              </UBadge>
            </div>
            <UFormField label="Client" help="Confirm ownership before importing. Unassigned designs are skipped.">
              <USelectMenu
                v-model="row.clientId"
                :items="options"
                value-key="value"
                class="w-full"
                :disabled="busy || !!row.projectId"
              />
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
            <p class="text-sm" role="status">
              {{ row.status }}
            </p>
            <UButton
              v-if="row.projectId"
              :to="`/agency/banner-studio/${row.projectId}`"
              variant="outline"
              color="neutral"
              icon="i-lucide-arrow-up-right"
            >
              Open in Banner Studio
            </UButton>
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
          All imports stay as drafts. Nothing is published.
        </p>
        <UButton
          :loading="busy"
          :disabled="!ready || busy"
          icon="i-lucide-download"
          @click="importDrafts"
        >
          Import assigned drafts
        </UButton>
      </div>
    </template>
  </UModal>
</template>
