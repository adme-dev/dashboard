<script setup lang="ts">
import { AI_PERSONA_OPTIONS } from '~~/app/utils/aiPersonas'

definePageMeta({ layout: 'agency' })

interface MyConfig { personaKey: string | null, disabledTools: string[], memoryEnabled: boolean }
interface ToolInfo { name: string, description: string, mutates: boolean }

const toast = useToast()

const { data: config } = await useFetch<MyConfig>('/api/agency/ai/my-assistant')
const { data: toolsData } = await useFetch<{ tools: ToolInfo[] }>('/api/agency/ai/my-assistant/tools')

// Local editable state (seeded from the server, saved on demand).
const personaKey = ref<string>(config.value?.personaKey ?? 'general')
const memoryEnabled = ref<boolean>(config.value?.memoryEnabled ?? true)
const disabled = ref<Set<string>>(new Set(config.value?.disabledTools ?? []))

const personaItems = AI_PERSONA_OPTIONS.map(o => ({ label: o.label, value: o.key }))
const personaDescription = computed(() => AI_PERSONA_OPTIONS.find(o => o.key === personaKey.value)?.description)
const tools = computed(() => toolsData.value?.tools ?? [])

const prettyTool = (t: string) => t.replace(/^(propose_|get_)/, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const isEnabled = (name: string) => !disabled.value.has(name)
function toggleTool(name: string, on: boolean) {
  const next = new Set(disabled.value)
  if (on) next.delete(name)
  else next.add(name)
  disabled.value = next
}

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    const saved = await $fetch<MyConfig>('/api/agency/ai/my-assistant', {
      method: 'PUT',
      body: { personaKey: personaKey.value, disabledTools: [...disabled.value], memoryEnabled: memoryEnabled.value },
    })
    // Reconcile with what the server actually persisted (it's the source of truth).
    personaKey.value = saved.personaKey ?? 'general'
    memoryEnabled.value = saved.memoryEnabled
    disabled.value = new Set(saved.disabledTools)
    toast.add({ title: 'Saved', description: 'Your assistant settings are updated.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Couldn’t save', description: e?.data?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
    <header class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold text-highlighted">My Assistant</h1>
        <p class="text-sm text-muted">Tune how your co-pilot works for you. These settings only narrow what it can do — they never grant access your role doesn’t already have.</p>
      </div>
      <UButton icon="i-lucide-check" :loading="saving" @click="save">Save changes</UButton>
    </header>

    <!-- Default focus -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-highlighted">Default focus</h2>
      </template>
      <UFormField label="Skill-pack" help="The assistant starts each chat in this focus. It still auto-switches per question, and your role’s permissions always apply.">
        <USelect v-model="personaKey" :items="personaItems" class="w-full sm:w-80" />
      </UFormField>
      <p v-if="personaDescription" class="mt-2 text-xs text-muted">{{ personaDescription }}</p>
    </UCard>

    <!-- Memory -->
    <UCard>
      <template #header>
        <h2 class="text-sm font-semibold text-highlighted">Memory</h2>
      </template>
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-sm font-medium text-default">Remember helpful details about you</p>
          <p class="mt-0.5 text-xs text-muted">Lets the assistant recall your accounts, preferences and routines between chats. Turn off to keep every chat fresh.</p>
        </div>
        <USwitch v-model="memoryEnabled" />
      </div>
    </UCard>

    <!-- Tools -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-highlighted">Tools</h2>
          <span class="text-xs text-muted">{{ tools.filter(t => isEnabled(t.name)).length }}/{{ tools.length }} on</span>
        </div>
      </template>
      <p class="mb-3 text-xs text-muted">Turn off any tool you don’t want your assistant to use. Everything here is already permitted by your role.</p>
      <div v-if="!tools.length" class="py-6 text-center text-sm text-muted">No tools available for your role yet.</div>
      <ul v-else class="divide-y divide-default">
        <li v-for="t in tools" :key="t.name" class="flex items-start justify-between gap-4 py-2.5">
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted">
              {{ prettyTool(t.name) }}
              <UBadge v-if="t.mutates" color="warning" variant="soft" size="sm" class="ml-1.5">write</UBadge>
            </p>
            <p class="mt-0.5 line-clamp-2 text-xs text-muted">{{ t.description }}</p>
          </div>
          <USwitch :model-value="isEnabled(t.name)" class="mt-0.5 shrink-0" @update:model-value="(v: boolean) => toggleTool(t.name, v)" />
        </li>
      </ul>
    </UCard>
  </div>
</template>
