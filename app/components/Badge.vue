<template>
  <span 
    class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    :class="color"
  >
    <slot />
  </span>
</template>

<script setup>
defineProps({
  color: {
    type: String,
    default: 'bg-gray-100 text-gray-800'
  }
})
</script>
