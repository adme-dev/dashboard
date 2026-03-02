<script setup lang="ts">
import type { BannerBrandKit } from '~/types/banner-studio'

const { state, applyBrandKit } = useBannerStudio()
const toast = useToast()

const showManagerModal = ref(false)

// Fetch brand kits, optionally filtered by project's client
const clientId = computed(() => state.project?.clientId || undefined)
const { data: brandKits, refresh } = useFetch<BannerBrandKit[]>('/api/agency/banner-studio/brand-kits', {
  query: { clientId },
  default: () => [],
  watch: [clientId],
})

function handleApply(kit: BannerBrandKit) {
  applyBrandKit(kit)
  toast.add({ title: 'Brand applied', description: `"${kit.name}" colors & fonts applied to all artboards`, color: 'success' })
}

</script>

<template>
  <div class="p-3 space-y-3">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">Brand Kits</h4>
      <UButton
        icon="i-lucide-settings"
        variant="ghost"
        size="xs"
        title="Manage brand kits"
        @click="showManagerModal = true"
      />
    </div>

    <!-- Empty state -->
    <div v-if="!brandKits?.length" class="text-center py-6">
      <UIcon name="i-lucide-palette" class="w-8 h-8 text-(--ui-text-muted) mx-auto mb-1.5" />
      <p class="text-xs text-(--ui-text-muted)">No brand kits available</p>
      <UButton
        label="Create One"
        variant="soft"
        size="xs"
        class="mt-2"
        @click="showManagerModal = true"
      />
    </div>

    <!-- Brand kit list -->
    <div v-else class="space-y-2">
      <div
        v-for="kit in brandKits"
        :key="kit.id"
        class="rounded-lg border border-(--ui-border) overflow-hidden hover:ring-1 hover:ring-(--ui-primary)/30 transition-all"
      >
        <!-- Color bar -->
        <div class="flex h-2">
          <div
            v-for="(color, ci) in kit.colors.slice(0, 8)"
            :key="ci"
            class="flex-1"
            :style="{ backgroundColor: color }"
          />
          <div v-if="!kit.colors.length" class="flex-1 bg-(--ui-bg)" />
        </div>

        <div class="p-2 space-y-1.5">
          <div class="flex items-center justify-between gap-1">
            <div class="min-w-0">
              <div class="text-xs font-semibold truncate text-(--ui-text)">{{ kit.name }}</div>
              <div v-if="kit.clientName" class="text-[10px] text-(--ui-text-muted) truncate">{{ kit.clientName }}</div>
            </div>
            <UButton
              icon="i-lucide-paintbrush"
              label="Apply"
              variant="soft"
              size="xs"
              @click="handleApply(kit)"
            />
          </div>

          <!-- Font preview -->
          <div v-if="kit.fonts.length" class="text-[10px] text-(--ui-text-muted) truncate">
            {{ kit.fonts.map(f => f.family).join(', ') }}
          </div>

          <!-- Logo thumbnails -->
          <div v-if="kit.logos.length" class="flex gap-1">
            <div
              v-for="(logo, li) in kit.logos.slice(0, 4)"
              :key="li"
              class="w-6 h-6 rounded border border-(--ui-border) bg-(--ui-bg) overflow-hidden"
            >
              <img :src="logo.url" :alt="logo.name" class="w-full h-full object-contain" />
            </div>
            <span v-if="kit.logos.length > 4" class="text-[10px] text-(--ui-text-muted) self-center">
              +{{ kit.logos.length - 4 }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Manage kits link -->
    <div class="pt-1">
      <UButton
        label="Manage All Kits"
        icon="i-lucide-external-link"
        variant="ghost"
        size="xs"
        to="/agency/banner-studio/brand-kits"
        target="_blank"
        class="w-full"
      />
    </div>

    <!-- Full manager modal -->
    <UModal v-model:open="showManagerModal" :ui="{ width: 'max-w-2xl' }">
      <template #content>
        <div class="p-4 max-h-[80vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold">Brand Kit Manager</h3>
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="showManagerModal = false" />
          </div>
          <BannerBrandKitManager compact @apply="handleApply" />
        </div>
      </template>
    </UModal>
  </div>
</template>
