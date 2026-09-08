<script setup lang="ts">
const props = defineProps<{ audience: 'agency' | 'portal', siteId: string, disabled?: boolean }>()
const emit = defineEmits<{ 'update:siteId': [value: string] }>()
const page = ref(1)
const pageSize = 25
const { data, pending, error } = await useFetch<{ sites: { id: string, name: string }[], total: number }>(`/api/${props.audience}/page-studio/sites`, { query: { page, pageSize }, default: () => ({ sites: [], total: 0 }) })
const items = computed(() => {
  const choices = data.value.sites.map(site => ({ label: site.name, value: site.id }))
  if (props.siteId && !choices.some(item => item.value === props.siteId)) choices.unshift({ label: 'Selected website', value: props.siteId })
  return [{ label: 'Choose a website', value: '__choose__' }, ...choices]
})
const selected = computed({ get: () => props.siteId || '__choose__', set: (value: string) => emit('update:siteId', value === '__choose__' ? '' : value) })
</script>

<template>
  <div class="space-y-3">
    <UFormField label="Website" help="Bookings belong to the selected website." class="max-w-md">
      <USelectMenu
        v-model="selected"
        :items="items"
        value-key="value"
        :loading="pending"
        :disabled="disabled || Boolean(error)"
        class="w-full"
      />
    </UFormField>
    <UPagination
      v-if="data.total > pageSize"
      v-model:page="page"
      :total="data.total"
      :items-per-page="pageSize"
      size="sm"
    />
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      title="Websites could not be loaded"
      description="Refresh the page to try again."
    />
    <p v-else-if="!pending && !data.total" class="text-sm text-muted">
      Create a website or ask your agency for website access to get started.
    </p>
  </div>
</template>
