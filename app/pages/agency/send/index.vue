<script setup lang="ts">
import WorkspaceSendPanel from '~/components/send/WorkspaceSendPanel.vue'

definePageMeta({ layout: 'agency' })

const config = useRuntimeConfig()
if (config.public.sendEnabled !== true) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useHead({ title: 'Send · XeroFlow' })
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header>
      <p class="text-sm font-medium text-primary">
        Workspace Send
      </p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-highlighted">
        Deliver files without leaving the workspace
      </h1>
      <p class="mt-2 max-w-3xl text-muted">
        Create a secure, expiring transfer draft for a client or project. Upload and publication controls arrive in the next delivery slice.
      </p>
    </header>

    <WorkspaceSendPanel />
  </div>
</template>
