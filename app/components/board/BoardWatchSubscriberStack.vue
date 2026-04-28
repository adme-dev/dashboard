<template>
  <div v-if="count > 0" class="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-default px-2">
    <div class="flex items-center gap-2">
      <div class="flex -space-x-2">
        <UAvatar
          v-for="user in top"
          :key="user.id"
          :src="user.avatarUrl || undefined"
          :alt="user.name"
          size="2xs"
          class="ring-2 ring-default"
        />
      </div>
      <span class="text-xs text-muted">{{ count }} watching</span>
    </div>
    <UButton
      label="View"
      variant="ghost"
      size="xs"
      color="neutral"
      @click="showAll = true"
    />

    <UModal v-model:open="showAll" :ui="{ content: 'max-w-md' }">
      <template #content>
        <div class="p-4">
          <h3 class="text-sm font-semibold mb-3">Watching this board</h3>
          <div v-if="loadingFull" class="text-sm text-muted">Loading…</div>
          <div v-else-if="distinctFull.length === 0" class="text-sm text-muted">No subscribers yet.</div>
          <div v-else class="space-y-2 max-h-96 overflow-y-auto">
            <div v-for="sub in distinctFull" :key="sub.userId" class="flex items-center gap-2">
              <UAvatar :src="sub.userAvatar || undefined" :alt="sub.userName" size="sm" />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{{ sub.userName }}</p>
                <p class="text-xs text-muted truncate">{{ sub.userEmail }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ boardId: string }>()

interface TopUser { id: string; name: string; avatarUrl: string | null }
interface FullSub { userId: string; userName: string; userEmail: string; userAvatar: string | null }

const count = ref(0)
const top = ref<TopUser[]>([])
const full = ref<FullSub[]>([])
const showAll = ref(false)
const loadingFull = ref(false)

const distinctFull = computed(() => {
  const seen = new Set<string>()
  return full.value.filter(s => {
    if (seen.has(s.userId)) return false
    seen.add(s.userId)
    return true
  })
})

async function loadSummary() {
  try {
    const data = await $fetch<{ count: number; top: TopUser[] }>(
      `/api/agency/boards/${props.boardId}/subscribers?summary=true`
    )
    count.value = data.count
    top.value = data.top
  } catch {
    // non-critical — leave at zero
  }
}

watch(showAll, async (open) => {
  if (open && full.value.length === 0) {
    loadingFull.value = true
    try {
      const data = await $fetch<{ subscribers: FullSub[] }>(
        `/api/agency/boards/${props.boardId}/subscribers`
      )
      full.value = data.subscribers
    } catch {
      full.value = []
    } finally {
      loadingFull.value = false
    }
  }
})

defineExpose({ refresh: loadSummary })

onMounted(loadSummary)
</script>
