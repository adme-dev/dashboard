<script setup lang="ts">
interface FieldEntry {
  token: string
  label: string
  sample: string
  group: 'form' | 'lead' | 'attribution'
}

const props = defineProps<{
  source: string
  formId: string
}>()

const toast = useToast()

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { query?: Record<string, unknown> }
) => Promise<T>
const query = computed(() => ({ source: props.source, form_id: props.formId }))
const data = ref<{ form_name: string | null; has_metadata: boolean; fields: FieldEntry[] }>({
  form_name: null,
  has_metadata: false,
  fields: [],
})
const pending = ref(false)

async function refreshFields() {
  pending.value = true
  try {
    data.value = await apiFetch<{ form_name: string | null; has_metadata: boolean; fields: FieldEntry[] }>(
      '/api/leads/forms/sample',
      { query: query.value },
    )
  } finally {
    pending.value = false
  }
}

await refreshFields()
watch(query, () => { refreshFields() })

const grouped = computed(() => {
  const out: Record<'form' | 'lead' | 'attribution', FieldEntry[]> = {
    form: [], lead: [], attribution: [],
  }
  for (const f of data.value?.fields ?? []) out[f.group].push(f)
  return out
})

const GROUP_TITLES: Record<'form' | 'lead' | 'attribution', string> = {
  form: 'Form fields',
  lead: 'Lead metadata',
  attribution: 'Attribution',
}

async function copyToken(token: string) {
  try {
    await navigator.clipboard.writeText(token)
    toast.add({
      title: 'Copied',
      description: `${token} — paste into any template field`,
      color: 'success',
    })
  } catch {
    toast.add({
      title: 'Copy failed',
      description: 'Your browser blocked clipboard access.',
      color: 'error',
    })
  }
}
</script>

<template>
  <div class="space-y-3">
    <div>
      <h4 class="text-xs font-semibold uppercase text-muted">Available fields</h4>
      <p class="text-xs text-muted mt-1 leading-relaxed">
        Click to copy a token, then paste it into any template field. Form fields populate as leads arrive.
      </p>
    </div>

    <div v-if="pending" class="text-xs text-muted">Loading…</div>

    <div v-else-if="!data?.has_metadata && grouped.form.length === 0" class="text-xs text-muted bg-elevated/40 rounded p-3">
      <strong class="text-default">No leads received yet.</strong>
      Form fields will appear here automatically once the first lead arrives.
      Universal fields below are always available.
    </div>

    <div v-for="(group, key) in grouped" :key="key" v-show="group.length">
      <p class="text-xs font-medium text-muted mb-1.5">{{ GROUP_TITLES[key] }}</p>
      <div class="space-y-1">
        <button
          v-for="f in group"
          :key="f.token"
          type="button"
          class="w-full text-left px-2 py-1.5 rounded hover:bg-elevated/60 transition-colors group"
          @click="copyToken(f.token)"
        >
          <div class="flex items-center justify-between gap-2">
            <code class="text-xs font-mono text-primary-500 truncate">{{ f.token }}</code>
            <UIcon name="i-lucide-copy" class="size-3 text-dimmed opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </div>
          <p v-if="f.sample" class="text-xs text-dimmed truncate mt-0.5">e.g. {{ f.sample }}</p>
        </button>
      </div>
    </div>
  </div>
</template>
