import { describe, expect, it } from 'vitest'
import {
  DESIGN_PROPOSAL_RECOVERY_MS,
  DESIGN_PROPOSAL_TTL_MS,
  EmailDesignActionError,
  assertDesignProposalAction,
  createDesignProposalTimes,
  designProposalStateAt,
  validateDesignAction,
  validateDesignActionFailure,
  validateDesignActionResult,
  validateDesignProposal,
  validateStoredDesignProposal,
  type DesignActionName
} from '../../shared/emailRendering/designActions'
import { structuredDesign } from '../fixtures/email-design/structured'

const operationId = '20000000-0000-4000-8000-000000000001'
const draftId = '20000000-0000-4000-8000-000000000002'
const revisionId = '20000000-0000-4000-8000-000000000003'
const nextRevisionId = '20000000-0000-4000-8000-000000000004'
const templateId = '20000000-0000-4000-8000-000000000005'
const moduleId = '20000000-0000-4000-8000-000000000006'
const proposalId = '20000000-0000-4000-8000-000000000007'
const actorId = '20000000-0000-4000-8000-000000000008'
const scope = { clientId: '10000000-0000-4000-8000-000000000001' }
const createdAt = '2026-10-31T00:00:00.000Z'

function campaignDesign() {
  return { ...structuredDesign(), kind: 'campaign-draft' as const }
}

function moduleDesign() {
  const design = structuredDesign()
  design.kind = 'module'
  delete design.blocks.root
  design.rootChildrenIds = ['heading', 'cta']
  return design
}

function action(name: DesignActionName): Record<string, unknown> {
  const base = { version: 1, operationId, action: name, scope }
  switch (name) {
    case 'save-draft':
      return {
        ...base,
        draftId,
        expectedRevisionId: revisionId,
        design: campaignDesign()
      }
    case 'create-template':
      return {
        ...base,
        name: 'Campaign template',
        design: structuredDesign(),
        sourceDraft: { draftId, revisionId },
        includedOverridePaths: []
      }
    case 'update-template':
      return {
        ...base,
        templateId,
        expectedRevisionId: revisionId,
        design: structuredDesign(),
        sourceDraft: { draftId, revisionId },
        includedOverridePaths: []
      }
    case 'create-module':
      return {
        ...base,
        name: 'Hero',
        category: 'Headers',
        design: moduleDesign(),
        sourceDraft: { draftId, revisionId },
        includedOverridePaths: []
      }
    case 'update-module':
      return {
        ...base,
        moduleId,
        expectedRevisionId: revisionId,
        design: moduleDesign(),
        sourceDraft: { draftId, revisionId },
        includedOverridePaths: []
      }
    case 'propose-return':
      return {
        ...base,
        draftId,
        baseRevisionId: revisionId,
        design: campaignDesign(),
        sourceDraft: { draftId: templateId, revisionId: nextRevisionId }
      }
    case 'apply-return':
      return {
        ...base,
        proposalId,
        expectedProposalRevisionId: revisionId,
        expectedDraftRevisionId: nextRevisionId
      }
    case 'cancel-return':
      return { ...base, proposalId, expectedProposalRevisionId: revisionId }
    case 'save-proposal-as-new-draft':
      return {
        ...base,
        proposalId,
        expectedProposalRevisionId: revisionId,
        name: 'Recovered campaign'
      }
  }
}

function proposal(): Record<string, unknown> {
  return {
    version: 1,
    proposalId,
    revisionId,
    scope,
    draftId,
    baseRevisionId: nextRevisionId,
    sourceDraft: { draftId: templateId, revisionId },
    design: campaignDesign(),
    state: 'proposed',
    createdAt,
    expiresAt: '2026-11-01T00:00:00.000Z',
    retainedUntil: '2026-12-01T00:00:00.000Z',
    stateChangedAt: createdAt
  }
}

function result(name: DesignActionName): Record<string, unknown> {
  const base = { version: 1, ok: true, operationId, action: name }
  switch (name) {
    case 'save-draft':
      return {
        ...base,
        draftId,
        revisionId: nextRevisionId,
        savedAt: createdAt,
        published: false
      }
    case 'create-template':
    case 'update-template':
      return {
        ...base,
        templateId,
        revisionId: nextRevisionId,
        publishedAt: createdAt
      }
    case 'create-module':
    case 'update-module':
      return {
        ...base,
        moduleId,
        revisionId: nextRevisionId,
        publishedAt: createdAt
      }
    case 'propose-return':
      return { ...base, proposal: proposal() }
    case 'apply-return':
      return {
        ...base,
        proposalId,
        proposalRevisionId: nextRevisionId,
        draftId,
        baseRevisionId: revisionId,
        revisionId: nextRevisionId,
        appliedAt: createdAt
      }
    case 'cancel-return':
      return {
        ...base,
        proposalId,
        proposalRevisionId: nextRevisionId,
        state: 'cancelled',
        cancelledAt: createdAt
      }
    case 'save-proposal-as-new-draft':
      return {
        ...base,
        proposalId,
        proposalRevisionId: revisionId,
        draftId,
        revisionId,
        createdAt
      }
  }
}

