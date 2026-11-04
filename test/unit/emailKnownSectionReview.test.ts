/* eslint-disable @typescript-eslint/no-explicit-any -- Executes the isolated builder review wiring. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { recogniseKnownSection } from '~~/shared/emailRendering/designKnownSections'
import { designStructureLocked } from '~~/shared/emailRendering/designBrand'
import { oemSplit } from '~~/app/utils/edmOemLayouts'

const source = readFileSync(new URL('../../app/components/email/builder/EdmFlyhubBuilder.client.vue', import.meta.url), 'utf8')
const wiring = source.slice(source.indexOf('// Generated sections'), source.indexOf('function sameDesignSource'))
const operationId = '50000000-0000-4000-8000-000000000001'

function blocks() {
  const edited = oemSplit({ title: 'Edited', copy: 'Copy', action: 'Go', path: 'go', image: 'https://app.xeroflow.io/a.jpeg', alt: 'A' })
  edited.data.props!.contents = String(edited.data.props!.contents).replace('font-size:16px', 'font-size:17px')
  return {
    root: { type: 'EmailLayout', data: { childrenIds: ['promo', 'edited'] } },
    promo: oemSplit({ title: 'Promo', copy: 'Copy', action: 'Go', path: 'go', image: 'https://app.xeroflow.io/a.jpeg', alt: 'A' }),
    edited
  }
}

type Drift = (h: { route: { query: Record<string, string> }, templateId: { value: string }, campaignId: { value: string }, templateClient: { value: string }, setSnapshot: (value: string) => void, unmount: () => void, replaceDraft: (patch: Record<string, unknown>) => void }) => void
function setup(options: { saved?: boolean, saveResult?: boolean, campaign?: string, available?: boolean, changeDuringOpen?: boolean, staleAfterSave?: boolean, duringSave?: Drift, duringOpen?: Drift, duringPropose?: Drift, locks?: { blockIds: string[], styleFields: string[] } } = {}) {
  let snapshot = 'local-1'
  // The real component calls endKnownSectionLifetime from its existing unmount hook.
  let endLifetime = () => {}
  const draft = ref<any>({ state: 'structured', templateId: 'template', documentId: 'document', headRevisionId: 'head', projectionRevisionId: 'head', projection: { state: 'current' }, source: { scope: { clientId: 'client' }, blocks: blocks(), policy: { version: 1, editableFields: [], ...(options.locks ? { designerLocks: options.locks } : {}) } } })
  const canonicalSaved = ref(options.saved ?? true)
  const calls: string[] = []
  const designFlow = {
    draft, designerAuthoring: ref({ available: options.available ?? true }), mode: ref('designer'), designerOperationId: ref(operationId), error: ref(''),
    // Mirrors useEdmDesignRoundtrip.run: unrecognised failures get the generic retry text.
    run: vi.fn(async (fn: () => Promise<void>) => {
      try {
        return await fn()
      } catch (failure) {
        designFlow.error.value = 'The action could not be confirmed. Retry the same action to reconcile it; your current composer content is kept.'
        throw failure
      }
    }),
    open: vi.fn(async () => {
      calls.push('open')
      if (options.changeDuringOpen) snapshot = 'local-2'
      options.duringOpen?.(drift)
      return { id: 'handoff' }
    }),
    proposeDesigner: vi.fn(async () => {
      calls.push('propose')
      options.duringPropose?.(drift)
    }),
    setLocalBaseline: vi.fn()
  }
  const save = vi.fn(async () => {
    calls.push('save')
    options.duringSave?.(drift)
    if (options.saveResult === false) return false
    canonicalSaved.value = true
    // A structured save appends a revision: the same draft's head advances (live ref replaced).
    if (draft.value.documentId === 'document') draft.value = { ...draft.value, headRevisionId: 'head-2', projectionRevisionId: 'head-2' }
    if (options.staleAfterSave) draft.value = { ...draft.value, projectionRevisionId: 'older' }
    return true
  })
  const route = { query: { id: 'template' } as Record<string, string> }
  const args = {
    computed, recogniseKnownSection, designStructureLocked, designFlow, campaignId: ref(options.campaign ?? ''), workspaceBusy: ref(false), templateId: ref('template'),
    canonicalSaved, save, templateClient: ref('client'), workspaceSnapshot: () => snapshot, designRevisionRequired: ref(false), designLocalConflict: ref(false),
    showFigflow: ref(false), router: { replace: vi.fn(async () => {}) }, route
  }
  const drift = { route, templateId: args.templateId, campaignId: args.campaignId, templateClient: args.templateClient, setSnapshot: (value: string) => {
    snapshot = value
  }, unmount: () => endLifetime(), replaceDraft: (patch: Record<string, unknown>) => {
    draft.value = { ...draft.value, ...patch }
  } }
  const js = ts.transpile(`${wiring}\nreturn { knownSections, reviewKnownSections, endKnownSectionLifetime }`, { target: ts.ScriptTarget.ES2022 })
  const result = new Function(...Object.keys(args), js)(...Object.values(args))
  endLifetime = result.endKnownSectionLifetime
  return { ...result, ...args, calls }
}

describe('known-section review wiring in the builder', () => {
  it('offers only unmodified generated sections, and never on campaigns or without designer authority', () => {
    expect(setup().knownSections.value).toEqual(['promo'])
    expect(setup({ campaign: 'campaign' }).knownSections.value).toEqual([])
    expect(setup({ available: false }).knownSections.value).toEqual([])
  })

  it('does not offer sections the server would refuse under an explicit or inherited lock (hint only)', () => {
    expect(setup({ locks: { blockIds: [], styleFields: ['root.data.props.fontFamily'] } }).knownSections.value).toEqual([])
    expect(setup({ locks: { blockIds: ['promo'], styleFields: [] } }).knownSections.value).toEqual([])
    expect(setup({ locks: { blockIds: ['edited'], styleFields: [] } }).knownSections.value).toEqual(['promo'])
  })

  it('opens the designer on the exact saved head and proposes the server-derived operation for review only', async () => {
    const h = setup()
    await h.reviewKnownSections()
    expect(h.calls).toEqual(['open', 'propose'])
    expect(h.designFlow.open).toHaveBeenCalledWith('template', 'client', true, { draftId: 'document', expectedRevisionId: 'head' })
    expect(h.designFlow.proposeDesigner).toHaveBeenCalledWith([{ op: 'adopt-known-section', blockId: 'promo' }], operationId)
    expect(h.designFlow.setLocalBaseline).toHaveBeenCalledWith('local-1')
    expect(h.showFigflow.value).toBe(true)
    expect(h.router.replace).toHaveBeenCalledWith({ query: { id: 'template', designSession: 'handoff', designMode: 'designer' } })
  })

  it('saves unsaved composer changes first and stops when that save does not succeed', async () => {
    const saved = setup({ saved: false })
    await saved.reviewKnownSections()
    expect(saved.calls).toEqual(['save', 'open', 'propose'])
    // The save's own same-owner head advance is the intended new base.
    expect(saved.designFlow.open).toHaveBeenCalledWith('template', 'client', true, { draftId: 'document', expectedRevisionId: 'head-2' })
    expect(saved.showFigflow.value).toBe(true)
    const failed = setup({ saved: false, saveResult: false })
    await failed.reviewKnownSections()
    expect(failed.calls).toEqual(['save'])
    expect(failed.showFigflow.value).toBe(false)
  })

  it('refuses to continue when the saved projection is stale or the local workspace changes during open', async () => {
    const stale = setup({ saved: false, staleAfterSave: true })
    await stale.reviewKnownSections()
    expect(stale.calls).toEqual(['save'])
    const changed = setup({ changeDuringOpen: true })
    await changed.reviewKnownSections()
    expect(changed.calls).toEqual(['open'])
    expect(changed.designFlow.setLocalBaseline).not.toHaveBeenCalled()
    expect(changed.showFigflow.value).toBe(false)
  })

  const drifts: Array<[string, Drift]> = [
    ['navigation to another template', (h) => {
      h.route.query = { id: 'other-template', workspace: 'figflow' }
    }],
    ['owner change without a route write', (h) => {
      h.templateId.value = 'other-template'
    }],
    ['client scope change', (h) => {
      h.templateClient.value = 'other-client'
    }],
    ['complete local-baseline drift (metadata or content)', (h) => {
      h.setSnapshot('local-2')
    }],
    ['component unmounted (route/lifetime ended)', (h) => {
      h.unmount()
    }],
    ['navigation plus local drift', (h) => {
      h.route.query = { id: 'other-template', workspace: 'figflow' }
      h.setSnapshot('local-2')
    }]
  ]
  it.each(drifts)('stops after a deferred open on %s: no proposal, baseline, presentation or route write', async (_label, change) => {
    const h = setup({ duringOpen: change })
    await h.reviewKnownSections()
    expect(h.calls).toEqual(['open'])
    expect(h.designFlow.proposeDesigner).not.toHaveBeenCalled()
    expect(h.designFlow.setLocalBaseline).not.toHaveBeenCalled()
    expect(h.showFigflow.value).toBe(false)
    expect(h.router.replace).not.toHaveBeenCalled()
  })
  it.each(drifts)('stops after a deferred propose on %s: proposal kept unapplied, nothing presented or routed', async (_label, change) => {
    const h = setup({ duringPropose: change })
    await h.reviewKnownSections()
    expect(h.calls).toEqual(['open', 'propose'])
    expect(h.designFlow.setLocalBaseline).not.toHaveBeenCalled()
    expect(h.showFigflow.value).toBe(false)
    expect(h.router.replace).not.toHaveBeenCalled()
    // No retry under a new owner or operation; the proposal is not applied.
    expect(h.designFlow.proposeDesigner).toHaveBeenCalledTimes(1)
    expect(h.designFlow.open).toHaveBeenCalledTimes(1)
  })
  const saveDrifts: Array<[string, Drift]> = [
    ['unmount', (h) => {
      h.unmount()
    }],
    ['owner change', (h) => {
      h.templateId.value = 'other-template'
    }],
    ['client change', (h) => {
      h.templateClient.value = 'other-client'
    }],
    ['navigation', (h) => {
      h.route.query = { id: 'other-template', workspace: 'figflow' }
    }],
    ['local drift (new edits while saving)', (h) => {
      h.setSnapshot('local-2')
    }],
    ['live draft replaced by another document', (h) => {
      h.replaceDraft({ documentId: 'other-document', headRevisionId: 'other-head', projectionRevisionId: 'other-head' })
    }]
  ]
  it.each(saveDrifts)('stops after a deferred save-first on %s: the save stands, nothing else starts', async (_label, change) => {
    const h = setup({ saved: false, duringSave: change })
    await h.reviewKnownSections()
    expect(h.calls).toEqual(['save'])
    expect(h.canonicalSaved.value).toBe(true)
    expect(h.designFlow.open).not.toHaveBeenCalled()
    expect(h.designFlow.proposeDesigner).not.toHaveBeenCalled()
    expect(h.designFlow.setLocalBaseline).not.toHaveBeenCalled()
    expect(h.showFigflow.value).toBe(false)
    expect(h.router.replace).not.toHaveBeenCalled()
  })
  it.each([['open', 'duringOpen'], ['propose', 'duringPropose']] as const)('stops when the live draft ref is replaced during a deferred %s (document or head)', async (_phase, key) => {
    for (const patch of [{ documentId: 'other-document' }, { headRevisionId: 'newer-head', projectionRevisionId: 'newer-head' }]) {
      const h = setup({ [key]: (drift: Parameters<Drift>[0]) => drift.replaceDraft(patch) })
      await h.reviewKnownSections()
      expect(h.designFlow.setLocalBaseline, JSON.stringify(patch)).not.toHaveBeenCalled()
      expect(h.showFigflow.value).toBe(false)
      expect(h.router.replace).not.toHaveBeenCalled()
      expect(h.designFlow.open).toHaveBeenCalledTimes(1)
    }
  })
  it('tolerates an equivalent live draft re-read (same document and head) during open', async () => {
    const h = setup({ duringOpen: drift => drift.replaceDraft({}) })
    await h.reviewKnownSections()
    expect(h.calls).toEqual(['open', 'propose'])
    expect(h.showFigflow.value).toBe(true)
  })

  it('explains a drift stop honestly instead of the generic retry text', async () => {
    const h = setup({ duringPropose: drift => drift.setSnapshot('local-2') })
    await h.reviewKnownSections()
    expect(h.designFlow.error.value).toBe('The composer or open template changed while preparing the section update. The update was not applied; your edits are kept.')
    const opened = setup({ duringOpen: drift => drift.setSnapshot('local-2') })
    await opened.reviewKnownSections()
    expect(opened.designFlow.error.value).toBe('The composer or open template changed while preparing the section update. Nothing was saved; your edits are kept.')
    const gone = setup({ duringPropose: drift => drift.unmount() })
    await gone.reviewKnownSections()
    expect(gone.designFlow.error.value).not.toContain('section update')
  })

  it('ends the review lifetime from the existing unmount hook', () => {
    expect(source).toMatch(/onBeforeUnmount\(\(\) => \{\n {2}endKnownSectionLifetime\(\)\n {2}workspaceLeave\.stay\(\)\n\}\)/)
  })

  it('discloses save-before-review and Apply/Undo in the alert copy', () => {
    expect(source).toContain('Any unsaved composer changes are saved first; the section update itself is only saved when you apply it, and Undo reverts it.')
    // Bounded eligibility is disclosed: not every saved CTA converts.
    expect(source).toContain('Only unedited generated sections with plain text and links without “&amp;” (for example tracking parameters) qualify; others stay as HTML, unchanged.')
    expect(source).toMatch(/v-if="knownSections\.length && !showFigflow && !designFlow\.hasPending\.value"/)
  })
})
