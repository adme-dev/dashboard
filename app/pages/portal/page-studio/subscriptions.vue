<script setup lang="ts">
definePageMeta({ layout: "portal", middleware: "portal-auth" });
useHead({ title: "Subscription & usage | Client Portal" });
</script>

<template>
  <div class="h-full w-full overflow-y-auto p-4 sm:p-6">
    <PageStudioOperationsView section="subscriptions" audience="portal" />
  </div>
</template>
