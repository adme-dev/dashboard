<script setup lang="ts">
defineModel<Record<string, any>>('config', { default: () => ({}) })
</script>

<template>
  <div class="text-sm text-muted">
    No configuration — leads from this form will be visible inside the matching client's portal.
  </div>
</template>
