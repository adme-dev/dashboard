<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Admin Settings" />
      
      <UDashboardPanelContent>
        <UCard>
          <template #header>
            <h3 class="font-semibold">General Settings</h3>
          </template>
          
          <p class="text-gray-600 dark:text-gray-400">
            Admin settings will be available here soon.
          </p>
        </UCard>
      </UDashboardPanelContent>
    </UDashboardPanel>
  </UDashboardPage>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin'
})
</script>
