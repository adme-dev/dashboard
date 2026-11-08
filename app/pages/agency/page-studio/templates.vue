<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useSeoMeta({ title: 'Templates | XeroFlow Agency' })
</script>

<template>
  <UDashboardPanel id="agency-template-sources">
    <template #header>
      <UDashboardNavbar title="Templates" />
    </template>
    <template #body>
      <PageStudioTemplateCatalogue endpoint="/api/agency/page-studio/templates" />
      <USeparator class="my-8" />
      <PageStudioTemplateSourceManagement />
    </template>
  </UDashboardPanel>
</template>
