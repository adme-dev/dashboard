<script setup lang="ts">
const { remoteUsers } = useBannerRealtime()

const visibleUsers = computed(() => remoteUsers.value.slice(0, 5))
const overflowCount = computed(() => Math.max(0, remoteUsers.value.length - 5))
</script>

<template>
  <div v-if="remoteUsers.length > 0" class="flex items-center gap-1">
    <div class="flex -space-x-2">
      <UTooltip
        v-for="user in visibleUsers"
        :key="user.userId"
        :text="`${user.userName} — Editing`"
        :delay-duration="200"
      >
        <div
          class="relative w-6 h-6 rounded-full ring-2 shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
          :style="{
            backgroundColor: user.color,
            '--tw-ring-color': user.color,
          }"
        >
          <img
            v-if="user.userAvatar"
            :src="user.userAvatar"
            :alt="user.userName"
            class="w-full h-full rounded-full object-cover"
          >
          <span v-else>{{ user.userName.charAt(0).toUpperCase() }}</span>
          <!-- Online dot -->
          <span
            class="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 ring-1 ring-[#2d2d32]"
          />
        </div>
      </UTooltip>
      <div
        v-if="overflowCount > 0"
        class="w-6 h-6 rounded-full bg-[#3a3a3f] ring-2 ring-[#2d2d32] flex items-center justify-center text-[9px] font-bold text-(--ui-text-muted) shrink-0"
      >
        +{{ overflowCount }}
      </div>
    </div>
    <span class="text-[10px] text-(--ui-text-dimmed) ml-1">
      {{ remoteUsers.length }} online
    </span>
  </div>
</template>
