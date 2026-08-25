<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Competitions' })
const api = useQrCodes()
const toast = useToast()
const { data: clientsData } = await useFetch<any[]>('/api/agency/clients')
const clientItems = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))
const { data, status } = await useAsyncData('qr-competitions', () => api.competitions())
const rows = computed(() => data.value?.competitions ?? [])
const statusColor: Record<string, any> = { draft: 'neutral', open: 'success', closed: 'warning', drawn: 'primary', archived: 'neutral' }

const newOpen = ref(false)
const form = reactive({ name: '', clientId: '', type: 'chance' as 'chance' | 'skill' })
const creating = ref(false)
async function create() {
  creating.value = true
  try {
    const { competition } = await api.createCompetition({ name: form.name, clientId: form.clientId, type: form.type })
    newOpen.value = false
    await navigateTo(`/agency/qr-codes/competitions/${competition.id}`)
  } catch (e: any) {
    toast.add({ title: 'Could not create', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6 space-y-6">
    <header class="flex flex-wrap items-start gap-4">
      <div>
        <UButton
          to="/agency/qr-codes"
          variant="link"
          color="neutral"
          icon="i-lucide-arrow-left"
          class="px-0"
        >
          QR codes
        </UButton>
        <h1 class="text-2xl font-semibold tracking-tight">
          Competitions
        </h1>
        <p class="mt-0.5 text-sm text-muted">
          Entries, permits, versioned terms and an audited draw — the evidence pack in one place.
        </p>
      </div>
      <UButton class="ml-auto" icon="i-lucide-plus" @click="() => { newOpen = true }">
        New competition
      </UButton>
    </header>

    <div v-if="status === 'pending'" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-14" />
    </div>
    <div v-else-if="!rows.length" class="rounded-xl border border-dashed border-default px-6 py-16 text-center">
      <UIcon name="i-lucide-trophy" class="mx-auto mb-3 size-6 text-muted" />
      <p class="font-medium">
        No competitions yet
      </p>
      <p class="mx-auto mt-1 max-w-sm text-sm text-muted">
        Set up the promoter, prizes and dates; the terms and permit checklist are generated for you.
      </p>
    </div>
    <div v-else class="divide-y divide-default rounded-xl ring-1 ring-default">
      <NuxtLink
        v-for="c in rows"
        :key="c.id"
        :to="`/agency/qr-codes/competitions/${c.id}`"
        class="flex items-center gap-4 px-4 py-3 hover:bg-elevated/60"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">
            {{ c.name }}
          </p>
          <p class="truncate text-xs text-muted">
            {{ c.client_name }} · {{ c.type === 'skill' ? 'Game of skill' : 'Random draw' }}<template v-if="c.closes_at"> · closes {{ new Date(c.closes_at).toLocaleDateString('en-AU') }}</template>
          </p>
        </div>
        <span class="text-sm tabular-nums text-muted">{{ c.entries_count }} {{ c.entries_count === 1 ? 'entry' : 'entries' }}</span>
        <span class="text-xs text-muted">{{ c.pages_count }} {{ c.pages_count === 1 ? 'page' : 'pages' }}</span>
        <UBadge
          :color="statusColor[c.status] ?? 'neutral'"
          variant="subtle"
          size="sm"
          class="capitalize"
        >
          {{ c.status }}
        </UBadge>
        <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
      </NuxtLink>
    </div>

    <UModal v-model:open="newOpen" title="New competition">
      <template #body>
        <div class="space-y-4">
          <UFormField label="Name" required>
            <UInput
              v-model="form.name"
              placeholder="Win a weekend away"
              class="w-full"
              autofocus
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Client" required>
              <USelectMenu
                v-model="form.clientId"
                :items="clientItems"
                value-key="value"
                class="w-full"
                placeholder="Select client"
              />
            </UFormField>
            <UFormField label="Type" help="Draws may need state permits; judged competitions usually don't.">
              <USelectMenu
                v-model="form.type"
                :items="[{ label: 'Random draw (chance)', value: 'chance' }, { label: 'Judged (skill)', value: 'skill' }]"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { newOpen = false }">
            Cancel
          </UButton>
          <UButton :loading="creating" :disabled="!form.name.trim() || !form.clientId" @click="create">
            Create
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
