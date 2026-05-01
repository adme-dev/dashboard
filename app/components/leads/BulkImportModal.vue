<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'imported'): void }>()

const toast = useToast()
const { data: clients } = useFetch<{ id: string; name: string }[]>('/api/agency/clients', {
  default: () => [],
})
const clientOptions = computed(() =>
  ((clients.value ?? []) as { id: string; name: string }[]).map(c => ({ value: c.id, label: c.name })),
)

const SOURCE_OPTIONS = [
  { value: 'meta', label: 'Meta (Facebook / Instagram) — Lead Center export' },
  { value: 'csv', label: 'Generic / Other' },
]

const clientId = ref<string | null>(null)
const source = ref<'meta' | 'csv'>('meta')
const formId = ref('')
const formName = ref('')
const runRules = ref(false)
const csvText = ref('')
const fileName = ref('')
const uploading = ref(false)

interface PreviewState {
  headers: string[]
  sample: string[][]
  totalRows: number
}
const preview = ref<PreviewState | null>(null)

interface ImportResult {
  imported: number
  skipped_duplicate: number
  errors: Array<{ row: number; message: string }>
}
const lastResult = ref<ImportResult | null>(null)

function previewCsv(text: string) {
  // Simple parse just for preview — full parse runs server-side.
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    preview.value = null
    return
  }
  const headers = lines[0].split(',').map((h) => h.replace(/^"|"$/g, '').trim())
  const sample = lines
    .slice(1, 6)
    .map((line) => line.split(',').map((c) => c.replace(/^"|"$/g, '').trim()))
  preview.value = { headers, sample, totalRows: lines.length - 1 }
}

async function onFile(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (file.size > 10 * 1024 * 1024) {
    toast.add({ title: 'File too large', description: 'Max 10MB. Split or filter the export.', color: 'error' })
    return
  }
  fileName.value = file.name
  csvText.value = await file.text()
  previewCsv(csvText.value)
}

function reset() {
  clientId.value = null
  source.value = 'meta'
  formId.value = ''
  formName.value = ''
  runRules.value = false
  csvText.value = ''
  fileName.value = ''
  preview.value = null
  lastResult.value = null
}

async function submit() {
  if (!clientId.value) { toast.add({ title: 'Pick a client', color: 'error' }); return }
  if (!csvText.value) { toast.add({ title: 'Upload a CSV file first', color: 'error' }); return }
  uploading.value = true
  try {
    const r = await $fetch<ImportResult>('/api/leads/import-csv', {
      method: 'POST',
      body: {
        client_id: clientId.value,
        source: source.value,
        form_id: formId.value || undefined,
        form_name: formName.value || undefined,
        run_rules: runRules.value,
        csv: csvText.value,
      },
    })
    lastResult.value = r
    if (r.imported) {
      toast.add({
        title: `Imported ${r.imported} leads`,
        description: r.skipped_duplicate ? `${r.skipped_duplicate} duplicates skipped` : undefined,
        color: 'success',
      })
      emit('imported')
    } else {
      toast.add({ title: 'No leads imported', description: 'All rows were duplicates or empty.', color: 'warning' })
    }
  } catch (e: any) {
    toast.add({ title: 'Import failed', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally {
    uploading.value = false
  }
}

function close() {
  reset()
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-5">
        <div>
          <h3 class="text-lg font-semibold">Import leads from CSV</h3>
          <p class="text-sm text-muted mt-0.5">
            For Meta Lead Center exports, or any CSV with a header row. Rows are deduped on import.
          </p>
        </div>

        <UFormField label="Client" required>
          <USelectMenu
            v-model="clientId"
            :items="clientOptions"
            value-key="value"
            placeholder="Pick a client"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Source" hint="What this CSV represents">
          <USelectMenu
            v-model="source"
            :items="SOURCE_OPTIONS"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Form ID" hint="Optional — for routing">
            <UInput v-model="formId" placeholder="e.g. 12345" class="w-full" />
          </UFormField>
          <UFormField label="Form name" hint="Optional — display label">
            <UInput v-model="formName" placeholder="e.g. Brighton SUV" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="CSV file" required>
          <label class="block w-full border-2 border-dashed border-default rounded-lg p-6 text-center cursor-pointer hover:border-primary-500 transition-colors">
            <input type="file" accept=".csv,text/csv" class="hidden" @change="onFile">
            <UIcon name="i-lucide-upload-cloud" class="size-8 mx-auto text-dimmed" />
            <p class="text-sm mt-2">
              <span v-if="fileName" class="font-medium">{{ fileName }}</span>
              <span v-else>Click to select a CSV file (max 10MB)</span>
            </p>
            <p v-if="preview" class="text-xs text-muted mt-1">
              {{ preview.totalRows }} rows · {{ preview.headers.length }} columns
            </p>
          </label>
        </UFormField>

        <div v-if="preview" class="border border-default rounded">
          <p class="px-3 py-2 text-xs font-semibold uppercase text-muted border-b border-default">
            Preview (first {{ preview.sample.length }} rows)
          </p>
          <div class="overflow-x-auto max-h-48">
            <table class="w-full text-xs">
              <thead class="bg-elevated/50">
                <tr>
                  <th
                    v-for="(h, i) in preview.headers"
                    :key="i"
                    class="px-2 py-1.5 text-left font-medium whitespace-nowrap border-r border-default last:border-r-0"
                  >
                    {{ h }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in preview.sample" :key="ri" class="border-t border-default">
                  <td
                    v-for="(cell, ci) in row"
                    :key="ci"
                    class="px-2 py-1.5 truncate max-w-32 border-r border-default last:border-r-0"
                    :title="cell"
                  >
                    {{ cell }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <UCheckbox
          v-model="runRules"
          label="Run routing rules for imported leads"
          help="Off by default — bulk imports usually skip Slack/email fan-out to avoid notification storms."
        />

        <div v-if="lastResult" class="rounded p-3 text-sm" :class="lastResult.imported ? 'bg-green-500/10' : 'bg-warning-500/10'">
          <p>
            ✅ Imported: <strong>{{ lastResult.imported }}</strong> ·
            🔁 Skipped duplicates: {{ lastResult.skipped_duplicate }}
            <span v-if="lastResult.errors.length"> · ❌ Errors: {{ lastResult.errors.length }}</span>
          </p>
          <details v-if="lastResult.errors.length" class="mt-2 text-xs">
            <summary class="cursor-pointer text-muted">View errors</summary>
            <ul class="list-disc list-inside mt-1 text-muted">
              <li v-for="(e, i) in lastResult.errors.slice(0, 10)" :key="i">
                Row {{ e.row }}: {{ e.message }}
              </li>
              <li v-if="lastResult.errors.length > 10">… and {{ lastResult.errors.length - 10 }} more</li>
            </ul>
          </details>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-default">
          <UButton variant="ghost" color="neutral" @click="close">{{ lastResult ? 'Close' : 'Cancel' }}</UButton>
          <UButton :loading="uploading" :disabled="!preview || !clientId" color="primary" icon="i-lucide-upload" @click="submit">
            Import
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
