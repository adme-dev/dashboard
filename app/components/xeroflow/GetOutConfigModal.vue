<script setup lang="ts">
/**
 * Editable Get Out config — line items grouped by category (wages / expenses / extras).
 * Each line: label + amount + optional notes. Categories are fixed; line
 * count is unbounded. Empty labels/zero amounts are stripped on save.
 */

interface Line {
  id: string
  label: string
  category: 'wages' | 'expenses' | 'extras'
  amountCents: number
  notes?: string | null
}

const props = defineProps<{
  open: boolean
  initialLines: Line[]
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'saved'): void
}>()

const toast = useToast()
const lines = ref<Line[]>([])
const saving = ref(false)

// Reset working copy when the modal opens
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  // Each line gets editable amount-in-dollars for the form, persisted as cents
  lines.value = props.initialLines.map(l => ({ ...l }))
}, { immediate: true })

function newId() {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function addLine(category: Line['category']) {
  lines.value.push({
    id: newId(),
    label: '',
    category,
    amountCents: 0,
  })
}

function removeLine(id: string) {
  lines.value = lines.value.filter(l => l.id !== id)
}

function dollarsForLine(line: Line): number {
  return line.amountCents / 100
}
function setDollarsForLine(line: Line, dollars: number | string) {
  const n = Number(dollars)
  line.amountCents = Number.isFinite(n) ? Math.round(n * 100) : 0
}

const wagesLines = computed(() => lines.value.filter(l => l.category === 'wages'))
const expensesLines = computed(() => lines.value.filter(l => l.category === 'expenses'))
const extrasLines = computed(() => lines.value.filter(l => l.category === 'extras'))

const totalCents = computed(() => lines.value.reduce((s, l) => s + (l.amountCents || 0), 0))
function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

async function save() {
  saving.value = true
  try {
    // Strip lines with empty labels — treat as user "deleting" them
    const cleaned = lines.value
      .filter(l => l.label.trim().length > 0)
      .map(l => ({
        id: l.id,
        label: l.label.trim(),
        category: l.category,
        amountCents: l.amountCents,
        notes: l.notes ?? null,
      }))

    await $fetch('/api/xero/get-out/config', {
      // Typed router doesn't include the new PUT route until the build
      // regenerates `.nuxt/types/typed-router.d.ts`; cast through `any`
      // to satisfy the union of typed methods at compile time.
      method: 'PUT' as any,
      body: { lines: cleaned },
    })
    toast.add({ title: 'Saved', description: 'Get Out target updated.', color: 'success' })
    emit('saved')
    emit('update:open', false)
  } catch (err: any) {
    toast.add({
      title: 'Save failed',
      description: err?.statusMessage || err?.message,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}

const modalOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})
</script>

<template>
  <UModal v-model:open="modalOpen" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-6 space-y-5">
        <header>
          <h2 class="text-lg font-semibold">Configure Get Out target</h2>
          <p class="text-sm text-muted mt-1">
            What you need to invoice each month to cover wages, operating expenses, and extras like loans + ATO.
          </p>
        </header>

        <!-- Wages -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Wages</h3>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" label="Add line" @click="addLine('wages')" />
          </div>
          <div v-for="line in wagesLines" :key="line.id" class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <UInput v-model="line.label" placeholder="Salaries / contractors / payroll tax" />
            <UInput
              :model-value="dollarsForLine(line)"
              type="number"
              min="0"
              step="100"
              class="w-32"
              :ui="{ trailing: 'pe-3' }"
              @update:model-value="(v: any) => setDollarsForLine(line, v)"
            />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="removeLine(line.id)" />
          </div>
          <p v-if="!wagesLines.length" class="text-xs text-muted italic">No wages lines.</p>
        </section>

        <!-- Expenses -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Operating expenses</h3>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" label="Add line" @click="addLine('expenses')" />
          </div>
          <div v-for="line in expensesLines" :key="line.id" class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <UInput v-model="line.label" placeholder="Rent / software / utilities" />
            <UInput
              :model-value="dollarsForLine(line)"
              type="number"
              min="0"
              step="100"
              class="w-32"
              @update:model-value="(v: any) => setDollarsForLine(line, v)"
            />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="removeLine(line.id)" />
          </div>
          <p v-if="!expensesLines.length" class="text-xs text-muted italic">No expense lines.</p>
        </section>

        <!-- Extras -->
        <section class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="text-xs uppercase text-muted font-semibold tracking-wider">Extras (loans, ATO, one-offs)</h3>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-plus" label="Add line" @click="addLine('extras')" />
          </div>
          <div v-for="line in extrasLines" :key="line.id" class="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
            <UInput v-model="line.label" placeholder="ATO repayment / loan repayment" />
            <UInput
              :model-value="dollarsForLine(line)"
              type="number"
              min="0"
              step="100"
              class="w-32"
              @update:model-value="(v: any) => setDollarsForLine(line, v)"
            />
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" @click="removeLine(line.id)" />
          </div>
          <p v-if="!extrasLines.length" class="text-xs text-muted italic">No extras lines.</p>
        </section>

        <!-- Total + actions -->
        <div class="pt-4 border-t border-default flex items-center justify-between">
          <div>
            <p class="text-xs text-muted">Monthly target</p>
            <p class="text-2xl font-bold">{{ fmt(totalCents) }}</p>
          </div>
          <div class="flex items-center gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" @click="modalOpen = false" />
            <UButton label="Save target" color="primary" :loading="saving" @click="save" />
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
