<script setup lang="ts">
import { idempotencyKey } from '~~/app/utils/idempotencyKey'

interface MenuConfig {
  publicId: string | null
  enabled: boolean
  label: string
  href: string
  desktopSelector: string
  mobileSelector: string
  insertion: 'append' | 'before-last'
  lastObservedAt: string | null
  updatedAt: string | null
}

const props = defineProps<{ clientId: string | null, siteId: string | null }>()
const toast = useToast()
const loading = ref(false)
const saving = ref(false)
const config = reactive<MenuConfig>({
  publicId: null,
  enabled: false,
  label: 'Buying Guides',
  href: '',
  desktopSelector: '',
  mobileSelector: '',
  insertion: 'append',
  lastObservedAt: null,
  updatedAt: null
})
const insertionOptions = [
  { label: 'Append to menu', value: 'append' },
  { label: 'Before the last item', value: 'before-last' }
]
const canSave = computed(() => Boolean(
  props.clientId && props.siteId && config.label.trim() && config.href.trim()
  && config.desktopSelector.trim() && config.mobileSelector.trim()
))
const bootstrap = computed(() => config.publicId
  ? `<script src="https://app.xeroflow.io/search-authority/menu-agent.v1.js" data-config-url="https://app.xeroflow.io/api/public/search-authority/menu/${config.publicId}" async><${'/'}script>`
  : '')

function reset() {
  Object.assign(config, {
    publicId: null,
    enabled: false,
    label: 'Buying Guides',
    href: '',
    desktopSelector: '',
    mobileSelector: '',
    insertion: 'append',
    lastObservedAt: null,
    updatedAt: null
  })
}

function errorMessage(error: unknown): string {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate?.data?.statusMessage || candidate?.message || 'Menu configuration could not be loaded.'
}

async function load() {
  reset()
  if (!props.clientId || !props.siteId) return
  loading.value = true
  try {
    const query = new URLSearchParams({ clientId: props.clientId, siteId: props.siteId })
    const result = await $fetch<{ config: MenuConfig | null }>(
      `/api/agency/search-authority/menu/config?${query}`
    )
    if (result.config) Object.assign(config, result.config)
  } catch (error: unknown) {
    toast.add({ title: 'Menu Agent unavailable', description: errorMessage(error), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!props.clientId || !props.siteId || !canSave.value) return
  saving.value = true
  try {
    const result = await $fetch<{ config: MenuConfig }>('/api/agency/search-authority/menu/config', {
      method: 'PUT',
      headers: { 'Idempotency-Key': idempotencyKey('search-authority-menu') },
      body: {
        clientId: props.clientId,
        siteId: props.siteId,
        enabled: config.enabled,
        label: config.label,
        href: config.href,
        desktopSelector: config.desktopSelector,
        mobileSelector: config.mobileSelector,
        insertion: config.insertion
      }
    })
    Object.assign(config, result.config)
    toast.add({
      title: config.enabled ? 'Buying Guides link enabled' : 'Menu Agent disabled',
      description: config.enabled ? 'The public configuration is ready for the installed GTM tag.' : 'Inserted links are removed at the next configuration check.',
      color: 'success'
    })
  } catch (error: unknown) {
    toast.add({ title: 'Menu configuration not saved', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function copyBootstrap() {
  if (!bootstrap.value) return
  await navigator.clipboard.writeText(bootstrap.value)
  toast.add({ title: 'GTM bootstrap copied', color: 'success' })
}

watch([() => props.clientId, () => props.siteId], () => void load(), { immediate: true })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-semibold text-highlighted">
              GTM Menu Agent
            </h2>
            <UBadge
              :label="config.enabled ? 'Enabled' : 'Disabled'"
              :color="config.enabled ? 'success' : 'neutral'"
              variant="subtle"
            />
          </div>
          <p class="mt-1 text-sm text-muted">
            Adds only the approved Buying Guides link to bounded desktop and mobile menu targets.
          </p>
        </div>
        <div class="text-right text-xs text-muted">
          <p>Agent version v1</p>
          <p>{{ config.lastObservedAt ? `Last agent heartbeat ${new Date(config.lastObservedAt).toLocaleString('en-AU')} (not proof)` : 'No agent heartbeat yet' }}</p>
        </div>
      </div>
    </template>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-24 w-full" />
    </div>
    <div v-else class="@container space-y-5">
      <UAlert
        title="Bounded DOM change"
        description="The agent inserts one text link per configured menu, observes rerenders for 30 seconds, and removes its own nodes when disabled. It cannot create pages or alter schema."
        icon="i-lucide-shield-check"
        color="neutral"
        variant="subtle"
      />

      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Link enabled" help="This is the remote kill switch.">
          <UCheckbox v-model="config.enabled" label="Show Buying Guides in configured menus" />
        </UFormField>
        <UFormField label="Insertion position">
          <USelect
            v-model="config.insertion"
            :items="insertionOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Link label">
          <UInput v-model="config.label" class="w-full" maxlength="60" />
        </UFormField>
        <UFormField label="Approved guide URL">
          <UInput
            v-model="config.href"
            class="w-full"
            placeholder="https://learn.example.com/guides/buying-guide"
          />
        </UFormField>
        <UFormField label="Desktop menu selector">
          <UInput v-model="config.desktopSelector" class="w-full" placeholder="nav.main-menu > ul" />
        </UFormField>
        <UFormField label="Mobile menu selector">
          <UInput v-model="config.mobileSelector" class="w-full" placeholder="[data-testid=&quot;mobile-nav&quot;] ul" />
        </UFormField>
      </div>

      <div class="flex justify-end">
        <UButton
          label="Save Menu Agent"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        />
      </div>

      <div v-if="bootstrap" class="rounded-lg border border-default bg-elevated p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 class="text-sm font-medium text-highlighted">
              GTM bootstrap snippet
            </h3>
            <p class="mt-1 text-xs text-muted">
              Add as a Custom HTML tag on DOM Ready and History Change. XeroFlow owns the versioned script and remote kill switch.
            </p>
          </div>
          <UButton
            label="Copy snippet"
            icon="i-lucide-copy"
            color="neutral"
            variant="soft"
            @click="copyBootstrap"
          />
        </div>
        <pre class="mt-3 overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-default p-3 text-xs text-highlighted"><code>{{ bootstrap }}</code></pre>
      </div>
    </div>
  </UCard>
</template>
