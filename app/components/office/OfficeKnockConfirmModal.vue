<script setup lang="ts">
// Phase 1c.1 — confirm dialog shown when user clicks a knockable focus/private
// room. Emits 'confirm' (knock!) or 'cancel'. Parent (OfficeFloorPlan) wires
// to useOfficeKnocks.sendKnock(zoneId) on confirm.

interface Props {
  open: boolean
  zoneName: string
  occupantNames: string[]
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
}>()

function onCancel() {
  emit('update:open', false)
}

function onConfirm() {
  emit('confirm')
  emit('update:open', false)
}

const headline = computed(() => {
  if (props.occupantNames.length === 1) {
    return `Knock on ${props.occupantNames[0]}?`
  }
  return `Knock on ${props.zoneName}?`
})

const subtext = computed(() => {
  if (props.occupantNames.length === 1) {
    return `${props.occupantNames[0]} is in ${props.zoneName}. This will interrupt them — they can accept or deny.`
  }
  return `${props.occupantNames.join(', ')} are in ${props.zoneName}. They can accept or deny.`
})
</script>

<template>
  <UModal :open="open" @update:open="(v) => emit('update:open', v)">
    <template #content>
      <div class="p-6 space-y-4">
        <div class="space-y-2">
          <h3 class="text-lg font-semibold">{{ headline }}</h3>
          <p class="text-sm text-muted">{{ subtext }}</p>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <UButton variant="ghost" @click="onCancel">Cancel</UButton>
          <UButton color="primary" @click="onConfirm">Knock</UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
