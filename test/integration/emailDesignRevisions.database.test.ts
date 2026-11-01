import { saveTemplateDraftMetadata } from '../../server/utils/email-marketing/designMetadata'
import { initializeTemplateDesignDraft } from '../../server/utils/email-marketing/designInitialization'
import fs from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  appendDesignRevision,
  appendStaffDesignRevision,
  saveTemplateDesignDraft,
  saveStaffTemplateDesignDraft,
  ensureLegacyDesignDocument,
  type DesignTransaction
} from '../../server/utils/email-marketing/designRevisions'
import { structuredDesign } from '../fixtures/email-design/structured'
import { resolveStoredDesignDependencies } from '../../server/utils/email-marketing/designDependencies'
import { testEmailRenderer } from '../fixtures/emailRenderer'
import { getTemplateDesignDraft } from '../../server/utils/email-marketing/designReads'

const socket = process.env.FIGFLOW_DESIGN_PG_SOCKET
const databaseTest = socket ? it : it.skip
const scope = '10000000-0000-4000-8000-000000000001'
let documentId: string
let actorId: string
let templateId: string
let baselineRevisionId: string
const schema = `figflow_revision_test_${Date.now()}`
let admin: pg.Client
const config = () => ({
  host: socket,
  port: 55483,
  user: 'figflow_test',
  database: 'figflow_design_test'
})
const transaction: DesignTransaction = async (callback) => {
  const client = new pg.Client(config())
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SET LOCAL search_path TO ${schema}, public`)
    const value = await callback(client)
    await client.query('COMMIT')
    return value
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    await client.end()
  }
}
const save = (
  operationId: string,
  expectedRevisionId: string | null,
  text = 'Original'
) =>
  appendDesignRevision(
    {
      documentId,
      actorId,
      operationId,
      expectedRevisionId,
      design: {
        ...structuredDesign(),
        blocks: {
          ...structuredDesign().blocks,
          heading: { type: 'Heading', data: { props: { text } } }
        }
      }
    },
    async (clientId) => {
      if (clientId !== scope) throw new Error('scope denied')
    },
    transaction
  )

describe('immutable email design revisions in PostgreSQL', () => {
  databaseTest(
    'rejects conversion when legacy content changed after its baseline snapshot',
    async () => {
      await admin.query(
        'UPDATE edm_templates SET body_html=\'Newer legacy editor content\' WHERE id=$1',
        [templateId]
      )
      expect(
        await getTemplateDesignDraft(documentId, async () => {}, admin)
      ).toMatchObject({ state: 'legacy', ownerChangedSinceSnapshot: true })
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await expect(
        saveTemplateDesignDraft(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
      await expect(
        appendDesignRevision(input, async () => {}, transaction)
      ).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
      expect(
        (
          await admin.query('SELECT body_html FROM edm_templates WHERE id=$1', [
            templateId
          ])
        ).rows[0].body_html
      ).toBe('Newer legacy editor content')
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
    }
  )
  databaseTest(
    'opens legacy and canonical heads without inventing readiness or changing content',
    async () => {
      const legacy = await getTemplateDesignDraft(
        documentId,
        async () => {},
        admin
      )
      expect(legacy).toMatchObject({
        state: 'legacy',
        headRevisionId: baselineRevisionId,
        projection: { state: 'unverified' }
      })
      expect(typeof legacy.source).toBe('string')
      const first = await save(crypto.randomUUID(), baselineRevisionId)
      expect(
        await getTemplateDesignDraft(documentId, async () => {}, admin)
      ).toMatchObject({
        state: 'structured',
        headRevisionId: first.revisionId,
        projection: { state: 'unprojected' }
      })
      const projected = await saveTemplateDesignDraft(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: first.revisionId,
          design: structuredDesign()
        },
        async () => {},
        testEmailRenderer,
        transaction
      )
      expect(
        await getTemplateDesignDraft(documentId, async () => {}, admin)
      ).toMatchObject({
        headRevisionId: projected.revisionId,
        projectionRevisionId: projected.revisionId,
        projection: { state: 'current' }
      })
      const latest = await save(
        crypto.randomUUID(),
        projected.revisionId,
        'Unprojected later edit'
      )
      expect(
        await getTemplateDesignDraft(documentId, async () => {}, admin)
      ).toMatchObject({
        headRevisionId: latest.revisionId,
        projectionRevisionId: projected.revisionId,
        projection: { state: 'stale' }
      })
    }
  )
  databaseTest(
    'read access is checked on every open and a missing head is never created by reading',
    async () => {
      await expect(
        getTemplateDesignDraft(
          documentId,
          async () => {
            throw new Error('revoked read')
          },
          admin
        )
      ).rejects.toThrow('revoked read')
      const emptyTemplate = crypto.randomUUID()
      const emptyDocument = crypto.randomUUID()
      await admin.query(
        'INSERT INTO edm_templates(id,client_id) VALUES ($1,$2)',
        [emptyTemplate, scope]
      )
      await admin.query(
        'INSERT INTO email_design_documents(id,template_id,client_id) VALUES ($1,$2,$3)',
        [emptyDocument, emptyTemplate, scope]
      )
      await expect(
        getTemplateDesignDraft(emptyDocument, async () => {}, admin)
      ).rejects.toMatchObject({ code: 'HEAD_NOT_FOUND' })
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS n FROM email_design_revisions WHERE document_id=$1',
            [emptyDocument]
          )
        ).rows[0].n
      ).toBe(0)
    }
  )
  databaseTest(
    'legacy writes cannot overwrite a versioned draft projection',
    async () => {
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await saveTemplateDesignDraft(
        input,
        async () => {},
        testEmailRenderer,
        transaction
      )
      await expect(
        admin.query(
          'UPDATE edm_templates SET body_html=\'stale editor\' WHERE id=$1',
          [templateId]
        )
      ).rejects.toMatchObject({
        code: '55000',
        constraint: 'email_design_revision_required'
      })
      await expect(
        admin.query(
          'UPDATE edm_templates SET subject=\'stale subject\' WHERE id=$1',
          [templateId]
        )
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        admin.query(
          'UPDATE edm_templates SET template_kind=\'template\' WHERE id=$1',
          [templateId]
        )
      ).rejects.toMatchObject({ code: '55000' })
    }
  )
  databaseTest(
    'a stalled renderer times out and a late rejection is observed without reopening the transaction',
    async () => {
      let rejectLate: ((error: Error) => void) | undefined
      const renderer = {
        ...testEmailRenderer,
        renderDocument: () =>
          new Promise<string>((_resolve, reject) => {
            rejectLate = reject
          })
      }
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await expect(
        saveTemplateDesignDraft(input, async () => {}, renderer, transaction)
      ).rejects.toMatchObject({ code: 'RENDER_TIMEOUT' })
      const unhandled: unknown[] = []
      const observe = (error: unknown) => {
        unhandled.push(error)
      }
      process.on('unhandledRejection', observe)
      try {
        expect(rejectLate).toBeTypeOf('function')
        rejectLate?.(new Error('Renderer failed after timeout'))
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(unhandled).toEqual([])
      } finally {
        process.off('unhandledRejection', observe)
      }
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
      expect(
        (
          await saveTemplateDesignDraft(
            input,
            async () => {},
            testEmailRenderer,
            transaction
          )
        ).revisionId
      ).not.toBe(baselineRevisionId)
    },
    20_000
  )
  databaseTest(
    'revocation during rendering prevents saving draft content',
    async () => {
      let allowed = true
      const renderer = {
        ...testEmailRenderer,
        renderDocument: async (
          ...args: Parameters<typeof testEmailRenderer.renderDocument>
        ) => {
          const html = await testEmailRenderer.renderDocument(...args)
          allowed = false
          return html
        }
      }
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await expect(
        saveTemplateDesignDraft(
          input,
          async () => {
            if (!allowed) throw new Error('Access revoked during rendering')
          },
          renderer,
          transaction
        )
      ).rejects.toThrow('Access revoked during rendering')
      expect(
        (
          await admin.query(
            'SELECT body_source,body_html FROM edm_templates WHERE id=$1',
            [templateId]
          )
        ).rows[0]
      ).toEqual({ body_source: null, body_html: null })
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
    }
  )
  databaseTest(
    'receipt failure rolls back the already-updated draft HTML and source',
    async () => {
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await admin.query(
        'CREATE FUNCTION reject_draft_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'receipt rejected\'; END $$; CREATE TRIGGER reject_draft_receipt BEFORE INSERT ON email_design_revision_receipts FOR EACH ROW EXECUTE FUNCTION reject_draft_receipt()'
      )
      try {
        await expect(
          saveTemplateDesignDraft(
            input,
            async () => {},
            testEmailRenderer,
            transaction
          )
        ).rejects.toThrow('receipt rejected')
        expect(
          (
            await admin.query(
              'SELECT body_source,body_html FROM edm_templates WHERE id=$1',
              [templateId]
            )
          ).rows[0]
        ).toEqual({ body_source: null, body_html: null })
        expect(
          (
            await admin.query(
              'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
              [documentId]
            )
          ).rows[0].head_revision_id
        ).toBe(baselineRevisionId)
      } finally {
        await admin.query(
          'DROP TRIGGER reject_draft_receipt ON email_design_revision_receipts; DROP FUNCTION reject_draft_receipt()'
        )
      }
    }
  )
  databaseTest(
    'saves canonical revision and draft source/HTML atomically using the existing renderer',
    async () => {
      const design = structuredDesign()
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design
      }
      const first = await saveTemplateDesignDraft(
        input,
        async () => {},
        testEmailRenderer,
        transaction
      )
      const stored = (
        await admin.query(
          'SELECT body_source,body_html FROM edm_templates WHERE id=$1',
          [templateId]
        )
      ).rows[0]
      expect(stored.body_source).toEqual(design.blocks)
      expect(stored.body_html).toContain('View offer')
      expect(stored.body_html).toContain('https://example.com/offer')
      const changed = structuredDesign()
      changed.blocks.heading.data.props.text = 'Later staff copy'
      const latest = await saveStaffTemplateDesignDraft(
        {
          ...input,
          operationId: crypto.randomUUID(),
          expectedRevisionId: first.revisionId,
          design: changed
        },
        async () => {},
        testEmailRenderer,
        transaction
      )
      expect(
        await saveTemplateDesignDraft(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).toEqual(first)
      expect(
        (
          await admin.query('SELECT body_html FROM edm_templates WHERE id=$1', [
            templateId
          ])
        ).rows[0].body_html
      ).toContain('Later staff copy')
      expect(latest.revisionId).not.toBe(first.revisionId)
    }
  )
  databaseTest(
    'renderer or projection failure cannot leave a partial draft revision',
    async () => {
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      const unavailable = {
        ...testEmailRenderer,
        renderDocument: async () => {
          throw new Error('renderer unavailable')
        }
      }
      await expect(
        saveTemplateDesignDraft(
          input,
          async () => {},
          unavailable,
          transaction
        )
      ).rejects.toThrow('renderer unavailable')
      await admin.query(
        'CREATE FUNCTION reject_projection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'projection rejected\'; END $$; CREATE TRIGGER reject_projection BEFORE UPDATE OF body_source ON edm_templates FOR EACH ROW EXECUTE FUNCTION reject_projection()'
      )
      try {
        await expect(
          saveTemplateDesignDraft(
            input,
            async () => {},
            testEmailRenderer,
            transaction
          )
        ).rejects.toThrow('projection rejected')
        expect(
          (
            await admin.query(
              'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
              [documentId]
            )
          ).rows[0].head_revision_id
        ).toBe(baselineRevisionId)
        expect(
          (
            await admin.query(
              'SELECT count(*)::int AS n FROM email_design_revision_receipts WHERE operation_id=$1',
              [input.operationId]
            )
          ).rows[0].n
        ).toBe(0)
      } finally {
        await admin.query(
          'DROP TRIGGER reject_projection ON edm_templates; DROP FUNCTION reject_projection()'
        )
      }
      expect(
        (
          await saveTemplateDesignDraft(
            input,
            async () => {},
            testEmailRenderer,
            transaction
          )
        ).revisionId
      ).not.toBe(baselineRevisionId)
    }
  )
  databaseTest(
    'draft projection cannot publish a library template or reuse a source-only operation',
    async () => {
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: structuredDesign()
      }
      await admin.query(
        'UPDATE edm_templates SET template_kind=\'template\' WHERE id=$1',
        [templateId]
      )
      await expect(
        saveTemplateDesignDraft(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).rejects.toMatchObject({ code: 'TEMPLATE_DRAFT_REQUIRED' })
      await admin.query(
        'UPDATE edm_templates SET template_kind=\'draft\' WHERE id=$1',
        [templateId]
      )
      await appendDesignRevision(input, async () => {}, transaction)
      await expect(
        saveTemplateDesignDraft(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
    }
  )
  databaseTest(
    'staff rechecks the current policy after a designer removes an editable grant',
    async () => {
      const original = await save(crypto.randomUUID(), baselineRevisionId)
      const lockedDesign = structuredDesign()
      lockedDesign.policy.editableFields = [
        'cta.data.props.text',
        'cta.data.props.url'
      ]
      const locked = await appendDesignRevision(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: original.revisionId,
          design: lockedDesign
        },
        async () => {},
        transaction
      )
      lockedDesign.blocks.heading.data.props.text
        = 'Unauthorised changed heading'
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: original.revisionId,
        design: lockedDesign
      }
      await expect(
        appendStaffDesignRevision(input, async () => {}, transaction)
      ).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
      await expect(
        appendStaffDesignRevision(
          { ...input, expectedRevisionId: locked.revisionId },
          async () => {},
          transaction
        )
      ).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(locked.revisionId)
    }
  )
  databaseTest(
    'staff receipt reconciliation does not overwrite later edits or bypass revoked access',
    async () => {
      const original = await save(crypto.randomUUID(), baselineRevisionId)
      const design = structuredDesign()
      design.blocks.heading.data.props.text = 'First staff save'
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: original.revisionId,
        design
      }
      const first = await appendStaffDesignRevision(
        input,
        async () => {},
        transaction
      )
      const latest = await save(
        crypto.randomUUID(),
        first.revisionId,
        'Later saved content'
      )
      expect(
        await appendStaffDesignRevision(input, async () => {}, transaction)
      ).toEqual(first)
      await expect(
        appendStaffDesignRevision(
          input,
          async () => {
            throw new Error('Access revoked')
          },
          transaction
        )
      ).rejects.toThrow('Access revoked')
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(latest.revisionId)
    }
  )
  databaseTest(
    'staff saves allow granted copy edits and reject layout changes atomically',
    async () => {
      const current = await save(crypto.randomUUID(), baselineRevisionId)
      const design = structuredDesign()
      design.blocks.heading.data.props.text = 'Staff copy'
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: current.revisionId,
        design
      }
      const saved = await appendStaffDesignRevision(
        input,
        async () => {},
        transaction
      )
      expect(
        await appendStaffDesignRevision(input, async () => {}, transaction)
      ).toEqual(saved)
      design.blocks.root.data.childrenIds.reverse()
      await expect(
        appendStaffDesignRevision(
          {
            ...input,
            operationId: crypto.randomUUID(),
            expectedRevisionId: saved.revisionId
          },
          async () => {},
          transaction
        )
      ).rejects.toMatchObject({ code: 'EDIT_FORBIDDEN' })
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(saved.revisionId)
    }
  )
  databaseTest(
    'staff cannot promote legacy content or forge a saved edit policy',
    async () => {
      const design = structuredDesign()
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design
      }
      await expect(
        appendStaffDesignRevision(input, async () => {}, transaction)
      ).rejects.toMatchObject({ code: 'STRUCTURED_REVISION_REQUIRED' })
      const current = await save(crypto.randomUUID(), baselineRevisionId)
      design.policy.editableFields = []
      await expect(
        appendStaffDesignRevision(
          { ...input, expectedRevisionId: current.revisionId },
          async () => {},
          transaction
        )
      ).rejects.toMatchObject({ code: 'POLICY_CHANGE_FORBIDDEN' })
    }
  )
  databaseTest(
    'dependency-bearing saves require fresh module authority before persisting',
    async () => {
      const { root } = await moduleHistory()
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        design: root
      }
      await expect(
        appendDesignRevision(input, async () => {}, transaction)
      ).rejects.toMatchObject({ code: 'DEPENDENCY_AUTHORITY_REQUIRED' })
      const denied = {
        authorizeModuleRead: async () => {
          throw new Error('Module access denied')
        }
      }
      await expect(
        appendDesignRevision(input, async () => {}, transaction, denied)
      ).rejects.toThrow('Module access denied')
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
      const saved = await appendDesignRevision(
        input,
        async () => {},
        transaction,
        { authorizeModuleRead: async () => {} }
      )
      await expect(
        appendDesignRevision(input, async () => {}, transaction, denied)
      ).rejects.toThrow('Module access denied')
      expect(saved.revisionId).not.toBe(baselineRevisionId)
    }
  )
  async function moduleHistory() {
    const moduleId = crypto.randomUUID()
    await admin.query(
      'INSERT INTO edm_custom_modules(id,client_id) VALUES ($1,$2)',
      [moduleId, scope]
    )
    const baseline = await ensureLegacyDesignDocument(
      { kind: 'module', ownerId: moduleId, actorId },
      async () => {},
      transaction
    )
    const design = structuredDesign()
    design.kind = 'module'
    delete design.blocks.root
    design.rootChildrenIds = ['heading', 'cta']
    const original = await appendDesignRevision(
      {
        documentId: baseline.documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baseline.revisionId,
        design
      },
      async () => {},
      transaction
    )
    design.blocks.heading.data.props.text = 'New library head'
    await appendDesignRevision(
      {
        documentId: baseline.documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: original.revisionId,
        design
      },
      async () => {},
      transaction
    )
    const root = structuredDesign()
    const pin = { moduleId, revisionId: original.revisionId }
    root.dependencies = [pin]
    root.moduleInstances = [
      {
        ...pin,
        instanceId: 'hero',
        rootBlockIds: ['heading', 'cta'],
        overrides: {}
      }
    ]
    return { root, moduleId, baseline, original }
  }

  databaseTest(
    'resolves an authorised stored module pin without substituting its newer head',
    async () => {
      const { root, moduleId, original } = await moduleHistory()
      const checks: unknown[] = []
      const revisions = await transaction(db =>
        resolveStoredDesignDependencies(root, db, async (id, clientId) => {
          checks.push([id, clientId])
        })
      )
      expect(checks).toEqual([[moduleId, scope]])
      expect(revisions[0].revisionId).toBe(original.revisionId)
      expect(revisions[0].design.blocks.heading.data.props.text).not.toBe(
        'New library head'
      )
    }
  )
  databaseTest('rechecks module read access for every resolution', async () => {
    const { root } = await moduleHistory()
    await transaction(db =>
      resolveStoredDesignDependencies(root, db, async () => {})
    )
    await expect(
      transaction(db =>
        resolveStoredDesignDependencies(root, db, async () => {
          throw new Error('Access revoked')
        })
      )
    ).rejects.toThrow('Access revoked')
  })
  databaseTest(
    'rejects legacy snapshots and revisions belonging to another module',
    async () => {
      const { root, baseline } = await moduleHistory()
      root.dependencies[0].revisionId = baseline.revisionId
      root.moduleInstances[0].revisionId = baseline.revisionId
      await expect(
        transaction(db =>
          resolveStoredDesignDependencies(root, db, async () => {})
        )
      ).rejects.toMatchObject({ code: 'INVALID_DESIGN' })
      root.dependencies[0].moduleId = crypto.randomUUID()
      root.moduleInstances[0].moduleId = root.dependencies[0].moduleId
      await expect(
        transaction(db =>
          resolveStoredDesignDependencies(root, db, async () => {})
        )
      ).rejects.toMatchObject({ code: 'INVALID_DESIGN' })
    }
  )
  beforeAll(async () => {
    if (!socket) return
    if (!socket.startsWith('/private/tmp/figflow-postgres-'))
      throw new Error('Requires the isolated FigFlow test cluster')
    admin = new pg.Client(config())
    await admin.connect()
    expect(
      (await admin.query('SHOW server_encoding')).rows[0].server_encoding
    ).toBe('UTF8')
    await admin.query(
      `CREATE SCHEMA ${schema}; SET search_path TO ${schema}, public`
    )
    await admin.query(
      'CREATE TABLE agency_clients(id uuid PRIMARY KEY); CREATE TABLE edm_templates(id uuid PRIMARY KEY, client_id uuid, body_source jsonb, body_html text, subject text, preview_text text, template_kind text DEFAULT \'draft\', updated_at timestamptz DEFAULT now()); CREATE TABLE edm_custom_modules(id uuid PRIMARY KEY, client_id uuid, blocks jsonb); CREATE TABLE campaigns(id uuid PRIMARY KEY, client_id uuid, status text)'
    )
    const migration = fs.readFileSync(
      new URL(
        '../../server/database/migrations/491_email_design_revisions.sql',
        import.meta.url
      ),
      'utf8'
    )
    await admin.query(migration)
    await admin.query(
      fs.readFileSync(
        new URL(
          '../../server/database/migrations/492_email_design_revision_metadata.sql',
          import.meta.url
        ),
        'utf8'
      )
    )
    await admin.query(migration)
    await admin.query(
      fs.readFileSync(
        new URL(
          '../../server/database/migrations/492_email_design_revision_metadata.sql',
          import.meta.url
        ),
        'utf8'
      )
    )
    await admin.query('INSERT INTO agency_clients VALUES ($1)', [scope])
  })
  beforeEach(async () => {
    if (!socket) return
    documentId = crypto.randomUUID()
    actorId = crypto.randomUUID()
    templateId = crypto.randomUUID()
    await admin.query(
      'INSERT INTO edm_templates(id, client_id) VALUES ($1,$2)',
      [templateId, scope]
    )
    await admin.query(
      'INSERT INTO email_design_documents(id, template_id, client_id) VALUES ($1,$2,$3)',
      [documentId, templateId, scope]
    )
    baselineRevisionId = (
      await ensureLegacyDesignDocument(
        { kind: 'template', ownerId: templateId, actorId },
        async () => {},
        transaction
      )
    ).revisionId
  })
  afterAll(async () => {
    if (admin) {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`)
      await admin.end()
    }
  })

  databaseTest(
    'saves once and recovers the same receipt after an acknowledgement is lost',
    async () => {
      const operationId = '60000000-0000-4000-8000-000000000001'
      const first = await save(operationId, baselineRevisionId)
      const retry = await save(operationId, baselineRevisionId)
      expect(retry).toEqual(first)
      const rows = await admin.query(
        'SELECT payload FROM email_design_revisions WHERE document_id=$1 AND origin=\'design\'',
        [documentId]
      )
      expect(rows.rowCount).toBe(1)
      expect(rows.rows[0].payload.blocks.heading.data.props.text).toBe(
        'Original'
      )
      await expect(
        save(operationId, baselineRevisionId, 'Different')
      ).rejects.toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT'
      })
    }
  )
  databaseTest(
    'allows exactly one concurrent writer on the same revision',
    async () => {
      await save('60000000-0000-4000-8000-000000000001', baselineRevisionId)
      const head = (
        await admin.query(
          'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
          [documentId]
        )
      ).rows[0].head_revision_id
      const results = await Promise.allSettled([
        save('60000000-0000-4000-8000-000000000002', head, 'Writer A'),
        save('60000000-0000-4000-8000-000000000003', head, 'Writer B')
      ])
      expect(
        results.filter(result => result.status === 'fulfilled')
      ).toHaveLength(1)
      expect(
        results.find(result => result.status === 'rejected')
      ).toMatchObject({ reason: { code: 'REVISION_CONFLICT' } })
    }
  )
  databaseTest(
    'blocks edits and deletion of stored revisions and their referenced template',
    async () => {
      await save('60000000-0000-4000-8000-000000000001', baselineRevisionId)
      await expect(
        admin.query('UPDATE email_design_revisions SET payload_text=\'{}\'')
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        admin.query('DELETE FROM email_design_revisions')
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        admin.query('DELETE FROM edm_templates WHERE id=$1', [templateId])
      ).rejects.toMatchObject({ code: '23503' })
    }
  )
  databaseTest(
    'checks authority again even when returning an idempotent receipt',
    async () => {
      await save('60000000-0000-4000-8000-000000000001', baselineRevisionId)
      await expect(
        appendDesignRevision(
          {
            documentId,
            actorId,
            operationId: '60000000-0000-4000-8000-000000000001',
            expectedRevisionId: baselineRevisionId,
            design: structuredDesign()
          },
          async () => {
            throw new Error('revoked')
          },
          transaction
        )
      ).rejects.toThrow('revoked')
    }
  )
  databaseTest('rejects a source declaration for another client', async () => {
    const design = structuredDesign()
    design.scope.clientId = '10000000-0000-4000-8000-000000000002'
    await expect(
      appendDesignRevision(
        {
          documentId,
          actorId,
          operationId: '60000000-0000-4000-8000-000000000004',
          expectedRevisionId: baselineRevisionId,
          design
        },
        async () => {},
        transaction
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      appendDesignRevision(
        {
          documentId: crypto.randomUUID(),
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: baselineRevisionId,
          design
        },
        async () => {},
        transaction
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
  databaseTest(
    'prevents ownership drift without locking out the original owner',
    async () => {
      await expect(
        admin.query('UPDATE edm_templates SET client_id=$2 WHERE id=$1', [
          templateId,
          '10000000-0000-4000-8000-000000000002'
        ])
      ).rejects.toMatchObject({
        code: '55000',
        constraint: 'email_design_scope_copy_required'
      })
      await expect(
        save(crypto.randomUUID(), baselineRevisionId)
      ).resolves.toMatchObject({ documentId })
    }
  )
  databaseTest('does not revise an already scheduled campaign', async () => {
    const campaignId = crypto.randomUUID()
    const campaignDocumentId = crypto.randomUUID()
    await admin.query('INSERT INTO campaigns VALUES ($1,$2,\'scheduled\')', [
      campaignId,
      scope
    ])
    await admin.query(
      'INSERT INTO email_design_documents(id, campaign_id, client_id) VALUES ($1,$2,$3)',
      [campaignDocumentId, campaignId, scope]
    )
    await expect(
      appendDesignRevision(
        {
          documentId: campaignDocumentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: baselineRevisionId,
          design: { ...structuredDesign(), kind: 'campaign-draft' }
        },
        async () => {},
        transaction
      )
    ).rejects.toMatchObject({ code: 'CAMPAIGN_FROZEN' })
  })
  databaseTest(
    'recovers a real committed write after the caller loses its acknowledgement',
    async () => {
      const operationId = crypto.randomUUID()
      const design = structuredDesign()
      const input = {
        documentId,
        actorId,
        operationId,
        expectedRevisionId: baselineRevisionId,
        design
      }
      const loseReceipt: DesignTransaction = async (callback) => {
        await transaction(callback)
        throw new Error('acknowledgement lost')
      }
      await expect(
        appendDesignRevision(input, async () => {}, loseReceipt)
      ).rejects.toThrow('acknowledgement lost')
      const recovered = await appendDesignRevision(
        input,
        async () => {},
        transaction
      )
      const rows = await admin.query(
        'SELECT id FROM email_design_revisions WHERE document_id=$1 AND origin=\'design\'',
        [documentId]
      )
      expect(rows.rows).toEqual([{ id: recovered.revisionId }])
    }
  )

  databaseTest('concurrent retries create only one revision', async () => {
    const operationId = crypto.randomUUID()
    const results = await Promise.all([
      save(operationId, baselineRevisionId),
      save(operationId, baselineRevisionId)
    ])
    expect(results[0]).toEqual(results[1])
    expect(
      (
        await admin.query(
          'SELECT id FROM email_design_revisions WHERE document_id=$1 AND origin=\'design\'',
          [documentId]
        )
      ).rowCount
    ).toBe(1)
  })
  databaseTest(
    'rolls back head and payload when receipt persistence fails',
    async () => {
      const failReceipt: DesignTransaction = callback =>
        transaction(db =>
          callback({
            query: async (sql, params) => {
              if (sql.includes('INSERT INTO email_design_revision_receipts'))
                throw new Error('receipt storage failed')
              return db.query(sql, params)
            }
          })
        )
      await expect(
        appendDesignRevision(
          {
            documentId,
            actorId,
            operationId: crypto.randomUUID(),
            expectedRevisionId: baselineRevisionId,
            design: structuredDesign()
          },
          async () => {},
          failReceipt
        )
      ).rejects.toThrow('receipt storage failed')
      expect(
        (
          await admin.query(
            'SELECT id FROM email_design_revisions WHERE document_id=$1 AND origin=\'design\'',
            [documentId]
          )
        ).rowCount
      ).toBe(0)
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
    }
  )
  databaseTest(
    'keeps operation receipts and document scope immutable',
    async () => {
      await save(crypto.randomUUID(), baselineRevisionId)
      await expect(
        admin.query(
          'DELETE FROM email_design_revision_receipts WHERE document_id=$1',
          [documentId]
        )
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        admin.query(
          'UPDATE email_design_documents SET client_id=NULL WHERE id=$1',
          [documentId]
        )
      ).rejects.toMatchObject({ code: '55000' })
    }
  )

  databaseTest(
    'captures legacy source and frozen HTML once without rewriting the template',
    async () => {
      const legacyId = crypto.randomUUID()
      const originalHtml
        = '<!--[if mso]><table><![endif]--><p>Original &amp; offer</p>'
      const originalSource = {
        root: { type: 'Html', data: { props: { contents: originalHtml } } }
      }
      await admin.query(
        'INSERT INTO edm_templates(id,client_id,body_source,body_html) VALUES ($1,$2,$3,$4)',
        [legacyId, scope, originalSource, originalHtml]
      )
      const input = { kind: 'template' as const, ownerId: legacyId, actorId }
      const first = await ensureLegacyDesignDocument(
        input,
        async () => {},
        transaction
      )
      const second = await ensureLegacyDesignDocument(
        input,
        async () => {},
        transaction
      )
      expect(second).toEqual(first)
      const revision = (
        await admin.query(
          'SELECT origin, schema_version, payload FROM email_design_revisions WHERE id=$1',
          [first.revisionId]
        )
      ).rows[0]
      expect(revision).toMatchObject({
        origin: 'legacy',
        schema_version: 0,
        payload: { body_source: originalSource, body_html: originalHtml }
      })
      await admin.query('UPDATE edm_templates SET body_html=$2 WHERE id=$1', [
        legacyId,
        'Later mutable content'
      ])
      expect(
        (
          await admin.query(
            'SELECT payload FROM email_design_revisions WHERE id=$1',
            [first.revisionId]
          )
        ).rows[0].payload.body_html
      ).toBe(originalHtml)
    }
  )

  databaseTest(
    'copies legacy JSON without JavaScript numeric precision loss',
    async () => {
      const legacyId = crypto.randomUUID()
      await admin.query(
        'INSERT INTO edm_templates(id,client_id,body_source) VALUES ($1,$2,$3::jsonb)',
        [legacyId, scope, '{"opaqueOriginalNumber":9007199254740993}']
      )
      const receipt = await ensureLegacyDesignDocument(
        { kind: 'template', ownerId: legacyId, actorId },
        async () => {},
        transaction
      )
      expect(
        (
          await admin.query(
            'SELECT payload->\'body_source\'->>\'opaqueOriginalNumber\' AS original FROM email_design_revisions WHERE id=$1',
            [receipt.revisionId]
          )
        ).rows[0].original
      ).toBe('9007199254740993')
      const converted = await appendDesignRevision(
        {
          documentId: receipt.documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: receipt.revisionId,
          design: structuredDesign()
        },
        async () => {},
        transaction
      )
      expect(converted.revisionId).not.toBe(receipt.revisionId)
    }
  )

  databaseTest(
    'snapshots a shared legacy module under its existing library identity',
    async () => {
      const moduleId = crypto.randomUUID()
      const fragment = {
        blocks: {
          original: {
            type: 'Text',
            data: { props: { text: 'Shared module' } }
          }
        },
        rootChildrenIds: ['original']
      }
      await admin.query(
        'INSERT INTO edm_custom_modules(id,client_id,blocks) VALUES ($1,NULL,$2)',
        [moduleId, fragment]
      )
      const receipt = await ensureLegacyDesignDocument(
        { kind: 'module', ownerId: moduleId, actorId },
        async (clientId) => {
          if (clientId !== null) throw new Error('Unexpected scope')
        },
        transaction
      )
      const row = (
        await admin.query(
          'SELECT d.module_id,d.client_id,r.payload FROM email_design_documents d JOIN email_design_revisions r ON r.id=d.head_revision_id WHERE d.id=$1',
          [receipt.documentId]
        )
      ).rows[0]
      expect(row).toMatchObject({
        module_id: moduleId,
        client_id: null,
        payload: { id: moduleId, blocks: fragment }
      })
    }
  )
  databaseTest('rejects resetting or rewinding a committed head', async () => {
    const first = await save(crypto.randomUUID(), baselineRevisionId)
    await save(crypto.randomUUID(), first.revisionId, 'Next')
    await expect(
      admin.query(
        'UPDATE email_design_documents SET head_revision_id=NULL WHERE id=$1',
        [documentId]
      )
    ).rejects.toMatchObject({ code: '55000' })
    await expect(
      admin.query(
        'UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1',
        [documentId, first.revisionId]
      )
    ).rejects.toMatchObject({ code: '55000' })
  })
  databaseTest(
    'blocks owner reassignment once revision history exists',
    async () => {
      await save(crypto.randomUUID(), baselineRevisionId)
      await expect(
        admin.query('UPDATE edm_templates SET client_id=NULL WHERE id=$1', [
          templateId
        ])
      ).rejects.toMatchObject({ code: '55000' })
    }
  )
  databaseTest(
    'requires a legacy baseline before the first design append',
    async () => {
      templateId = crypto.randomUUID()
      documentId = crypto.randomUUID()
      await admin.query(
        'INSERT INTO edm_templates(id,client_id) VALUES ($1,$2)',
        [templateId, scope]
      )
      await admin.query(
        'INSERT INTO email_design_documents(id,template_id,client_id) VALUES ($1,$2,$3)',
        [documentId, templateId, scope]
      )
      await expect(save(crypto.randomUUID(), null)).rejects.toMatchObject({
        code: 'LEGACY_SNAPSHOT_REQUIRED'
      })
    }
  )
  databaseTest(
    'accepts a valid source at the exact compact UTF-8 budget',
    async () => {
      const design = structuredDesign()
      design.blocks.heading.data.props.text = ''
      const available
        = 2097152 - new TextEncoder().encode(JSON.stringify(design)).byteLength
      design.blocks.heading.data.props.text
        = '🎨'.repeat(Math.floor(available / 4)) + 'a'.repeat(available % 4)
      const receipt = await appendDesignRevision(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: baselineRevisionId,
          design
        },
        async () => {},
        transaction
      )
      expect(receipt.revisionId).toEqual(expect.any(String))
      const stored = await admin.query(
        'SELECT octet_length(payload_text) AS bytes, payload FROM email_design_revisions WHERE id=$1',
        [receipt.revisionId]
      )
      expect(stored.rows[0].bytes).toBe(2097152)
      expect(stored.rows[0].payload.blocks.heading.data.props.text).toBe(
        design.blocks.heading.data.props.text
      )
    }
  )

  databaseTest(
    'rejects committing an unlinked revision and leaves the history usable',
    async () => {
      await expect(
        admin.query(
          'INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by) VALUES ($1,$2,1,\'{}\',$3)',
          [documentId, baselineRevisionId, actorId]
        )
      ).rejects.toMatchObject({ code: '55000' })
      await expect(
        save(crypto.randomUUID(), baselineRevisionId)
      ).resolves.toMatchObject({ documentId })
    }
  )
  databaseTest(
    'rejects a revision attached to a stale parent at the database boundary',
    async () => {
      await save(crypto.randomUUID(), baselineRevisionId)
      await expect(
        admin.query(
          'INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by) VALUES ($1,$2,1,\'{}\',$3)',
          [documentId, baselineRevisionId, actorId]
        )
      ).rejects.toMatchObject({ code: '55000' })
    }
  )
  databaseTest(
    'requires the original CAS token when reconciling an operation',
    async () => {
      const operationId = crypto.randomUUID()
      const receipt = await save(operationId, baselineRevisionId)
      await expect(save(operationId, receipt.revisionId)).rejects.toMatchObject(
        { code: 'IDEMPOTENCY_CONFLICT' }
      )
      expect(await save(operationId, baselineRevisionId)).toEqual(receipt)
    }
  )
  databaseTest(
    'initializes concurrently without duplicate roots or template changes',
    async () => {
      const ownerId = crypto.randomUUID()
      await admin.query(
        'INSERT INTO edm_templates(id,client_id) VALUES ($1,$2)',
        [ownerId, scope]
      )
      const before = (
        await admin.query(
          'SELECT to_jsonb(t) AS value FROM edm_templates t WHERE id=$1',
          [ownerId]
        )
      ).rows[0].value
      const input = { templateId: ownerId, actorId, expectedClientId: scope }
      const results = await Promise.all(
        [1, 2].map(() =>
          initializeTemplateDesignDraft(input, async () => {}, transaction)
        )
      )
      expect(results[0]).toEqual(results[1])
      expect(results[0]).toMatchObject({ schemaVersion: 0, origin: 'legacy' })
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM email_design_revisions WHERE document_id=$1',
            [results[0].documentId]
          )
        ).rows[0].count
      ).toBe(1)
      expect(
        (
          await admin.query(
            'SELECT to_jsonb(t) AS value FROM edm_templates t WHERE id=$1',
            [ownerId]
          )
        ).rows[0].value
      ).toEqual(before)
    }
  )
  databaseTest(
    'reinitializing a structured draft preserves its current head',
    async () => {
      const head = await save(crypto.randomUUID(), baselineRevisionId)
      expect(
        await initializeTemplateDesignDraft(
          { templateId, actorId, expectedClientId: scope },
          async () => {},
          transaction
        )
      ).toEqual({
        documentId,
        revisionId: head.revisionId,
        schemaVersion: 1,
        origin: 'design'
      })
    }
  )
  databaseTest(
    'initialization denial and transaction failure leave no identity',
    async () => {
      const ownerId = crypto.randomUUID()
      await admin.query(
        'INSERT INTO edm_templates(id,client_id) VALUES ($1,$2)',
        [ownerId, scope]
      )
      const input = { templateId: ownerId, actorId, expectedClientId: scope }
      await expect(
        initializeTemplateDesignDraft(
          input,
          async () => {
            throw new Error('revoked')
          },
          transaction
        )
      ).rejects.toThrow('revoked')
      await expect(
        initializeTemplateDesignDraft(
          { ...input, expectedClientId: null },
          async () => {},
          transaction
        )
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const rollback: DesignTransaction = callback =>
        transaction(async (db) => {
          await callback(db)
          throw new Error('rollback initialization')
        })
      await expect(
        initializeTemplateDesignDraft(input, async () => {}, rollback)
      ).rejects.toThrow('rollback initialization')
      expect(
        (
          await admin.query(
            'SELECT id FROM email_design_documents WHERE template_id=$1',
            [ownerId]
          )
        ).rows
      ).toHaveLength(0)
    }
  )
  databaseTest(
    'repeated initialization detects legacy drift without resetting history',
    async () => {
      await admin.query('UPDATE edm_templates SET body_html=$2 WHERE id=$1', [
        templateId,
        'Changed after snapshot'
      ])
      await expect(
        initializeTemplateDesignDraft(
          { templateId, actorId, expectedClientId: scope },
          async () => {},
          transaction
        )
      ).rejects.toMatchObject({ code: 'LEGACY_CONTENT_CHANGED' })
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(baselineRevisionId)
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM email_design_revisions WHERE document_id=$1',
            [documentId]
          )
        ).rows[0].count
      ).toBe(1)
      expect(
        (
          await admin.query('SELECT body_html FROM edm_templates WHERE id=$1', [
            templateId
          ])
        ).rows[0].body_html
      ).toBe('Changed after snapshot')
    }
  )
  databaseTest(
    'metadata revision copies canonical bytes and updates HTML atomically',
    async () => {
      const head = await save(crypto.randomUUID(), baselineRevisionId)
      const original = (
        await admin.query(
          'SELECT payload_text FROM email_design_revisions WHERE id=$1',
          [head.revisionId]
        )
      ).rows[0].payload_text
      const receipt = await saveTemplateDraftMetadata(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: head.revisionId,
          expectedClientId: scope,
          subject: 'New subject',
          previewText: 'New preview'
        },
        async () => {},
        testEmailRenderer,
        transaction
      )
      const revision = (
        await admin.query(
          'SELECT payload_text, subject, preview_text FROM email_design_revisions WHERE id=$1',
          [receipt.revisionId]
        )
      ).rows[0]
      expect(revision).toEqual({
        payload_text: original,
        subject: 'New subject',
        preview_text: 'New preview'
      })
      const owner = (
        await admin.query(
          'SELECT subject, preview_text, body_html, email_design_revision_id FROM edm_templates WHERE id=$1',
          [templateId]
        )
      ).rows[0]
      expect(owner).toMatchObject({
        subject: 'New subject',
        preview_text: 'New preview',
        email_design_revision_id: receipt.revisionId
      })
      expect(owner.body_html).toContain('New preview')
      const following = await saveTemplateDesignDraft(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: receipt.revisionId,
          design: structuredDesign()
        },
        async () => {},
        testEmailRenderer,
        transaction
      )
      expect(
        (
          await admin.query(
            'SELECT subject, preview_text FROM email_design_revisions WHERE id=$1',
            [following.revisionId]
          )
        ).rows[0]
      ).toEqual({ subject: 'New subject', preview_text: 'New preview' })

      await expect(
        admin.query('UPDATE edm_templates SET subject=$2 WHERE id=$1', [
          templateId,
          'Bypass'
        ])
      ).rejects.toMatchObject({ code: '55000' })
    }
  )
  databaseTest(
    'metadata replays keep the receipt and changed payloads conflict',
    async () => {
      const head = await save(crypto.randomUUID(), baselineRevisionId)
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: head.revisionId,
        expectedClientId: scope,
        subject: null,
        previewText: ''
      }
      const first = await saveTemplateDraftMetadata(
        input,
        async () => {},
        testEmailRenderer,
        transaction
      )
      const later = await save(crypto.randomUUID(), first.revisionId)
      const noRender = {
        ...testEmailRenderer,
        renderDocument: async () => {
          throw new Error('must not render replay')
        }
      }
      expect(
        await saveTemplateDraftMetadata(
          input,
          async () => {},
          noRender,
          transaction
        )
      ).toEqual(first)
      await expect(
        saveTemplateDraftMetadata(
          { ...input, subject: 'Changed' },
          async () => {},
          noRender,
          transaction
        )
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(later.revisionId)
    }
  )
  databaseTest(
    'metadata refuses legacy heads and wrong scope without writes',
    async () => {
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: baselineRevisionId,
        expectedClientId: scope,
        subject: 'Test',
        previewText: null
      }
      await expect(
        saveTemplateDraftMetadata(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).rejects.toMatchObject({ code: 'STRUCTURED_REVISION_REQUIRED' })
      await expect(
        saveTemplateDraftMetadata(
          { ...input, expectedClientId: null },
          async () => {},
          testEmailRenderer,
          transaction
        )
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM email_design_revisions WHERE document_id=$1',
            [documentId]
          )
        ).rows[0].count
      ).toBe(1)
    }
  )
  databaseTest(
    'metadata rollback preserves the head after render or authority failure',
    async () => {
      const head = await save(crypto.randomUUID(), baselineRevisionId)
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: head.revisionId,
        expectedClientId: scope,
        subject: 'Test',
        previewText: null
      }
      const broken = {
        ...testEmailRenderer,
        renderDocument: async () => {
          throw new Error('render failed')
        }
      }
      await expect(
        saveTemplateDraftMetadata(input, async () => {}, broken, transaction)
      ).rejects.toThrow('render failed')
      let calls = 0
      await expect(
        saveTemplateDraftMetadata(
          input,
          async () => {
            calls++
            if (calls > 1) throw new Error('revoked')
          },
          testEmailRenderer,
          transaction
        )
      ).rejects.toThrow('revoked')
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(head.revisionId)
      expect(
        (
          await admin.query(
            'SELECT * FROM email_design_revision_receipts WHERE operation_id=$1',
            [input.operationId]
          )
        ).rows
      ).toHaveLength(0)
    }
  )
  databaseTest(
    'metadata concurrent edits use the same head CAS as block edits',
    async () => {
      const head = await save(crypto.randomUUID(), baselineRevisionId)
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: head.revisionId,
        expectedClientId: scope,
        subject: 'Metadata edit',
        previewText: null
      }
      const outcomes = await Promise.allSettled([
        saveTemplateDraftMetadata(
          input,
          async () => {},
          testEmailRenderer,
          transaction
        ),
        save(crypto.randomUUID(), head.revisionId)
      ])
      expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1)
      expect(outcomes.find(x => x.status === 'rejected')).toMatchObject({
        reason: { code: 'REVISION_CONFLICT' }
      })
    }
  )
  databaseTest(
    'metadata rechecks module authority after render and on receipt replay',
    async () => {
      const { root } = await moduleHistory()
      const head = await appendDesignRevision(
        {
          documentId,
          actorId,
          operationId: crypto.randomUUID(),
          expectedRevisionId: baselineRevisionId,
          design: root
        },
        async () => {},
        transaction,
        { authorizeModuleRead: async () => {} }
      )
      const input = {
        documentId,
        actorId,
        operationId: crypto.randomUUID(),
        expectedRevisionId: head.revisionId,
        expectedClientId: scope,
        subject: 'Subject',
        previewText: null
      }
      let allowed = true
      const revokeDuringRender = {
        ...testEmailRenderer,
        renderDocument: async (
          ...args: Parameters<typeof testEmailRenderer.renderDocument>
        ) => {
          const result = await testEmailRenderer.renderDocument(...args)
          allowed = false
          return result
        }
      }
      const moduleRead = async () => {
        if (!allowed) throw new Error('module revoked')
      }
      await expect(
        saveTemplateDraftMetadata(
          input,
          async () => {},
          revokeDuringRender,
          transaction,
          moduleRead
        )
      ).rejects.toThrow('module revoked')
      expect(
        (
          await admin.query(
            'SELECT head_revision_id FROM email_design_documents WHERE id=$1',
            [documentId]
          )
        ).rows[0].head_revision_id
      ).toBe(head.revisionId)
      allowed = true
      await saveTemplateDraftMetadata(
        input,
        async () => {},
        testEmailRenderer,
        transaction,
        moduleRead
      )
      allowed = false
      await expect(
        saveTemplateDraftMetadata(
          input,
          async () => {},
          testEmailRenderer,
          transaction,
          moduleRead
        )
      ).rejects.toThrow('module revoked')
    }
  )
})
