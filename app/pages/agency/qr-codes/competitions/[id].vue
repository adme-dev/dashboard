<script setup lang="ts">
import { AU_STATES, CompetitionDetailsSchema, totalPrizeValue, permitLikelyRequired } from '~~/shared/qr/competition'

definePageMeta({ layout: 'agency' })
const route = useRoute()
const api = useQrCodes()
const toast = useToast()
const id = route.params.id as string
const { data, refresh } = await useAsyncData(`qr-competition-${id}`, () => api.competition(id))
useHead({ title: () => data.value?.competition?.name ?? 'Competition' })

const c = computed(() => data.value?.competition)
const details = ref<any>(null)
const permits = ref<any[]>([])
const meta = reactive({ name: '', type: 'chance', timezone: 'Australia/Melbourne', opensAt: '', closesAt: '' })
watch(c, (v) => {
  if (!v) return
  details.value = CompetitionDetailsSchema.parse(v.details)
  permits.value = v.permits.map((p: any) => ({ ...p }))
  meta.name = v.name
  meta.type = v.type
  meta.timezone = v.timezone
  meta.opensAt = v.opens_at ? v.opens_at.slice(0, 16) : ''
  meta.closesAt = v.closes_at ? v.closes_at.slice(0, 16) : ''
}, { immediate: true })

const tab = ref('setup')
const tabs = [
  { label: 'Set-up', value: 'setup' }, { label: 'Terms', value: 'terms' }, { label: 'Permits & documents', value: 'legal' }, { label: 'Entries', value: 'entries' }, { label: 'Draw', value: 'draw' }
]
const saving = ref(false)
const total = computed(() => details.value ? totalPrizeValue(details.value) : 0)
const stateItems = AU_STATES.map(s => ({ label: s, value: s }))
const toIso = (local: string) => local ? new Date(local).toISOString() : null

