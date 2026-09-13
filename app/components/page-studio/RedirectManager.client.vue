<script setup lang="ts">
import type { PageStudioRedirect } from '~~/shared/pageStudio/document'

const props = defineProps<{ redirects: PageStudioRedirect[] }>()
const emit = defineEmits<{ update: [redirects: PageStudioRedirect[]] }>()
const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const form = reactive({ fromPath: '', toPath: '', statusCode: 301 as 301 | 302 })
const statusItems = [
  { label: '301 Permanent', value: 301 },
  { label: '302 Temporary', value: 302 }
]
const valid = computed(() => /^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/.test(form.fromPath)
  && (form.toPath.startsWith('/') || /^https:\/\//i.test(form.toPath))
  && form.fromPath !== form.toPath)

function openCreate() {
  editingId.value = null
  Object.assign(form, { fromPath: '', toPath: '', statusCode: 301 })
  modalOpen.value = true
}

function openEdit(redirect: PageStudioRedirect) {
  editingId.value = redirect.id
  Object.assign(form, redirect)
  modalOpen.value = true
}

function save() {
  if (!valid.value) return
  const redirect: PageStudioRedirect = {
    id: editingId.value || crypto.randomUUID(),
    fromPath: form.fromPath,
    toPath: form.toPath,
    statusCode: form.statusCode
  }
  const next = editingId.value
    ? props.redirects.map(item => item.id === editingId.value ? redirect : item)
    : [...props.redirects, redirect]
  emit('update', next)
  modalOpen.value = false
}

function remove(id: string) {
  emit('update', props.redirects.filter(redirect => redirect.id !== id))
}

function closeModal() {
  modalOpen.value = false
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-semibold text-highlighted">
            Redirects
          </h2>
          <p class="mt-1 text-sm text-muted">
            Preserve old links when routes or campaign destinations change.
          </p>
        </div>
        <UButton
          label="Add redirect"
          icon="i-lucide-corner-down-right"
          color="neutral"
          variant="outline"
          @click="openCreate"
        />
      </div>
    </template>

    <div v-if="redirects.length" class="divide-y divide-default">
      <div v-for="redirect in redirects" :key="redirect.id" class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
        <UBadge :label="String(redirect.statusCode)" color="neutral" variant="subtle" />
        <div class="min-w-0 flex-1 text-sm">
          <p class="truncate font-mono text-highlighted">
            {{ redirect.fromPath }}
          </p>
          <p class="mt-1 truncate font-mono text-muted">
            to {{ redirect.toPath }}
          </p>
        </div>
        <div class="flex gap-1">
          <UButton
            label="Edit"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="openEdit(redirect)"
          />
          <UButton
            label="Remove"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            @click="remove(redirect.id)"
          />
        </div>
      </div>
    </div>
    <div v-else class="py-8 text-center">
      <UIcon name="i-lucide-route" class="mx-auto size-8 text-dimmed" />
      <p class="mt-3 text-sm font-medium text-highlighted">
        No redirects
      </p>
      <p class="mt-1 text-sm text-muted">
        Add one before replacing a route that may already receive traffic.
      </p>
    </div>

    <UModal v-model:open="modalOpen" :title="editingId ? 'Edit redirect' : 'Add redirect'">
      <template #content>
        <div class="@container space-y-5 p-6">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              {{ editingId ? 'Edit redirect' : 'Add redirect' }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              Use canonical lowercase paths. External destinations must use HTTPS.
            </p>
          </div>
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="From route">
              <UInput v-model="form.fromPath" class="w-full" placeholder="/old-service" />
            </UFormField>
            <UFormField label="Redirect type">
              <USelect v-model="form.statusCode" class="w-full" :items="statusItems" />
            </UFormField>
            <UFormField label="Destination" class="@lg:col-span-2">
              <UInput v-model="form.toPath" class="w-full" placeholder="/services/new-service" />
            </UFormField>
          </div>
          <UAlert
            v-if="!valid && (form.fromPath || form.toPath)"
            title="Enter a valid redirect"
            description="The source must be a lowercase route and the destination must be an internal path or HTTPS URL."
            color="warning"
            variant="subtle"
          />
          <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="closeModal"
            />
            <UButton
              label="Save redirect"
              icon="i-lucide-check"
              :disabled="!valid"
              @click="save"
            />
          </div>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