const actionNames: DesignActionName[] = [
  'save-draft',
  'create-template',
  'update-template',
  'create-module',
  'update-module',
  'propose-return',
  'apply-return',
  'cancel-return',
  'save-proposal-as-new-draft'
]

describe('FigFlow design action envelope', () => {
  it.each(actionNames)('validates the explicit %s input and output', (name) => {
    expect(validateDesignAction(action(name)).action).toBe(name)
    expect(validateDesignActionResult(result(name))).toMatchObject({
      action: name,
      operationId,
      ok: true
    })
  })

  it('keeps draft saves separate from publication', () => {
    const input = validateDesignAction(action('save-draft'))
    expect(input.action).toBe('save-draft')
    expect(validateDesignActionResult(result('save-draft'))).toMatchObject({
      published: false
    })
    expect(() =>
      validateDesignAction({ ...action('save-draft'), publish: true })
    ).toThrow(EmailDesignActionError)
  })

  it('allows a designer working draft without publishing its template source', () => {
    const input = {
      ...action('save-draft'),
      design: structuredDesign(),
      expectedRevisionId: null
    }
    expect(validateDesignAction(input)).toMatchObject({
      expectedRevisionId: null,
      design: { kind: 'template' }
    })
  })

  it.each(['actorId', 'userId', 'role', 'permissions', 'isPublisher'])(
    'rejects browser-supplied authority field %s',
    (field) => {
      expect(() =>
        validateDesignAction({ ...action('save-draft'), [field]: 'admin' })
      ).toThrow(EmailDesignActionError)
    }
  )

  it.each(['engine.execute', 'file.open', 'publish', 'save-as-new'])(
    'rejects general or ambiguous action %s',
    (name) => {
      expect(() =>
        validateDesignAction({ ...action('save-draft'), action: name })
      ).toThrow(EmailDesignActionError)
    }
  )

  it('rejects engine commands, paths and guessed native serialization', () => {
    expect(() =>
      validateDesignAction({
        ...action('save-draft'),
        command: 'export',
        path: '/tmp/document',
        nativeDocument: { format: 'figcraft' }
      })
    ).toThrow(EmailDesignActionError)
  })

  it.each(['not-a-uuid', '', 42])(
    'requires a UUID operation ID for idempotency: %j',
    (value) => {
      expect(() =>
        validateDesignAction({ ...action('save-draft'), operationId: value })
      ).toThrow(EmailDesignActionError)
    }
  )

  it.each(['update-template', 'update-module', 'save-draft'] as const)(
    'requires the expected library/draft CAS revision for %s',
    (name) => {
      const input = action(name)
      delete input.expectedRevisionId
      expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
    }
  )

  it('requires both proposal and current-draft CAS IDs when applying a return', () => {
    for (const field of [
      'expectedProposalRevisionId',
      'expectedDraftRevisionId'
    ]) {
      const input = action('apply-return')
      Reflect.deleteProperty(input, field)
      expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
    }
  })

  it.each(['cancel-return', 'save-proposal-as-new-draft'] as const)(
    'requires the proposal CAS ID for %s',
    (name) => {
      const input = action(name)
      delete input.expectedProposalRevisionId
      expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
    }
  )

  it('pins every return proposal to the original draft base revision', () => {
    const input = action('propose-return')
    delete input.baseRevisionId
    expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
  })

  it.each([
    ['create-template', 'module'],
    ['update-template', 'campaign-draft'],
    ['create-module', 'template'],
    ['update-module', 'campaign-draft'],
    ['propose-return', 'template']
  ] as const)('rejects a mismatched design kind for %s', (name, kind) => {
    const input = action(name)
    input.design
      = kind === 'module' ? moduleDesign() : { ...structuredDesign(), kind }
    expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
  })

  it('requires the target scope declaration to match the canonical design', () => {
    expect(() =>
      validateDesignAction({
        ...action('save-draft'),
        scope: { clientId: null }
      })
    ).toThrow(EmailDesignActionError)
  })

  it('requires explicit override selection for library writes', () => {
    const input = action('update-module')
    delete input.includedOverridePaths
    expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
  })

  it('bounds override selection and rejects duplicate paths', () => {
    expect(() =>
      validateDesignAction({
        ...action('update-template'),
        includedOverridePaths: [
          'heading.data.props.text',
          'heading.data.props.text'
        ]
      })
    ).toThrow(EmailDesignActionError)
  })

  it('rejects cycles and non-JSON values before schema traversal', () => {
    const input = action('save-draft')
    input.self = input
    expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
  })

  it('returns content-free contract error codes', () => {
    try {
      validateDesignAction({ action: 'secret-design-content' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(EmailDesignActionError)
      expect((error as EmailDesignActionError).code).toBe('INVALID_ACTION')
      expect((error as Error).message).toBe('INVALID_ACTION')
    }
  })
})

describe('durable return proposal contract', () => {
  it('binds a stored proposal to server-derived actor, scope, draft and base revision', () => {
    const stored = validateStoredDesignProposal({ ...proposal(), actorId })
    expect(stored).toMatchObject({
      actorId,
      scope,
      draftId,
      baseRevisionId: nextRevisionId
    })
    expect(() => validateDesignProposal({ ...proposal(), actorId })).toThrow(
      EmailDesignActionError
    )
  })

  it.each(['proposed', 'applied', 'cancelled', 'expired'])(
    'supports durable state %s',
    (state) => {
      expect(validateDesignProposal({ ...proposal(), state }).state).toBe(
        state
      )
    }
  )

  it('rejects undefined states and browser-selected expiry', () => {
    expect(() =>
      validateDesignProposal({ ...proposal(), state: 'pending' })
    ).toThrow(EmailDesignActionError)
    const input = action('propose-return')
    input.expiresAt = createdAt
    expect(() => validateDesignAction(input)).toThrow(EmailDesignActionError)
  })

  it('uses a 24-hour proposal lifetime and 30-day recovery retention', () => {
    expect(createDesignProposalTimes(new Date(createdAt))).toEqual({
      createdAt,
      expiresAt: '2026-11-01T00:00:00.000Z',
      retainedUntil: '2026-12-01T00:00:00.000Z',
      stateChangedAt: createdAt
    })
    expect(DESIGN_PROPOSAL_TTL_MS).toBe(24 * 60 * 60 * 1000)
    expect(DESIGN_PROPOSAL_RECOVERY_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('derives expiry without mutating the durable record', () => {
    const current = validateDesignProposal(proposal())
    expect(
      designProposalStateAt(current, new Date('2026-10-31T23:59:59.999Z'))
    ).toBe('proposed')
    expect(
      designProposalStateAt(current, new Date('2026-11-01T00:00:00.000Z'))
    ).toBe('expired')
    expect(current.state).toBe('proposed')
    expect(
      designProposalStateAt(
        { ...current, state: 'applied' },
        new Date('2026-11-02T00:00:00.000Z')
      )
    ).toBe('applied')
  })

  it('allows apply and cancel only for a live proposed return', () => {
    const current = proposal()
    expect(() =>
      assertDesignProposalAction(current, 'apply-return', new Date(createdAt))
    ).not.toThrow()
    expect(() =>
      assertDesignProposalAction(current, 'cancel-return', new Date(createdAt))
    ).not.toThrow()
    expect(() =>
      assertDesignProposalAction(
        { ...current, state: 'applied' },
        'cancel-return',
        new Date(createdAt)
      )
    ).toThrow(EmailDesignActionError)
  })

  it('blocks applying an expired proposal but permits recovery as a new draft', () => {
    const expiredAt = new Date('2026-11-02T00:00:00.000Z')
    expect(() =>
      assertDesignProposalAction(proposal(), 'apply-return', expiredAt)
    ).toThrow(EmailDesignActionError)
    expect(() =>
      assertDesignProposalAction(
        proposal(),
        'save-proposal-as-new-draft',
        expiredAt
      )
    ).not.toThrow()
    expect(() =>
      assertDesignProposalAction(
        { ...proposal(), state: 'expired' },
        'save-proposal-as-new-draft',
        expiredAt
      )
    ).not.toThrow()
  })

  it('blocks recovery after retention and rejects applied/cancelled proposals as new sources', () => {
    expect(() =>
      assertDesignProposalAction(
        proposal(),
        'save-proposal-as-new-draft',
        new Date('2026-12-01T00:00:00.001Z')
      )
    ).toThrow(EmailDesignActionError)
    for (const state of ['applied', 'cancelled']) {
      expect(() =>
        assertDesignProposalAction(
          { ...proposal(), state },
          'save-proposal-as-new-draft',
          new Date(createdAt)
        )
      ).toThrow(EmailDesignActionError)
    }
  })

  it('validates content-free action failures', () => {
    expect(
      validateDesignActionFailure({
        version: 1,
        ok: false,
        operationId,
        action: 'apply-return',
        error: {
          code: 'REVISION_CONFLICT',
          retryable: false,
          currentRevisionId: nextRevisionId,
          proposalState: 'proposed'
        }
      })
    ).toMatchObject({
      error: { code: 'REVISION_CONFLICT', currentRevisionId: nextRevisionId }
    })
    expect(() =>
      validateDesignActionFailure({
        operationId,
        error: { code: 'REVISION_CONFLICT', detail: '<html>private</html>' }
      })
    ).toThrow(EmailDesignActionError)
  })
})
