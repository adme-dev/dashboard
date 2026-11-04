<script setup lang="ts">
definePageMeta({ layout: false })
const route = useRoute()
const templatesView = computed(() => route.query.view === 'templates')
const unsavedFormSettings = useState<boolean>('studio-unsaved-form-settings', () => false)
</script>

<template>
  <div>
    <nav aria-label="Page Studio views" class="mx-auto flex max-w-7xl flex-wrap gap-2 px-6 py-4">
      <UButton
        to="/studio/dashboard"
        label="My website"
        :disabled="unsavedFormSettings"
        color="neutral"
        variant="ghost"
        :aria-current="!templatesView ? 'page' : undefined"
      />
      <UButton
        to="/studio/dashboard?view=templates"
        label="Templates"
        :disabled="unsavedFormSettings"
        color="neutral"
        variant="ghost"
        :aria-current="templatesView ? 'page' : undefined"
      />
    </nav>
    <StudioCustomerDashboard :return-view="templatesView ? 'templates' : undefined">
      <template v-if="templatesView" #default>
        <PageStudioTemplateCatalogue endpoint="/api/portal/page-studio/customer/templates" />
      </template>
    </StudioCustomerDashboard>
  </div>
</template>
