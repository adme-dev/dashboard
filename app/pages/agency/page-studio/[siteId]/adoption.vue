<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useSeoMeta({ title: 'Customer content setup | XeroFlow' })
const route = useRoute()
const { user } = useAuth()
const siteId = computed(() => typeof route.params.siteId === 'string' ? route.params.siteId : '')
const actorKey = computed(() => JSON.stringify(user.value))
const canManage = computed(() => Boolean(user.value && ['owner', 'admin'].includes(user.value.role)))
</script>

<template>
  <UDashboardPanel id="customer-content-adoption">
    <template #body>
      <div class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
        <UButton to="/agency/page-studio/customer-plans" label="Customer plans" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">Customer content setup</h1>
        <PageStudioCustomerAdoptionGrant v-if="canManage" :site-id="siteId" :actor-key="actorKey" />
        <UAlert v-else title="Operator access required" description="Sign in with an authorized operator account to review existing customer content setup." color="warning" />
      </div>
    </template>
  </UDashboardPanel>
</template>
