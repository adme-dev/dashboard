<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
</script>

<template>
  <ClientOnly>
    <SocialPublishingApprovalWorkspace />
    <template #fallback>
      <div role="status" class="p-4 sm:p-6">
        <p class="text-sm text-muted">
          Loading publishing approvals…
        </p>
        <USkeleton class="mt-6 h-80 rounded-xl motion-reduce:animate-none" />
      </div>
    </template>
  </ClientOnly>
</template>
