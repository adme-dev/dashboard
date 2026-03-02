<script setup lang="ts">
import { FORMATS, BANNER_SETS, PLATFORM_META } from '~/utils/banner-constants'

const {
  state,
  setActiveArtboard,
  removeSizeFromSet,
  loadBannerSet,
  syncAllFromActive,
} = useBannerStudio()

const showSizePicker = inject<Ref<boolean>>('showSizePicker', ref(false))

function handleLoadSet(setDef: typeof BANNER_SETS[number]) {
  loadBannerSet(setDef)
  useToast().add({ title: 'Set loaded', description: `${setDef.name} applied`, color: 'success' })
}

function platformColor(key: string): string {
  const fmt = FORMATS[key]
  if (!fmt) return '#888'
  return PLATFORM_META[fmt.platform]?.color || '#888'
}
</script>

<template>
  <div class="p-3 space-y-4">
    <!-- Quick Sets -->
    <div>
      <h4 class="text-xs font-bold uppercase tracking-wider text-[#888] mb-2">Quick Sets</h4>
      <div class="space-y-1.5">
        <button
          v-for="set in BANNER_SETS"
          :key="set.id"
          class="w-full text-left rounded-md px-3 py-2 border border-[#3a3a3f] hover:bg-white/[0.04] transition-colors"
          @click="handleLoadSet(set)"
        >
          <div class="text-sm font-medium text-[#e0e0e0]">{{ set.name }}</div>
          <div class="text-[11px] text-[#888] mt-0.5">{{ set.desc }}</div>
        </button>
      </div>
    </div>

    <!-- Active Sizes -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-bold uppercase tracking-wider text-[#888]">Active Sizes</h4>
        <span class="text-[11px] text-[#888]">{{ state.setKeys.length }} sizes</span>
      </div>

      <div class="space-y-0.5">
        <button
          v-for="key in state.setKeys"
          :key="key"
          class="w-full group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors"
          :class="state.activeKey === key ? 'bg-[#4af0a2]/10 ring-1 ring-[#4af0a2]/30' : 'hover:bg-white/[0.04]'"
          @click="setActiveArtboard(key)"
        >
          <span
            class="w-2 h-2 rounded-full shrink-0"
            :style="{ backgroundColor: platformColor(key) }"
          />
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-[#e0e0e0] truncate">{{ FORMATS[key]?.name }}</div>
            <div class="text-[10px] text-[#777] font-mono">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</div>
          </div>
          <UBadge v-if="state.activeKey === key" color="primary" variant="subtle" size="xs">Editing</UBadge>
          <UButton
            v-if="state.setKeys.length > 1"
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            color="neutral"
            class="opacity-0 group-hover:opacity-100"
            :class="{ 'opacity-100': state.activeKey === key }"
            @click.stop="removeSizeFromSet(key)"
          />
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2">
      <UButton
        icon="i-lucide-plus"
        label="Add Size"
        size="xs"
        variant="soft"
        class="flex-1"
        @click="showSizePicker = true"
      />
      <UButton
        icon="i-lucide-refresh-cw"
        label="Sync All"
        size="xs"
        variant="outline"
        class="flex-1"
        @click="syncAllFromActive"
      />
    </div>
  </div>
</template>
