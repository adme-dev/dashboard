<!-- app/components/email/SubscriberFormModal.vue -->
<script setup lang="ts">
import { describeEmailActionError } from '~~/app/utils/emailActionError'

const props = defineProps<{ lists: { id: string, name: string }[] }>()
const emit = defineEmits<{ (e: 'saved'): void }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const saving = ref(false)
const form = reactive({ email: '', name: '', list_ids: [] as string[] })

const listOptions = computed(() => props.lists.map(l => ({ value: l.id, label: l.name })))

watch(open, (v) => {
  if (v) {
    form.email = ''
    form.name = ''
    form.list_ids = []
  }
})

async function save() {
  if (!form.email.trim()) {
    toast.add({ title: 'Email required', color: 'error' })
    return
  }
  saving.value = true
  try {
    await $fetch('/api/email/subscribers', { method: 'POST', body: { ...form } })
    toast.add({ title: 'Subscriber added', color: 'success' })
    open.value = false
    emit('saved')
  } catch (e: unknown) {
    toast.add({
      title: 'Add failed',
      description: describeEmailActionError(e, 'Could not add subscriber.'),
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open">
    <template #content>
      <div class="p-6 space-y-5">
        <h3 class="text-lg font-semibold">
          Add subscriber
        </h3>

        <UFormField label="Email" required>
          <UInput
            v-model="form.email"
            type="email"
            placeholder="person@example.com"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Name">
          <UInput v-model="form.name" class="w-full" />
        </UFormField>

        <UFormField label="Add to lists">
          <USelectMenu
            v-model="form.list_ids"
            :items="listOptions"
            value-key="value"
            multiple
            placeholder="Select lists"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-4 border-t border-default">
          <UButton
            variant="ghost"
            color="neutral"
            label="Cancel"
            @click="open = false"
          />
          <UButton
            color="primary"
            label="Add"
            :loading="saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