async function save(extra: Record<string, unknown> = {}) {
  saving.value = true
  try {
    await api.updateCompetition(id, { name: meta.name, type: meta.type, timezone: meta.timezone, opensAt: toIso(meta.opensAt), closesAt: toIso(meta.closesAt), details: details.value, permits: permits.value, ...extra })
    await refresh()
    toast.add({ title: extra.versionTerms ? 'Terms generated as a new version' : 'Saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    saving.value = false
  }
}
async function setStatus(status: string) {
  await save({ status })
}
function addPrize() {
  details.value.prize_items.push({ name: '', value: 0, quantity: 1 })
}
function flagFor(p: any) {
  return permitLikelyRequired(p.state, meta.type as any, total.value)
}
const permitStatusItems = [{ label: 'Not required', value: 'not_required' }, { label: 'To apply', value: 'to_apply' }, { label: 'Applied', value: 'applied' }, { label: 'Approved', value: 'approved' }, { label: 'Refused', value: 'refused' }]

// Documents
const docInput = ref<HTMLInputElement>()
const docKind = ref('permit')
const docState = ref('')
const docTitle = ref('')
const docKinds = [{ label: 'Permit approval', value: 'permit' }, { label: 'Signed terms', value: 'terms_signed' }, { label: 'Client contract', value: 'contract' }, { label: 'Correspondence', value: 'correspondence' }, { label: 'Other', value: 'other' }]
async function uploadDoc(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await api.uploadCompetitionDocument(id, file, docKind.value, docTitle.value || file.name, docState.value || undefined)
    docTitle.value = ''
    await refresh()
    toast.add({ title: 'Document stored', description: 'Hashed and locked — it can only be removed with a reason.', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.data?.statusMessage, color: 'error' })
  }
}
const removing = ref<any>(null)
const removeReason = ref('')
async function removeDoc() {
  try {
    await api.deleteCompetitionDocument(id, removing.value.id, removeReason.value)
    removing.value = null
    removeReason.value = ''
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Could not remove', description: e?.data?.statusMessage, color: 'error' })
  }
}

// Entries + draw
const { data: entriesData, refresh: refreshEntries } = await useAsyncData(`qr-competition-entries-${id}`, () => api.competitionEntries(id))
const entries = computed(() => entriesData.value?.entries ?? [])
const drawOpen = ref(false)
const drawing = ref(false)
async function draw() {
  drawing.value = true
  try {
    await api.drawCompetition(id, {})
    drawOpen.value = false
    await Promise.all([refresh(), refreshEntries()])
    toast.add({ title: 'Draw complete', description: 'Winners and reserves are recorded with the seed hash.', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Draw failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    drawing.value = false
  }
}
const money = (n: number) => `$${Number(n).toLocaleString('en-AU')}`
const fmt = (d: string) => new Date(d).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<template>
  <div v-if="c && details" class="h-full overflow-y-auto p-6 space-y-6">
    <UButton
      to="/agency/qr-codes/competitions"
      variant="link"
      color="neutral"
      icon="i-lucide-arrow-left"
      class="px-0"
    >
      Competitions
    </UButton>
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-2xl font-semibold tracking-tight">
            {{ c.name }}
          </h1>
          <UBadge
            variant="subtle"
            size="sm"
            class="capitalize"
            :color="c.status === 'open' ? 'success' : c.status === 'drawn' ? 'primary' : 'neutral'"
          >
            {{ c.status }}
          </UBadge>
          <UBadge variant="outline" size="sm" color="neutral">
            {{ c.type === 'skill' ? 'Game of skill' : 'Random draw' }}
          </UBadge>
        </div>
        <p class="mt-0.5 text-sm text-muted">
          {{ c.client_name }} · {{ data.stats.total }} entries · {{ data.stats.people }} people · prize pool {{ money(total) }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="c.status === 'draft' || c.status === 'closed'"
          icon="i-lucide-play"
          :loading="saving"
          :disabled="c.terms_current_version === 0"
          @click="setStatus('open')"
        >
          Open entries
        </UButton>
        <UButton
          v-if="c.status === 'open'"
          icon="i-lucide-square"
          variant="soft"
          color="neutral"
          :loading="saving"
          @click="setStatus('closed')"
        >
          Close entries
        </UButton>
        <UButton
          v-if="c.type === 'chance' && ['open', 'closed'].includes(c.status)"
          icon="i-lucide-dices"
          color="primary"
          variant="soft"
          @click="() => { drawOpen = true }"
        >
          Draw winners
        </UButton>
      </div>
    </header>
    <p v-if="c.terms_current_version === 0" class="text-xs text-warning">
      Generate the terms (Terms tab) before opening entries.
    </p>

    <UTabs v-model="tab" :items="tabs" variant="link" />

    <!-- SET-UP -->
    <section v-show="tab === 'setup'" class="space-y-6">
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Name" required>
          <UInput v-model="meta.name" class="w-full" />
        </UFormField>
        <UFormField label="Type">
          <USelectMenu
            v-model="meta.type"
            :items="[{ label: 'Random draw', value: 'chance' }, { label: 'Judged (skill)', value: 'skill' }]"
            value-key="value"
            class="w-full"
            :disabled="c.status !== 'draft'"
          />
        </UFormField>
        <UFormField label="Opens" help="Local time">
          <UInput v-model="meta.opensAt" type="datetime-local" class="w-full" />
        </UFormField>
        <UFormField label="Closes" help="Local time">
          <UInput v-model="meta.closesAt" type="datetime-local" class="w-full" />
        </UFormField>
      </div>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">
        Promoter
      </h3>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <UFormField label="Legal name" required>
          <UInput v-model="details.promoter.legal_name" class="w-full" />
        </UFormField>
        <UFormField label="ABN">
          <UInput v-model="details.promoter.abn" class="w-full font-mono" placeholder="12 345 678 901" />
        </UFormField>
        <UFormField label="Address">
          <UInput v-model="details.promoter.address" class="w-full" />
        </UFormField>
        <UFormField label="Contact email">
          <UInput v-model="details.promoter.contact_email" class="w-full" />
        </UFormField>
        <UFormField label="Contact phone">
          <UInput v-model="details.promoter.contact_phone" class="w-full" />
        </UFormField>
        <UFormField label="Privacy policy URL">
          <UInput v-model="details.privacy_url" class="w-full" />
        </UFormField>
      </div>
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">
          Prizes · total {{ money(total) }}
        </h3>
        <UButton
          size="xs"
          variant="soft"
          icon="i-lucide-plus"
          @click="addPrize"
        >
          Add prize
        </UButton>
      </div>
      <div v-for="(p, i) in details.prize_items" :key="i" class="grid grid-cols-[1fr_140px_100px_auto] items-end gap-2">
        <UFormField label="Prize" size="sm">
          <UInput v-model="p.name" size="sm" class="w-full" />
        </UFormField>
        <UFormField label="Value each ($)" size="sm">
          <UInput
            v-model.number="p.value"
            type="number"
            size="sm"
            class="w-full"
            min="0"
          />
        </UFormField>
        <UFormField label="Qty" size="sm">
          <UInput
            v-model.number="p.quantity"
            type="number"
            size="sm"
            class="w-full"
            min="1"
          />
        </UFormField>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          icon="i-lucide-trash-2"
          class="mb-1"
          @click="details.prize_items.splice(i, 1)"
        />
      </div>
      <UFormField label="Prize summary (one line for the page)">
        <UInput v-model="details.prize_summary" class="w-full" />
      </UFormField>
      <h3 class="text-xs font-semibold uppercase tracking-wider text-muted">
        Eligibility
      </h3>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Minimum age">
          <UInput
            v-model.number="details.eligibility.min_age"
            type="number"
            class="w-full"
            min="0"
            max="25"
          />
        </UFormField>
        <UFormField label="Entries per person">
          <UInput
            v-model.number="details.eligibility.max_entries_per_person"
            type="number"
            class="w-full"
            min="1"
          />
        </UFormField>
        <UFormField label="Open in states">
          <USelectMenu
            v-model="details.eligibility.states"
            :items="stateItems"
            value-key="value"
            multiple
            class="w-full"
          />
        </UFormField>
        <UFormField label="Exclude staff & families">
          <USwitch v-model="details.eligibility.exclude_staff" />
        </UFormField>
      </div>
      <UFormField v-if="meta.type === 'skill'" label="Skill question (shown on the entry form)">
        <UInput v-model="details.skill_question" class="w-full" />
      </UFormField>
      <UFormField v-if="meta.type === 'skill'" label="Judging criteria">
        <UTextarea v-model="details.judging_criteria" :rows="2" class="w-full" />
      </UFormField>
      <div v-else class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Draw date/time (text)">
          <UInput v-model="details.draw.at" class="w-full" placeholder="1 Oct 2026, 10am AEST" />
        </UFormField>
        <UFormField label="Draw venue">
          <UInput v-model="details.draw.venue" class="w-full" />
        </UFormField>
        <UFormField label="Winners">
          <UInput
            v-model.number="details.draw.winners"
            type="number"
            class="w-full"
            min="1"
          />
        </UFormField>
        <UFormField label="Reserves">
          <UInput
            v-model.number="details.draw.reserves"
            type="number"
            class="w-full"
            min="0"
          />
        </UFormField>
        <UFormField label="Notify within (days)">
          <UInput
            v-model.number="details.draw.notify_within_days"
            type="number"
            class="w-full"
            min="1"
          />
        </UFormField>
        <UFormField label="Winners published at">
          <UInput v-model="details.draw.publish_where" class="w-full" placeholder="client.com.au/winners" />
        </UFormField>
        <UFormField label="Unclaimed after (days)">
          <UInput
            v-model.number="details.draw.unclaimed_after_days"
            type="number"
            class="w-full"
            min="7"
          />
        </UFormField>
      </div>
      <UFormField label="Additional terms (optional)">
        <UTextarea v-model="details.extra_terms_md" :rows="3" class="w-full" />
      </UFormField>
      <div class="flex justify-end">
        <UButton :loading="saving" @click="save()">
          Save set-up
        </UButton>
      </div>
    </section>

    <!-- TERMS -->
    <section v-show="tab === 'terms'" class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-muted">
          Generated from the set-up fields. Every change creates a new immutable version; each entry records which version was accepted.
        </p>
        <UButton icon="i-lucide-file-check" :loading="saving" @click="save({ versionTerms: true })">
          {{ c.terms_current_version ? 'Regenerate as new version' : 'Generate terms' }}
        </UButton>
      </div>
      <div v-if="data.terms.length" class="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <ul class="space-y-1 text-sm">
          <li
            v-for="t in data.terms"
            :key="t.id"
            class="rounded-md px-3 py-2"
            :class="t.version === c.terms_current_version ? 'bg-elevated font-medium' : 'text-muted'"
          >
            v{{ t.version }} · {{ new Date(t.created_at).toLocaleDateString('en-AU') }}
            <p class="truncate font-mono text-[10px] text-muted">
              {{ t.sha256.slice(0, 16) }}…
            </p>
          </li>
        </ul>
        <pre class="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-elevated/60 p-4 text-xs leading-relaxed">{{ data.terms[0]?.terms_md }}</pre>
      </div>
      <p v-else class="text-sm text-muted">
        No terms yet.
      </p>
    </section>

    <!-- LEGAL -->
    <section v-show="tab === 'legal'" class="space-y-6">
      <div>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Permits by state · {{ meta.type === 'skill' ? 'game of skill' : 'random draw' }} · pool {{ money(total) }}
        </h3>
        <p class="mb-3 text-xs text-muted">
          Flags are indicative (thresholds as at Aug 2026). Confirm each row; attach the approval to the vault below and reference it here.
        </p>
        <div class="tablewrap overflow-x-auto rounded-xl ring-1 ring-default">
          <table class="w-full text-sm">
            <thead class="text-left text-xs uppercase tracking-wider text-muted">
              <tr>
                <th class="px-3 py-2">
                  State
                </th><th class="px-3 py-2">
                  Indication
                </th><th class="px-3 py-2">
                  Status
                </th><th class="px-3 py-2">
                  Permit number
                </th><th class="px-3 py-2">
                  Approval document
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="p in permits" :key="p.state">
                <td class="px-3 py-2 font-medium">
                  {{ p.state }}
                </td>
                <td class="px-3 py-2 text-xs" :class="flagFor(p).required ? 'text-warning' : 'text-muted'">
                  {{ flagFor(p).reason }}
                </td>
                <td class="px-3 py-2">
                  <USelectMenu
                    v-model="p.status"
                    :items="permitStatusItems"
                    value-key="value"
                    size="sm"
                    class="w-40"
                  />
                </td>
                <td class="px-3 py-2">
                  <UInput v-model="p.permit_number" size="sm" class="w-44 font-mono" />
                </td>
                <td class="px-3 py-2">
                  <USelectMenu
                    v-model="p.document_id"
                    :items="[{ label: '—', value: null }, ...data.documents.filter((d: any) => d.kind === 'permit').map((d: any) => ({ label: d.title, value: d.id }))]"
                    value-key="value"
                    size="sm"
                    class="w-52"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="mt-3 flex justify-end">
          <UButton :loading="saving" @click="save()">
            Save permits
          </UButton>
        </div>
      </div>
      <div>
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Legal vault
        </h3>
        <p class="mb-3 text-xs text-muted">
          Permit approvals, signed terms, client contracts, correspondence. Files are hashed on upload and never overwritten; removal needs a reason and is logged.
        </p>
        <div class="flex flex-wrap items-end gap-2 rounded-lg bg-elevated/50 p-3">
          <UFormField label="Kind" size="sm">
            <USelectMenu
              v-model="docKind"
              :items="docKinds"
              value-key="value"
              size="sm"
              class="w-44"
            />
          </UFormField>
          <UFormField label="State (permits)" size="sm">
            <USelectMenu
              v-model="docState"
              :items="[{ label: '—', value: '' }, ...stateItems]"
              value-key="value"
              size="sm"
              class="w-28"
            />
          </UFormField>
          <UFormField label="Title" size="sm">
            <UInput
              v-model="docTitle"
              size="sm"
              class="w-64"
              placeholder="ACT permit TP 26/01234"
            />
          </UFormField>
          <input
            ref="docInput"
            type="file"
            class="hidden"
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.eml,.txt"
            @change="uploadDoc"
          >
          <UButton size="sm" icon="i-lucide-upload" @click="docInput?.click()">
            Upload
          </UButton>
        </div>
        <ul v-if="data.documents.length" class="mt-3 divide-y divide-default rounded-xl ring-1 ring-default">
          <li v-for="d in data.documents" :key="d.id" class="flex items-center gap-3 px-3 py-2 text-sm">
            <UIcon name="i-lucide-file-lock-2" class="size-4 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">
                {{ d.title }} <span v-if="d.state" class="text-xs text-muted">· {{ d.state }}</span>
              </p>
              <p class="truncate font-mono text-[10px] text-muted">
                {{ d.kind }} · {{ (d.size_bytes / 1024).toFixed(0) }} KB · sha256 {{ d.sha256.slice(0, 20) }}… · {{ d.uploaded_by_name ?? 'staff' }} · {{ fmt(d.uploaded_at) }}
              </p>
            </div>
            <UButton
              :to="`/api/agency/qr-competitions/${id}/documents/${d.id}`"
              external
              size="xs"
              variant="soft"
              color="neutral"
              icon="i-lucide-download"
            >
              Download
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-trash-2"
              @click="() => { removing = d }"
            />
          </li>
        </ul>
        <p v-else class="mt-3 text-sm text-muted">
          Nothing in the vault yet.
        </p>
      </div>
    </section>

    <!-- ENTRIES -->
    <section v-show="tab === 'entries'" class="space-y-3">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <UCard v-for="k in [['Total', data.stats.total], ['Valid', data.stats.valid], ['Disqualified', data.stats.disqualified], ['Winners', data.stats.winners]]" :key="k[0]" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">
            {{ k[0] }}
          </p>
          <p class="text-xl font-semibold tabular-nums">
            {{ k[1] }}
          </p>
        </UCard>
      </div>
      <div class="overflow-x-auto rounded-xl ring-1 ring-default">
        <table class="w-full text-sm">
          <thead class="text-left text-xs uppercase tracking-wider text-muted">
            <tr>
              <th class="px-3 py-2">
                When
              </th><th class="px-3 py-2">
                Name
              </th><th class="px-3 py-2">
                Contact
              </th><th class="px-3 py-2">
                Postcode
              </th><th class="px-3 py-2">
                Code
              </th><th class="px-3 py-2">
                Terms
              </th><th class="px-3 py-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-default">
            <tr v-for="e in entries" :key="e.id" :class="e.status === 'winner' ? 'bg-primary/5' : ''">
              <td class="px-3 py-2 whitespace-nowrap text-muted">
                {{ fmt(e.created_at) }}
              </td>
              <td class="px-3 py-2">
                {{ e.field_data?.full_name ?? '—' }}
              </td>
              <td class="px-3 py-2 text-muted">
                {{ e.field_data?.phone ?? e.field_data?.email ?? '—' }}
              </td>
              <td class="px-3 py-2 tabular-nums">
                {{ e.postcode ?? '—' }} <span class="text-xs text-muted">{{ e.state ?? '' }}</span>
              </td>
              <td class="px-3 py-2 font-mono text-xs">
                {{ e.qr_code ?? '—' }}
              </td>
              <td class="px-3 py-2 text-xs text-muted">
                v{{ e.terms_version }}
              </td>
              <td class="px-3 py-2">
                <UBadge
                  :color="e.status === 'winner' ? 'primary' : e.status === 'reserve' ? 'warning' : e.status === 'disqualified' ? 'error' : 'neutral'"
                  variant="subtle"
                  size="sm"
                  class="capitalize"
                >
                  {{ e.status }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-if="!entries.length" class="p-6 text-center text-sm text-muted">
          No entries yet. Link a hosted page to this competition (page template “Competition entry”).
        </p>
      </div>
    </section>

    <!-- DRAW -->
    <section v-show="tab === 'draw'" class="space-y-4">
      <div v-for="d in data.draws" :key="d.id" class="rounded-xl p-4 ring-1 ring-default">
        <p class="font-medium">
          Drawn {{ fmt(d.drawn_at) }} by {{ d.drawn_by_name ?? 'staff' }}
        </p>
        <p class="font-mono text-[11px] text-muted">
          {{ d.method }} · {{ d.eligible_count }} eligible · seed sha256 {{ d.seed_sha256 }}
        </p>
        <p class="mt-2 text-sm">
          {{ d.winners.length }} winners, {{ d.reserves.length }} reserves — see Entries for names.
        </p>
        <p v-if="d.note" class="text-sm text-muted">
          {{ d.note }}
        </p>
      </div>
      <p v-if="!data.draws.length" class="text-sm text-muted">
        No draw yet. Close entries, then use “Draw winners”. The draw records the eligible set, the seed hash and the ordered result so it can be audited.
      </p>
    </section>

    <UModal v-model:open="drawOpen" title="Draw winners?">
      <template #body>
        <p class="text-sm">
          {{ details.draw.winners }} winner{{ details.draw.winners === 1 ? '' : 's' }} and {{ details.draw.reserves }} reserve{{ details.draw.reserves === 1 ? '' : 's' }} from {{ data.stats.valid }} valid entries. This closes the competition and is recorded permanently.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { drawOpen = false }">
            Cancel
          </UButton>
          <UButton :loading="drawing" icon="i-lucide-dices" @click="draw">
            Run the draw
          </UButton>
        </div>
      </template>
    </UModal>
    <UModal :open="!!removing" title="Remove document?" @update:open="v => !v && (removing = null)">
      <template #body>
        <p class="text-sm">
          The file stays in storage and the record keeps its hash, uploader and timestamp; only its visibility changes. A reason is required.
        </p>
        <UFormField label="Reason" class="mt-3">
          <UInput v-model="removeReason" class="w-full" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="() => { removing = null }">
            Cancel
          </UButton>
          <UButton color="error" :disabled="removeReason.trim().length < 3" @click="removeDoc">
            Remove
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
