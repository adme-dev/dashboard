<script setup lang="ts">
const qr = useBannerQr()
const {
  open,
  loading,
  inserting,
  error,
  selectedId,
  codes,
  selected,
  managerUrl,
  smallArtboard
} = qr
const options = computed(() => [
  { label: 'Choose a managed QR code', value: 'none' },
  ...codes.value.map(code => ({ label: code.name, value: code.id }))
])
defineExpose({ show: qr.show })
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Add managed QR code"
    description="Use an existing active QR record for this project’s client."
    :ui="{ content: 'max-w-lg' }"
    @update:open="
      (value) => {
        if (!value) qr.cancel();
      }
    "
  >
    <template #body>
      <div class="@container space-y-5">
        <UFormField
          label="Managed QR code"
          description="The platform record keeps its existing destination and scan tracking. No new QR record is created."
        >
          <USelectMenu
            v-model="selectedId"
            :items="options"
            value-key="value"
            searchable
            class="w-full"
            :loading="loading"
            :disabled="loading || inserting"
          />
        </UFormField>
        <div v-if="selected" class="space-y-2 border-l-4 border-primary pl-4">
          <p class="font-medium">
            {{ selected.name }}
          </p>
          <p class="text-sm text-muted break-all">
            Destination: {{ selected.destination_url }}
          </p>
          <UButton
            :to="`/agency/qr-codes/${selected.id}`"
            target="_blank"
            label="Review this QR record"
            variant="link"
            class="px-0"
          />
        </div>
        <UAlert
          v-if="error"
          title="QR code not ready"
          :description="error"
          color="warning"
        />
        <UAlert
          v-else-if="!loading && !codes.length"
          title="No active QR codes available"
          description="Use QR Codes to review this client’s existing records, then reopen this picker."
          color="neutral"
        />
        <UAlert
          v-if="smallArtboard"
          color="warning"
          title="Small artboard"
          description="This format may be too small for a reliably scannable QR. Enlarge the code and test at the final display or print size before publishing."
        />
        <p class="text-sm text-muted">
          Adds a separate layer with a clear quiet zone. Move it into a reserved
          area so it does not cover the offer, map or legal copy. This does not
          remove a QR already baked into an image. Review the placement and test
          the final export before publishing or printing.
        </p>
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Add managed QR"
            icon="i-lucide-qr-code"
            :disabled="!selected || loading || inserting"
            :loading="inserting"
            @click="qr.insert"
          />
          <UButton
            v-if="inserting"
            label="Cancel"
            variant="ghost"
            @click="qr.cancel"
          />
          <UButton
            :to="managerUrl"
            target="_blank"
            label="Open QR Codes"
            variant="outline"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
