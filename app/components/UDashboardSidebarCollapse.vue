<template>
  <UButton
    icon="i-lucide-panel-left-close"
    color="neutral"
    variant="ghost"
    class="lg:hidden"
    @click="toggleSidebar"
  />
</template>

<script setup lang="ts">
const toggleSidebar = () => {
  // This is a stub - in a real implementation, this would toggle the sidebar
  console.log('Toggle sidebar')
}
</script>
