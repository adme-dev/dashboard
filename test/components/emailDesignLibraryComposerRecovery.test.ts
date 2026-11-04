// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { ref } from 'vue'
import { useEdmBuilder } from '../../app/composables/useEdmBuilder'
import { structuredDesign } from '../fixtures/email-design/structured'

const source = readFileSync('app/components/email/builder/EdmFlyhubBuilder.client.vue', 'utf8')
const acceptance = source.slice(
  source.indexOf('function acceptLibraryAction()'),
  source.indexOf('async function executeLibraryAction(')
)
const js = ts.transpile(acceptance, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext })
function fixture() {
  const store = useEdmBuilder()
  store.resetDocument(structuredDesign().blocks)
  const revisionId = crypto.randomUUID()
  const changed = structuredDesign()
  changed.blocks.heading.data.props.text = 'Saved module update'
  const designFlow = {
    draft: ref({ state: 'structured', headRevisionId: revisionId, source: changed }),
    lastLibraryReceipt: ref({
      revisionId,
      published: false,
      subject: 'Restored subject',
      previewText: 'Restored preheader'
    }),
    error: ref('')
  }
  const designLocalConflict = ref(false),
    loadedDesignRevisionId = ref<string | null>(null),
    subject = ref('Original subject'),
    previewText = ref('Original preheader'),
    workspaceSavedSnapshot = ref('before')
  let metadata = 'before'
  const workspaceSnapshot = () => JSON.stringify({ blocks: store.document.value, metadata })
  const baseline = { blocks: JSON.parse(JSON.stringify(store.document.value)), snapshot: workspaceSnapshot() }
  const accept = new Function(
    'store',
    'designFlow',
    'designLocalConflict',
    'loadedDesignRevisionId',
    'subject',
    'previewText',
    'workspaceSavedSnapshot',
    'workspaceSnapshot',
    'customModules',
    'toast',
    'baseline',
    `let libraryBaseline = baseline; ${js}; return acceptLibraryAction;`
  )(
    store,
    designFlow,
    designLocalConflict,
    loadedDesignRevisionId,
    subject,
    previewText,
    workspaceSavedSnapshot,
    workspaceSnapshot,
    { load: async () => {} },
    { add: vi.fn() },
    baseline
  ) as () => void
  return {
    store,
    designFlow,
    designLocalConflict,
    loadedDesignRevisionId,
    subject,
    previewText,
    workspaceSavedSnapshot,
    accept,
    editMetadata: () => {
      metadata = 'intervening metadata edit'
    }
  }
}
describe('composer applies canonical receipts against retained local baseline', () => {
  it('blocks Save during library writes without blocking the existing nested FigFlow save', async () => {
    const save = source.slice(source.indexOf('async function save(): Promise<boolean>'), source.indexOf('// FigFlow edits'))
    const saveCampaignContent = vi.fn(async () => {})
    const workspaceSavedSnapshot = ref('before save'), loadedDesignRevisionId = ref<string | null>(null)
    const args = {
      designFlow: { busy: ref(true), hasPending: ref(false), draft: ref({ headRevisionId: 'campaign-head-after-save' }) },
      workspaceSavedSnapshot, loadedDesignRevisionId,
      conditionSaving: ref(false), conditionPending: ref(null), templateLoading: ref(false), templateLoadError: ref(''),
      brandFlow: { busy: ref(false), hasPending: ref(false) }, designRevisionRequired: ref(false),
      saving: ref(false), workspaceSnapshot: () => 'saved', campaignId: ref('existing-owner'), saveCampaignContent,
      toast: { add: vi.fn() }, showSaveModal: ref(false)
    }
    const makeSave = (libraryBaseline: unknown) => new Function(...Object.keys(args), 'libraryBaseline',
      `${ts.transpile(save, { target: ts.ScriptTarget.ES2022 })}; return save;`
    )(...Object.values(args), libraryBaseline) as () => Promise<boolean>
    expect(await makeSave(null)()).toBe(true)
    expect(saveCampaignContent).toHaveBeenCalledTimes(1)
    expect(workspaceSavedSnapshot.value).toBe('saved')
    expect(loadedDesignRevisionId.value).toBe('campaign-head-after-save')
    workspaceSavedSnapshot.value = 'before blocked save'
    expect(await makeSave({ snapshot: 'pending library action' })()).toBe(false)
    expect(saveCampaignContent).toHaveBeenCalledTimes(1)
    expect(workspaceSavedSnapshot.value).toBe('before blocked save')
  })
  it('applies an exact confirmed structural action as one undoable update', () => {
    const h = fixture()
    h.accept()
    expect(h.store.document.value.heading.data.props.text).toBe('Saved module update')
    expect(h.subject.value).toBe('Restored subject')
    expect(h.previewText.value).toBe('Restored preheader')
    expect(h.designLocalConflict.value).toBe(false)
    h.store.undo()
    expect(h.store.document.value.heading.data.props.text).toBe('Hello {{first_name}}')
  })
  it.each(['content', 'metadata', 'head'] as const)(
    'retains intervening %s edits through lost-reply reconciliation',
    (kind) => {
      const h = fixture()
      if (kind === 'content') h.store.updateBlockProps('heading', { text: 'New local content' })
      if (kind === 'metadata') h.editMetadata()
      if (kind === 'head') h.designFlow.draft.value.headRevisionId = crypto.randomUUID()
      const before = JSON.stringify(h.store.document.value)
      h.accept()
      expect(JSON.stringify(h.store.document.value)).toBe(before)
      expect(h.designLocalConflict.value).toBe(true)
      expect(h.subject.value).toBe('Original subject')
      expect(h.designFlow.error.value).toContain('newer local edits are kept')
    }
  )
})
