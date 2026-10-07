<script setup lang="ts">
defineProps<{ label: string }>()
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <UButton
    :aria-label="label"
    :title="label"
    color="neutral"
    variant="ghost"
    class="orb-launcher"
    @click="$emit('click', $event)"
  >
    <AiReferenceOrb />
  </UButton>
</template>

<style scoped>
.orb-launcher {
  display: block;
  width: 4.5rem;
  height: 4.5rem;
  padding: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.orb-launcher:hover,
.orb-launcher:active { background: transparent; }
</style>
