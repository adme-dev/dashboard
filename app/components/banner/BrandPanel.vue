<script setup lang="ts">
/**
 * Studio side panel: the brand kits relevant to this project (client's kits + agency-wide),
 * each with a live mini-preview and one-click apply. Management happens in the full manager.
 */
import type { BannerBrandKit } from '~/types/banner-studio'

const { state, applyBrandKit } = useBannerStudio()
const toast = useToast()

const showManagerModal = ref(false)
const clientId = computed(() => state.project?.clientId || undefined)
const brandKits = ref<BannerBrandKit[]>([])
const loading = ref(false)

async function refresh() {
  loading.value = true
  try {
    brandKits.value = await $fetch<BannerBrandKit[]>('/api/agency/banner-studio/brand-kits', {
      query: clientId.value ? { clientId: clientId.value } : undefined
    })
  } finally {
    loading.value = false
  }
}
watch(clientId, refresh, { immediate: true })

function handleApply(kit: BannerBrandKit) {
  applyBrandKit(kit)
  toast.add({ title: 'Brand applied', description: `"${kit.name}" on every artboard — ⌘Z to undo`, color: 'success' })
}

const recommended = computed(() => brandKits.value.find(k => k.isDefault && (!clientId.value || k.clientId === clientId.value)) || brandKits.value.find(k => k.isDefault))
</script>

<template>
  <div class="p-3 space-y-3">
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">
        Brand kits
      </h4>
      <UTooltip text="Manage brand kits">
        <UButton
          icon="i-lucide-settings-2"
          variant="ghost"
          size="xs"
          @click="showManagerModal = true"
        />
      </UTooltip>
    </div>

    <p v-if="state.project?.clientName" class="text-[11px] text-(--ui-text-dimmed)">
      Showing kits for <span class="text-(--ui-text)">{{ state.project.clientName }}</span> and agency-wide kits.
    </p>
    <p v-else class="text-[11px] text-(--ui-text-dimmed)">
      Link this project to a client (click the project name in the toolbar) to see its kits first.
    </p>

    <!-- Empty -->
    <div v-if="!loading && !brandKits.length" class="rounded-lg border border-dashed border-(--ui-border) p-4 text-center space-y-2">
      <UIcon name="i-lucide-swatch-book" class="w-7 h-7 text-(--ui-text-muted) mx-auto" />
      <p class="text-xs text-(--ui-text-muted)">
        No brand kits yet. Extract one from the client’s website in under a minute.
      </p>
      <UButton
        label="Create a kit"
        variant="soft"
        size="xs"
        @click="showManagerModal = true"
      />
    </div>

    <!-- Kit list -->
    <div v-else class="space-y-2">
      <div
        v-for="kit in brandKits"
        :key="kit.id"
        class="rounded-lg border overflow-hidden transition-all"
        :class="kit === recommended ? 'border-(--ui-primary)/50 ring-1 ring-(--ui-primary)/20' : 'border-(--ui-border) hover:ring-1 hover:ring-(--ui-primary)/30'"
      >
        <div class="p-1.5 pb-0">
          <BannerBrandKitPreview
            :kit="kit"
            :ratio="3"
            compact
            cta="CTA"
          />
        </div>
        <div class="p-2 flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1 min-w-0">
              <span class="text-xs font-semibold truncate">{{ kit.name }}</span>
              <UIcon v-if="kit.isDefault" name="i-lucide-star" class="w-3 h-3 text-warning shrink-0" />
            </div>
            <div class="text-[10px] text-(--ui-text-muted) truncate">
              {{ kit.clientName || 'Agency-wide' }}<span v-if="kit.fonts.length"> · {{ kit.fonts[0].family }}</span>
            </div>
          </div>
          <UButton
            icon="i-lucide-paintbrush"
            label="Apply"
            variant="soft"
            size="xs"
            @click="handleApply(kit)"
          />
        </div>
      </div>
    </div>

    <UButton
      label="Open brand kit manager"
      icon="i-lucide-external-link"
      variant="ghost"
      size="xs"
      to="/agency/banner-studio/brand-kits"
      target="_blank"
      class="w-full"
    />

    <!-- Full manager -->
    <UModal v-model:open="showManagerModal" :ui="{ content: 'max-w-4xl' }">
      <template #content>
        <div class="p-5 max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-bold">
              Brand kits
            </h3>
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="sm"
              @click="showManagerModal = false"
            />
          </div>
          <BannerBrandKitManager :client-id="clientId" @apply="(k) => { handleApply(k); showManagerModal = false; refresh() }" />
        </div>
      </template>
    </UModal>
  </div>
</template>
