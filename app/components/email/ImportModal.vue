<!-- app/components/email/ImportModal.vue -->
<script setup lang="ts">
const props = defineProps<{ lists: { id: string, name: string }[] }>()
const emit = defineEmits<{ (e: 'imported'): void }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const importing = ref(false)
const listId = ref<string | undefined>(undefined)
const csv = ref('')
const result = ref<{
  imported: number
  skipped: number
  review?: {
    valid_rows: number
    invalid_rows: number
    duplicate_rows: number
    previously_unsubscribed: number
    suppressed: number
    blocklisted: number
  }
} | null>(null)

const listOptions = computed(() => props.lists.map(l => ({ value: l.id, label: l.name })))

watch(open, (v) => {
  if (v) {
    listId.value = undefined
    csv.value = ''
    result.value = null
  }
})

function errMessage(e: unknown): string {
  return e && typeof e === 'object' && 'data' in e
    ? (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? ''
    : ''
}

async function run() {
  if (!listId.value) {
    toast.add({ title: 'Pick a target list', color: 'error' })
    return
  }
  if (!csv.value.trim()) {
    toast.add({ title: 'Paste CSV first', color: 'error' })
    return
  }
  importing.value = true
  try {
    result.value = await $fetch('/api/email/subscribers/import', {
      method: 'POST',
      body: { list_id: listId.value, csv: csv.value }
    })
    toast.add({ title: `Imported ${result.value?.imported}, skipped ${result.value?.skipped}`, color: 'success' })
    emit('imported')
  } catch (e: unknown) {
    toast.add({ title: 'Import failed', description: errMessage(e), color: 'error' })
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-5">
        <h3 class="text-lg font-semibold">
          Import subscribers from CSV
        </h3>

        <UFormField label="Target list" required>
          <USelectMenu
            v-model="listId"
            :items="listOptions"
            value-key="value"
            placeholder="Select a list"
            class="w-full"
          />
        </UFormField>

        <UFormField label="CSV" help="First row must be headers. An 'email' column is required; 'name' is auto-detected; other columns become subscriber attributes.">
          <UTextarea
            v-model="csv"
            :rows="8"
            placeholder="email,name,company&#10;alice@example.com,Alice,Acme"
            class="w-full font-mono text-xs"
          />
        </UFormField>

        <UAlert
          v-if="result"
          color="info"
          variant="subtle"
          :title="`Imported ${result.imported}, skipped ${result.skipped}`"
        />
        <div v-if="result?.review" class="grid gap-2 sm:grid-cols-3">
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Valid rows
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.valid_rows }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Invalid rows
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.invalid_rows }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Duplicates
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.duplicate_rows }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Unsubscribed
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.previously_unsubscribed }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Suppressed
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.suppressed }}
            </p>
          </div>
          <div class="rounded-lg border border-default p-3">
            <p class="text-xs text-muted">
              Blocklisted
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums">
              {{ result.review.blocklisted }}
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-4 border-t border-default">
          <UButton
            variant="ghost"
            color="neutral"
            label="Close"
            @click="open = false"
          />
          <UButton
            color="primary"
            label="Import"
            :loading="importing"
            @click="run"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
