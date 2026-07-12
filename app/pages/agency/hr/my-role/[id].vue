<script setup lang="ts">
definePageMeta({ title: 'My Role Baseline', middleware: ['auth'] })
type Assignment = {
  id: string
  member_name: string
  role_title: string
  role_version: number
  purpose: string
  responsibilities: string[]
  expected_outcomes: string[]
  acknowledgement_status: 'pending' | 'acknowledged' | 'disputed'
  acknowledgement_note: string | null
  scorecard_version: number
  criteria: Array<{
    id: string
    label: string
    description: string
    weight: number
    frameworkKey: string
    evidenceRequired: string[]
  }>
  evidence_threshold: number
}
const route = useRoute()
const toast = useToast()
const loading = ref(true)
const saving = ref(false)
const assignment = ref<Assignment | null>(null)
const note = ref('')
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown },
) => Promise<T>
async function load() {
  loading.value = true
  try {
    assignment.value = (
      await apiFetch<{ assignment: Assignment }>(
        `/api/agency/hr/role-assignments/${route.params.id}`,
      )
    ).assignment
  } catch (error: any) {
    toast.add({
      title: 'Role baseline unavailable',
      description: error?.data?.statusMessage,
      color: 'error',
    })
  } finally {
    loading.value = false
  }
}
onMounted(() => void load())
async function respond(status: 'acknowledged' | 'disputed') {
  if (status === 'disputed' && note.value.trim().length < 3) return
  saving.value = true
  try {
    await apiFetch(
      `/api/agency/hr/role-assignments/${route.params.id}/acknowledgement`,
      { method: 'PATCH', body: { status, note: note.value || undefined } },
    )
    toast.add({
      title:
        status === 'acknowledged'
          ? 'Role and scorecard acknowledged'
          : 'Correction requested',
      color: status === 'acknowledged' ? 'success' : 'warning',
    })
    await load()
  } catch (error: any) {
    toast.add({
      title: 'Response not saved',
      description: error?.data?.statusMessage,
      color: 'error',
    })
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <div class="min-h-full bg-default">
    <div v-if="loading" class="flex min-h-[70vh] items-center justify-center">
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-primary"
      />
    </div>
    <template v-else-if="assignment"
      ><header class="border-b border-default bg-elevated/30">
        <div class="mx-auto max-w-5xl px-5 py-8 sm:px-8">
          <p
            class="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary"
          >
            Pre-review baseline
          </p>
          <h1 class="mt-2 text-3xl font-semibold text-highlighted">
            {{ assignment.role_title }}
          </h1>
          <p class="mt-2 text-sm text-muted">
            Role v{{ assignment.role_version }} · scorecard v{{
              assignment.scorecard_version
            }}
          </p>
        </div>
      </header>
      <main class="mx-auto max-w-5xl space-y-6 px-5 py-8 sm:px-8">
        <UAlert
          color="info"
          variant="soft"
          icon="i-lucide-scale"
          title="Acknowledge role and scorecard"
          description="Acknowledgement confirms what you were shown, not that you agree with a performance result. No review can be commissioned until you acknowledge or the owner resolves your correction."
        />
        <section class="rounded-xl border border-default bg-default p-5">
          <h2 class="text-lg font-semibold text-highlighted">Role purpose</h2>
          <p class="mt-2 text-sm leading-6 text-muted">
            {{ assignment.purpose }}
          </p>
          <div class="mt-5 grid gap-5 md:grid-cols-2">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Responsibilities
              </h3>
              <ul class="mt-3 space-y-2 text-sm text-muted">
                <li v-for="item in assignment.responsibilities" :key="item">
                  • {{ item }}
                </li>
              </ul>
            </div>
            <div>
              <h3 class="text-sm font-semibold text-highlighted">
                Expected outcomes
              </h3>
              <ul class="mt-3 space-y-2 text-sm text-muted">
                <li v-for="item in assignment.expected_outcomes" :key="item">
                  • {{ item }}
                </li>
              </ul>
            </div>
          </div>
        </section>
        <section
          class="overflow-hidden rounded-xl border border-default bg-default"
        >
          <div class="border-b border-default p-5">
            <h2 class="text-lg font-semibold text-highlighted">
              Published scorecard
            </h2>
            <p class="mt-1 text-sm text-muted">
              Weights total 100% · {{ assignment.evidence_threshold }}% evidence
              required. Questionnaire answers never supply KPI results.
            </p>
          </div>
          <div class="grid gap-3 p-5 md:grid-cols-2">
            <article
              v-for="criterion in assignment.criteria"
              :key="criterion.id"
              class="rounded-lg border border-default bg-elevated/20 p-4"
            >
              <div class="flex justify-between gap-3">
                <h3 class="text-sm font-medium text-highlighted">
                  {{ criterion.label }}
                </h3>
                <UBadge
                  color="neutral"
                  variant="outline"
                  :label="`${criterion.weight}%`"
                />
              </div>
              <p class="mt-2 text-xs leading-5 text-muted">
                {{ criterion.description }}
              </p>
              <p class="mt-3 font-mono text-[11px] text-dimmed">
                {{ criterion.frameworkKey }}
              </p>
            </article>
          </div>
        </section>
        <section
          v-if="assignment.acknowledgement_status !== 'acknowledged'"
          class="rounded-xl border border-default bg-default p-5"
        >
          <UFormField label="Correction or missing context"
            ><UTextarea
              v-model="note"
              :rows="4"
              placeholder="Explain anything inaccurate, incomplete or outside the agreed role."
              class="w-full"
          /></UFormField>
          <div class="mt-4 flex justify-end gap-2">
            <UButton
              color="warning"
              variant="soft"
              label="Request correction"
              :loading="saving"
              @click="respond('disputed')"
            /><UButton
              icon="i-lucide-check"
              label="Acknowledge baseline"
              :loading="saving"
              @click="respond('acknowledged')"
            />
          </div>
        </section>
        <UAlert
          v-else
          color="success"
          variant="soft"
          icon="i-lucide-badge-check"
          title="Baseline acknowledged"
          description="Any later role or scorecard change creates a future version and cannot rewrite this acknowledgement."
        /></main
    ></template>
  </div>
</template>
