<script setup lang="ts">
import type { Lead } from '~/types'

const props = defineProps<{ lead: Lead }>()
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const showDeleteModal = ref(false)
const items = computed(() => [
  [
    {
      label: 'Mark contacted',
      icon: 'i-lucide-check',
      disabled: props.lead.status !== 'new',
      onSelect: async () => {
        try {
          await $fetch(`/api/leads/${props.lead.id}`, { method: 'PATCH', body: { status: 'contacted' } })
          toast.add({ title: 'Marked contacted', color: 'success' })
          emit('changed')
        } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage ?? '', color: 'error' }) }
      },
    },
    {
      label: 'Mark spam',
      icon: 'i-lucide-trash-2',
      onSelect: async () => {
        await $fetch(`/api/leads/${props.lead.id}`, { method: 'PATCH', body: { status: 'spam_suspected' } })
        toast.add({ title: 'Marked spam', color: 'warning' })
        emit('changed')
      },
    },
  ],
  [
    {
      label: 'Delete (soft)',
      icon: 'i-lucide-trash',
      color: 'error' as const,
      onSelect: () => { showDeleteModal.value = true },
    },
  ],
])

async function confirmDelete() {
  await $fetch(`/api/leads/${props.lead.id}`, { method: 'DELETE' })
  toast.add({ title: 'Lead removed', color: 'success' })
  showDeleteModal.value = false
  emit('changed')
}
</script>

<template>
  <UDropdownMenu :items="items" :popper="{ placement: 'bottom-end' }">
    <UButton icon="i-lucide-more-horizontal" variant="ghost" size="xs" aria-label="Lead actions" />
  </UDropdownMenu>

  <UModal v-model:open="showDeleteModal">
    <template #content>
      <div class="p-6 space-y-3">
        <h3 class="text-base font-semibold">Delete lead?</h3>
        <p class="text-sm text-muted">This soft-deletes the lead. An admin can permanently purge it later.</p>
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="showDeleteModal = false">Cancel</UButton>
          <UButton color="error" @click="confirmDelete">Delete</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
