<script setup lang="ts">
definePageMeta({ layout: false })

interface ListMembership { list_id: string, list_name: string, status: string }

const route = useRoute()
const toast = useToast()

const c = computed(() => String(route.query.c || ''))
const s = computed(() => String(route.query.s || ''))
const t = computed(() => String(route.query.t || ''))

useHead({ title: 'Unsubscribe · XeroFlow', meta: [{ name: 'robots', content: 'noindex' }] })

const { data, error } = await useFetch<{ email: string, name: string | null, lists: ListMembership[] }>(
  '/api/public/email/lookup',
  { query: { c, s, t } }
)

const lists = ref<ListMembership[]>([])
// Seed once from the server snapshot. We do NOT re-sync on later data changes
// because the user mutates `lists` in place (toggles / unsubscribe-all); a
// refetch overwriting it would visually revert a change that actually persisted.
const seeded = ref(false)
watchEffect(() => {
  if (!seeded.value && data.value?.lists) {
    lists.value = data.value.lists.map(l => ({ ...l }))
    seeded.value = true
  }
})

const unsubscribedAll = ref(false)
const submitting = ref(false)
// Track per-list in-flight state so overlapping toggles don't clobber each
// other's spinner (a single shared id would).
const pendingListIds = ref<Set<string>>(new Set())

async function unsubscribeAll() {
  submitting.value = true
  try {
    await $fetch('/api/public/email/unsubscribe', {
      method: 'POST',
      body: { c: c.value, s: s.value, t: t.value }
    })
    unsubscribedAll.value = true
    lists.value = lists.value.map(l => ({ ...l, status: 'unsubscribed' }))
  } catch {
    toast.add({ title: 'Something went wrong', description: 'Please try again in a moment.', color: 'error' })
  } finally {
    submitting.value = false
  }
}

async function setPreference(list: ListMembership, subscribe: boolean) {
  pendingListIds.value = new Set(pendingListIds.value).add(list.list_id)
  const previous = list.status
  list.status = subscribe ? 'confirmed' : 'unsubscribed' // optimistic
  try {
    await $fetch('/api/public/email/preferences', {
      method: 'POST',
      body: { c: c.value, s: s.value, t: t.value, listId: list.list_id, subscribe }
    })
    if (subscribe) unsubscribedAll.value = false
  } catch {
    list.status = previous // revert
    toast.add({ title: 'Couldn\'t update that list', description: 'Please try again.', color: 'error' })
  } finally {
    const next = new Set(pendingListIds.value)
    next.delete(list.list_id)
    pendingListIds.value = next
  }
}
</script>

<template>
  <EmailPublicShell eyebrow="Manage subscription">
    <!-- invalid / expired link -->
    <template v-if="error">
      <div class="flex flex-col items-center text-center">
        <UIcon name="i-lucide-link-2-off" class="mb-4 size-9 text-white/30" />
        <h1 class="text-xl font-semibold tracking-tight">
          This link isn't valid
        </h1>
        <p class="mt-2 text-sm leading-relaxed text-white/50">
          It may have expired or been altered. If you're still receiving emails you'd
          rather not, reply to one of them and we'll take care of it.
        </p>
      </div>
    </template>

    <template v-else>
      <h1 class="text-2xl font-semibold leading-tight tracking-tight">
        {{ unsubscribedAll ? 'You\'re unsubscribed' : 'Unsubscribe' }}
      </h1>
      <p class="mt-2 text-sm leading-relaxed text-white/55">
        <template v-if="unsubscribedAll">
          We've removed <span class="text-white/80">{{ data?.email }}</span> from all
          mailings. You won't hear from us unless you opt back in below.
        </template>
        <template v-else>
          Confirm you'd like to stop emails to
          <span class="text-white/80">{{ data?.email }}</span>, or fine-tune which
          lists you stay on.
        </template>
      </p>

      <UButton
        v-if="!unsubscribedAll"
        block
        size="lg"
        color="neutral"
        class="mt-6 bg-white font-medium text-[#0a0b0e] hover:bg-white/90"
        :loading="submitting"
        label="Unsubscribe from all emails"
        @click="unsubscribeAll"
      />

      <div
        v-if="unsubscribedAll"
        class="mt-6 flex items-center gap-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-300"
      >
        <UIcon name="i-lucide-check-circle" class="size-4 shrink-0" />
        <span>Done — your preferences are saved.</span>
      </div>

      <!-- preference center -->
      <template v-if="lists.length">
        <div class="mt-8 flex items-center gap-3">
          <div class="h-px flex-1 bg-white/[0.08]" />
          <span class="font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">Your lists</span>
          <div class="h-px flex-1 bg-white/[0.08]" />
        </div>

        <ul class="mt-5 space-y-1">
          <li
            v-for="list in lists"
            :key="list.list_id"
            class="flex items-center justify-between gap-4 rounded-lg px-1 py-2.5"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-medium text-white/90">
                {{ list.list_name }}
              </p>
              <p class="text-[12px] text-white/40">
                {{ list.status === 'unsubscribed' ? 'Unsubscribed' : list.status === 'unconfirmed' ? 'Pending confirmation' : 'Subscribed' }}
              </p>
            </div>
            <USwitch
              :model-value="list.status !== 'unsubscribed'"
              :loading="pendingListIds.has(list.list_id)"
              @update:model-value="(v: boolean) => setPreference(list, v)"
            />
          </li>
        </ul>
      </template>
    </template>
  </EmailPublicShell>
</template>
