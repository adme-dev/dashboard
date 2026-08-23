<script setup lang="ts">
import type { BannerBrandKit, BannerProject } from '~/types/banner-studio'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const router = useRouter()

/**
 * "Apply" from the standalone page: choose a project, then open it with the kit queued.
 * The editor reads ?applyKit=<id> and applies it on load (undoable).
 */
const applyKit = ref<BannerBrandKit | null>(null)
const projects = ref<BannerProject[]>([])
const projectQuery = ref('')
watch(applyKit, async (k) => {
  if (!k) return
  projects.value = await $fetch<BannerProject[]>('/api/agency/banner-studio/projects')
})
const projectMatches = computed(() => {
  const q = projectQuery.value.toLowerCase()
  const list = projects.value.filter(p => !q || p.name.toLowerCase().includes(q) || (p.clientName || '').toLowerCase().includes(q))
  // Same-client projects first
  return list.sort((a, b) => Number(b.clientId === applyKit.value?.clientId) - Number(a.clientId === applyKit.value?.clientId)).slice(0, 12)
})
function openProject(p: BannerProject) {
  const id = applyKit.value!.id
  applyKit.value = null
  router.push(`/agency/banner-studio/${p.id}?applyKit=${id}`)
}
</script>

<template>
  <div class="max-w-6xl mx-auto p-6 space-y-6">
    <div class="flex items-center gap-3">
      <UButton
        icon="i-lucide-arrow-left"
        variant="ghost"
        size="sm"
        to="/agency/banner-studio"
      />
      <BrandCube color="purple" :size="32" :animated="false" />
      <div class="min-w-0">
        <h1 class="text-xl font-bold">
          Brand kits
        </h1>
        <p class="text-sm text-(--ui-text-muted)">
          One kit per client: colours with roles, heading and body fonts, logos for light and dark, and the guidelines the AI follows.
        </p>
      </div>
    </div>

    <BannerBrandKitManager @apply="k => applyKit = k" />

    <!-- Project picker for Apply -->
    <UModal :open="!!applyKit" @update:open="v => { if (!v) applyKit = null }">
      <template #content>
        <div class="p-5 space-y-4">
          <div>
            <h3 class="text-lg font-bold">
              Apply “{{ applyKit?.name }}” to a project
            </h3>
            <p class="text-sm text-(--ui-text-muted)">
              Opens the project in the editor with the kit applied. You can undo there.
            </p>
          </div>
          <UInput
            v-model="projectQuery"
            icon="i-lucide-search"
            placeholder="Search projects…"
            class="w-full"
            autofocus
          />
          <ul class="divide-y divide-(--ui-border) max-h-80 overflow-y-auto rounded-md border border-(--ui-border)">
            <li v-if="!projectMatches.length" class="p-4 text-sm text-(--ui-text-muted)">
              No projects match.
            </li>
            <li v-for="p in projectMatches" :key="p.id">
              <button class="w-full text-left px-3 py-2 hover:bg-(--ui-bg-elevated) flex items-center gap-3" @click="openProject(p)">
                <img
                  v-if="p.thumbnailUrl"
                  :src="p.thumbnailUrl"
                  class="w-12 h-8 object-cover rounded-sm bg-black/30"
                  alt=""
                >
                <div v-else class="w-12 h-8 rounded-sm bg-(--ui-bg-elevated)" />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium truncate">
                    {{ p.name }}
                  </div>
                  <div class="text-xs text-(--ui-text-muted) truncate">
                    {{ p.clientName || 'No client' }}
                  </div>
                </div>
                <UBadge v-if="applyKit?.clientId && p.clientId === applyKit.clientId" variant="subtle" size="xs">
                  same client
                </UBadge>
              </button>
            </li>
          </ul>
          <div class="flex justify-end">
            <UButton label="Cancel" variant="ghost" @click="applyKit = null" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
