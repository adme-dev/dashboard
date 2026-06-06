<!-- app/components/email/ListFormModal.vue -->
<script setup lang="ts">
import { describeEmailActionError } from '~~/app/utils/emailActionError'

interface ListInput { id: string, name: string, description: string | null, double_optin: boolean }
const props = defineProps<{ list?: ListInput | null }>()
const emit = defineEmits<{ (e: 'saved'): void }>()
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const saving = ref(false)
const form = reactive({ name: '', description: '', double_optin: false })

watch(open, (v) => {
  if (v) {
    form.name = props.list?.name ?? ''
    form.description = props.list?.description ?? ''
    form.double_optin = props.list?.double_optin ?? false
  }
})

async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name required', color: 'error' })
    return
  }
  saving.value = true
  try {
    if (props.list) {
      await $fetch(`/api/email/lists/${props.list.id}`, { method: 'PATCH', body: { ...form } })
    } else {
      await $fetch('/api/email/lists', { method: 'POST', body: { ...form } })
    }
    toast.add({ title: 'List saved', color: 'success' })
    open.value = false
    emit('saved')
  } catch (e: unknown) {
    toast.add({
      title: 'Save failed',
      description: describeEmailActionError(e, 'Could not save list.'),
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
        <div>
          <h3 class="text-lg font-semibold">
            {{ props.list ? 'Edit list' : 'New list' }}
          </h3>
        </div>

        <UFormField label="Name" required>
          <UInput v-model="form.name" placeholder="Monthly Newsletter" class="w-full" />
        </UFormField>

        <UFormField label="Description">
          <UTextarea v-model="form.description" :rows="3" class="w-full" />
        </UFormField>

        <UFormField label="Double opt-in" help="Require email confirmation before a subscriber is active (used by public signup forms in a later phase).">
          <UCheckbox v-model="form.double_optin" label="Require confirmation" />
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
            label="Save"
            :loading="saving"
            @click="save"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
