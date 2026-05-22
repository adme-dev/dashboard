<script setup lang="ts">
import type { OfficeZoneRow, OfficeParticipant } from '~~/app/types/office'

const props = defineProps<{
  zone: OfficeZoneRow
  occupants: OfficeParticipant[]
}>()

const emit = defineEmits<{
  enter: [zoneId: string]
}>()

const stackedAvatars = computed(() => props.occupants.slice(0, 5))
const overflow = computed(() => Math.max(0, props.occupants.length - 5))
</script>

<template>
  <div
    class="absolute rounded-lg border border-default bg-elevated/80 backdrop-blur-sm
           cursor-pointer transition hover:bg-elevated hover:border-primary"
    :style="{
      left: zone.position.x + 'px',
      top: zone.position.y + 'px',
      width: zone.position.w + 'px',
      height: zone.position.h + 'px'
    }"
    role="button"
    :aria-label="`Enter ${zone.name}`"
    @click="emit('enter', zone.id)"
  >
    <div class="flex flex-col h-full p-3 gap-2">
      <div class="flex items-center justify-between">
        <div class="font-medium text-sm text-highlighted truncate">
          {{ zone.name }}
        </div>
        <UBadge color="neutral" variant="subtle" size="xs">
          {{ occupants.length }}/{{ zone.capacity }}
        </UBadge>
      </div>
      <div class="flex -space-x-2 mt-auto">
        <OfficeAvatar
          v-for="p in stackedAvatars"
          :key="p.handle"
          :participant="p"
          :size="28"
        />
        <UBadge
          v-if="overflow > 0"
          color="neutral"
          variant="solid"
          size="sm"
          class="rounded-full px-2"
        >
          +{{ overflow }}
        </UBadge>
      </div>
    </div>
  </div>
</template>
