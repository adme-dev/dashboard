<script setup lang="ts">
// Uses a callback prop for the import action so we can show the per-run result inline
// (Vue's emit does not return handler results).
interface ImportResult { imported: number, skipped: number, errors: { row: number, message: string }[] }
const props = defineProps<{ open: boolean, onImport: (csv: string) => Promise<ImportResult> }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const csv = ref('')
const result = ref<ImportResult | null>(null)
const loading = ref(false)

async function go() {
  loading.value = true
  try {
    result.value = await props.onImport(csv.value)
  } finally {
    loading.value = false
  }
}
watch(() => props.open, (o) => { if (o) { csv.value = ''; result.value = null } })
</script>

<template>
  <UModal
    :open="open"
    title="Import people from CSV"
    description="Paste CSV with a header row."
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          Recognised columns: <code class="text-xs">first_name, last_name, email, phone, mobile, job_title, department, city</code>. Rows with an existing email are skipped.
        </p>
        <UTextarea
          v-model="csv"
          :rows="8"
          class="w-full font-mono text-xs"
          placeholder="first_name,last_name,email&#10;Ann,Lee,ann@example.com"
        />
        <UAlert
          v-if="result"
          :color="result.errors.length ? 'warning' : 'success'"
          :icon="result.errors.length ? 'i-lucide-triangle-alert' : 'i-lucide-check'"
          :title="`Imported ${result.imported}, skipped ${result.skipped}, errors ${result.errors.length}`"
        />
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="emit('update:open', false)">Close</UButton>
          <UButton :loading="loading" :disabled="!csv.trim()" @click="go">Import</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
