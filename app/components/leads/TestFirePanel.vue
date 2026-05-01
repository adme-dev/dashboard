<script setup lang="ts">
const props = defineProps<{
  ruleId: string
  formMeta: { source: string; form_id: string; form_name: string | null }
}>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const overrides = ref<{ key: string; value: string }[]>([])
const running = ref(false)
const result = ref<any>(null)

function addOverride() { overrides.value.push({ key: '', value: '' }) }

async function run() {
  running.value = true
  try {
    const field_data: Record<string, string> = {}
    for (const o of overrides.value) if (o.key) field_data[o.key] = o.value
    result.value = await $fetch(`/api/leads/rules/${props.ruleId}/test-fire`, {
      method: 'POST',
      body: { field_data },
    })
    toast.add({ title: 'Test fired', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Test failed', description: e?.data?.statusMessage ?? '', color: 'error' })
  } finally { running.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :ui="{ container: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-4">
        <h3 class="text-base font-semibold">Test fire — {{ formMeta.form_name || formMeta.form_id }}</h3>
        <p class="text-xs text-muted">
          Synthesizes a sample lead from observed form fields and runs each destination.
          Nothing is persisted to the database.
        </p>

        <div class="space-y-2">
          <label class="text-xs text-muted">Field overrides (optional)</label>
          <div v-for="(o, i) in overrides" :key="i" class="flex items-center gap-2">
            <UInput v-model="o.key" placeholder="key" class="w-40" />
            <UInput v-model="o.value" placeholder="value" class="flex-1" />
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="overrides.splice(i, 1)" />
          </div>
          <UButton icon="i-lucide-plus" variant="ghost" size="sm" @click="addOverride">Add override</UButton>
        </div>

        <UButton :loading="running" icon="i-lucide-flask-conical" color="primary" @click="run">Run test fire</UButton>

        <div v-if="result" class="space-y-2">
          <h4 class="text-xs font-semibold uppercase text-muted">Per-destination results</h4>
          <ul class="space-y-1">
            <li v-for="r in result.results" :key="r.id" class="border border-default rounded p-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="font-mono text-xs">{{ r.type ?? 'unknown' }}</span>
                <UBadge
                  :color="r.skipped ? 'neutral' : r.status === 'delivered' ? 'success' : 'error'"
                  variant="soft" size="xs"
                >{{ r.skipped ? 'skipped:' + r.skipped : r.status }}</UBadge>
              </div>
              <p v-if="r.error" class="text-xs text-error mt-1 break-words">{{ r.error }}</p>
            </li>
          </ul>
        </div>

        <div class="flex justify-end pt-2 border-t border-default">
          <UButton variant="ghost" @click="open = false">Close</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
