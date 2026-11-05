<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useSeoMeta({ title: 'Template sources | XeroFlow Agency' })
</script>

<template>
  <UDashboardPanel id="agency-template-sources">
    <template #header>
      <UDashboardNavbar title="Template sources" />
    </template>
    <template #body>
      <PageStudioTemplateSourceManagement />
    </template>
  </UDashboardPanel>
</template>
