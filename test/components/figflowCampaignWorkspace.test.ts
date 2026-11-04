// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/no-explicit-any -- Execute the actual composer entry functions with bounded synthetic I/O. */
import { sameDesignSource } from '../../app/utils/edmDesignEquality'
import fs from 'node:fs'
import ts from 'typescript'
import { computed, ref } from 'vue'
import { expect, it, vi } from 'vitest'
import { structuredDesign } from '../fixtures/email-design/structured'
import { validateEmailDesign } from '../../shared/emailRendering/designContract'

const source = fs.readFileSync('app/components/email/builder/EdmFlyhubBuilder.client.vue', 'utf8')
const ast = ts.createSourceFile('builder.ts', source.match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1], ts.ScriptTarget.Latest, true)
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['beginCampaignFigflow', 'applyFigflow', 'sameDesignSource'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n')
function harness() {
  const original = validateEmailDesign({ ...structuredDesign(), kind: 'campaign-draft' })
  const proposal = validateEmailDesign(original)
  proposal.blocks.heading.data.props!.text = 'Native campaign heading'
  const originalBlocks = structuredClone(original.blocks)
  const document = ref<any>(structuredClone(original.blocks))
  const subject = ref('Original subject')
  const undo: unknown[] = []
  const store = { document, applyDesignReturn: vi.fn((before: unknown, after: unknown) => {
    if (JSON.stringify(document.value) !== JSON.stringify(before)) return false
    undo.push(JSON.parse(JSON.stringify(document.value)))
    document.value = JSON.parse(JSON.stringify(after))
    return true
  }) }
  const owner = { kind: 'campaign' as const, id: 'campaign-a' }
  const draft = ref<any>({ owner, state: 'structured', source: original, documentId: 'document-a', headRevisionId: 'head-a', projectionRevisionId: 'head-a', projection: { state: 'current' } })
  const handoff = ref<any>(null)
  const order: string[] = []
  const flow = {
    draft, handoff, mode: ref('designer'), campaignAuthoring: ref({ available: true }), hasPending: ref(false), busy: ref(false), localBaseline: ref<string | null>(null),
    setLocalBaseline: (value: string) => {
      flow.localBaseline.value = value
    },
    run: async (callback: () => Promise<unknown>) => {
      flow.busy.value = true
      try {
        return await callback()
      } finally {
        flow.busy.value = false
      }
    },
    open: vi.fn(async (_owner: unknown, _client: unknown, _designer: unknown, saved: any) => {
      order.push('open')
      handoff.value = { id: 'handoff-a', owner, source: original, proposal, baseRevisionId: saved?.expectedRevisionId ?? 'converted', proposalRevisionId: 'proposal-a', state: 'open' }
      return handoff.value
    }),
    finish: vi.fn(async () => {
      order.push('apply')
      draft.value = { ...draft.value, source: proposal, headRevisionId: 'applied-a' }
      return { appliedRevisionId: 'applied-a' }
    })
  }
  const snapshot = () => JSON.stringify({ document: document.value, subject: subject.value })
  const saved = ref(snapshot())
  const state = {
    sameDesignSource,
    campaignId: ref('campaign-a'), campaignClientId: ref('client-a'), campaignStatus: ref('draft'), designFlow: flow,
    workspaceBusy: computed(() => flow.busy.value || flow.hasPending.value), templateLoading: ref(false), templateLoadError: ref(''),
    workspaceSnapshot: snapshot, workspaceSavedSnapshot: saved, store, subject,
    save: vi.fn(async () => {
      order.push('save')
      draft.value = { ...draft.value, headRevisionId: 'staff-saved', projectionRevisionId: 'staff-saved' }
      saved.value = snapshot()
      return true
    }),
    designRevisionRequired: ref(false), loadedDesignRevisionId: ref<string | null>(null), designLocalConflict: ref(false), showFigflow: ref(false),
    route: { query: { campaign: 'campaign-a', workspace: 'figflow' } }, router: { replace: vi.fn(async () => {}) },
    reconcileDesignAction: vi.fn(), nativeLibrary: { state: ref(null) }, nativeLibraryWorkspace: null,
    markWorkspaceDocumentSaved: vi.fn(() => {
      saved.value = snapshot()
    }), toast: { add: vi.fn() }
  }
  const compiled = ts.transpile(functions + '\nreturn { beginCampaignFigflow, applyFigflow }', { target: ts.ScriptTarget.ES2022 })
  return { ...state, ...new Function(...Object.keys(state), compiled)(...Object.values(state)), order, undo, originalBlocks, proposal }
}
it('saves dirty campaign metadata before opening the exact resulting campaign head and retains the route identity', async () => {
  const s = harness()
  s.subject.value = 'Pending subject'
  await s.beginCampaignFigflow()
  expect(s.order).toEqual(['save', 'open'])
  expect(s.designFlow.open).toHaveBeenCalledWith({ kind: 'campaign', id: 'campaign-a' }, 'client-a', true, { draftId: 'document-a', expectedRevisionId: 'staff-saved' })
  expect(s.router.replace).toHaveBeenCalledWith({ query: { campaign: 'campaign-a', workspace: 'figflow', designSession: 'handoff-a', designMode: 'designer' } })
})
it('opens a clean campaign without a content save and refuses untrusted or frozen entry', async () => {
  const s = harness()
  await s.beginCampaignFigflow()
  expect(s.save).not.toHaveBeenCalled()
  expect(s.designFlow.open).toHaveBeenCalledTimes(1)
  const denied = harness()
  denied.designFlow.campaignAuthoring.value.available = false
  await denied.beginCampaignFigflow()
  expect(denied.designFlow.open).not.toHaveBeenCalled()
  const frozen = harness()
  frozen.campaignStatus.value = 'scheduled'
  await frozen.beginCampaignFigflow()
  expect(frozen.designFlow.open).not.toHaveBeenCalled()
})
it('refuses to open after a save failed or the composer changed during its await', async () => {
  const s = harness()
  s.subject.value = 'Unsaved'
  s.save.mockResolvedValueOnce(false)
  await s.beginCampaignFigflow()
  expect(s.designFlow.open).not.toHaveBeenCalled()
  const changed = harness()
  changed.subject.value = 'Unsaved'
  changed.save.mockImplementationOnce(async () => {
    changed.subject.value = 'Newer local'
    return true
  })
  await changed.beginCampaignFigflow()
  expect(changed.designFlow.open).not.toHaveBeenCalled()
  expect(changed.subject.value).toBe('Newer local')
})
it('Apply creates exactly one composer undo action and refuses metadata drift before remote mutation', async () => {
  const s = harness()
  await s.beginCampaignFigflow()
  s.designFlow.handoff.value.state = 'proposed'
  await s.applyFigflow()
  expect(s.undo).toHaveLength(1)
  expect(s.undo[0]).toEqual(s.originalBlocks)
  expect(s.store.document.value).toEqual(s.proposal.blocks)
  const dirty = harness()
  await dirty.beginCampaignFigflow()
  dirty.designFlow.handoff.value.state = 'proposed'
  dirty.subject.value = 'Newer metadata'
  await dirty.applyFigflow()
  expect(dirty.designFlow.finish).not.toHaveBeenCalled()
  expect(dirty.undo).toHaveLength(0)
  expect(dirty.designLocalConflict.value).toBe(true)
})
it('Apply preserves local edits made during the remote await without touching undo history', async () => {
  const s = harness()
  await s.beginCampaignFigflow()
  s.designFlow.handoff.value.state = 'proposed'
  s.designFlow.finish.mockImplementationOnce(async () => {
    s.subject.value = 'Changed during Apply'
    s.designFlow.draft.value.headRevisionId = 'applied-a'
    return { appliedRevisionId: 'applied-a' }
  })
  await s.applyFigflow()
  expect(s.undo).toHaveLength(0)
  expect(s.store.document.value).toEqual(s.originalBlocks)
  expect(s.designLocalConflict.value).toBe(true)
})
