<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'QR Codes' })
const { data: clientsData } = await useFetch<any[]>('/api/agency/clients')
const clients = computed(() => (clientsData.value ?? []).map(c => ({ label: c.name, value: c.id })))
const route = useRoute()
const router = useRouter()
const clientId = ref<string>((route.query.clientId as string) || clients.value[0]?.value || '')
watch(clientId, v => router.replace({ query: { ...route.query, clientId: v } }))
const folderId = ref<string | null>(null)
const search = ref('')
const grid = ref<{ refresh: () => void, openNew: () => void }>()
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">QR Codes</h1>
        <p class="text-sm text-muted">Dynamic codes with editable destinations and scan tracking.</p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <USelectMenu v-model="clientId" :items="clients" value-key="value" placeholder="Client" class="w-56" />
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search" class="w-56" />
        <UButton icon="i-lucide-plus" :disabled="!clientId" @click="grid?.openNew()">New QR code</UButton>
      </div>
    </div>
    <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
      <QrFolderRail v-if="clientId" v-model:folder-id="folderId" :client-id="clientId" />
      <QrGrid ref="grid" :client-id="clientId" :folder-id="folderId" :search="search" />
    </div>
  </div>
</template>
