<script setup lang="ts">
import { SAFE_ZONE_MAP } from '~/utils/banner-safe-zones'

const props = defineProps<{
  zoneKeys: string[]
}>()

const { state } = useBannerStudio()

function selectZone(key: string) {
  if (state.activeSafeZone === key) {
    // Toggle off if already selected
    state.showSafeZones = false
    state.activeSafeZone = null
  } else {
    state.activeSafeZone = key
    state.showSafeZones = true
  }
}
</script>

<template>
  <div class="p-2 min-w-48">
    <div class="text-xs font-medium text-[#999] mb-2">Safe Zone Overlay</div>
    <div class="flex flex-col gap-1">
      <button
        v-for="key in props.zoneKeys"
        :key="key"
        class="flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors"
        :class="state.activeSafeZone === key && state.showSafeZones
          ? 'bg-[#4a8fe8]/15 text-[#4a8fe8]'
          : 'text-[#ccc] hover:bg-[#3a3a3f]'"
        @click="selectZone(key)"
      >
        <span class="w-3 h-3 rounded-full border flex-shrink-0 flex items-center justify-center"
          :class="state.activeSafeZone === key && state.showSafeZones ? 'border-[#4a8fe8]' : 'border-[#666]'"
        >
          <span v-if="state.activeSafeZone === key && state.showSafeZones" class="w-1.5 h-1.5 rounded-full bg-[#4a8fe8]" />
        </span>
        <span class="flex-1">{{ SAFE_ZONE_MAP[key]?.label || key }}</span>
        <span class="text-[10px] text-[#666]">{{ SAFE_ZONE_MAP[key]?.platform }}</span>
      </button>
    </div>
    <button
      v-if="state.showSafeZones"
      class="mt-2 w-full text-center text-xs text-[#888] hover:text-[#ccc] py-1"
      @click="state.showSafeZones = false; state.activeSafeZone = null"
    >
      Hide overlay
    </button>
  </div>
</template>
