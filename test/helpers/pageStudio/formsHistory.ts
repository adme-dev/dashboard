import { collectionCanonical as canonical, collectionDigest } from '~~/shared/pageStudio/collectionApi'
import { starterEmailTemplate } from '~~/shared/pageStudio/emailTemplates'
import type { PageStudioContentScope } from '~~/shared/pageStudio/businessContent'

export type HistoryEntry = { table: 'form_settings_drafts' | 'shared_form_settings_drafts' | 'form_recipients_drafts' | 'email_template_drafts', identity: string[], revision: number, payload: string, digest: string }
export async function formsHistoryInventory(entries: HistoryEntry[], fenceDigest: string) {
  const counts = { form_settings_drafts: 0, shared_form_settings_drafts: 0, form_recipients_drafts: 0, email_template_drafts: 0 }
  const checked = []
  for (const entry of entries) {
    counts[entry.table]++
    const { digest: _, ...body } = entry
    checked.push({ ...body, digest: await collectionDigest(body) })
  }
  const body = { formatVersion: 1, counts, entries: checked, fenceDigest }
  return { ...body, digest: await collectionDigest(body) }
}
export async function formsHistoryFixture(scope: PageStudioContentScope, fenceDigest: string, revisions = 2) {
  const identities: [HistoryEntry['table'], string[], Record<string, unknown>][] = [
    ['form_settings_drafts', ['home', 'removed_form'], { pageId: 'home', formId: 'removed_form' }],
    ['shared_form_settings_drafts', ['removed_definition'], { definitionId: 'removed_definition' }],
    ['form_recipients_drafts', [], {}],
    ['email_template_drafts', ['customer'], { audience: 'customer' }],
    ['email_template_drafts', ['team'], { audience: 'team' }]
  ]
  const entries: HistoryEntry[] = []
  for (const [table, identity, fields] of identities) for (let revision = 1; revision <= revisions; revision++) {
    const payload: Record<string, unknown> = { ...fields, revision, scope, actorId: `author_${revision}`, checkpointId: `checkpoint_${revision}`, updatedAt: '2026-10-16T00:00:00.000Z' }
    if (table === 'email_template_drafts') payload.template = starterEmailTemplate(identity[0] as 'team' | 'customer')
    else payload.settings = table === 'form_recipients_drafts'
      ? { recipients: ['team@example.test'], overrides: [{ definitionId: 'removed_definition', recipients: [] }] }
      : { fallback: { type: 'message', message: `Original answer ${revision}` }, rules: [] }
    entries.push({ table, identity, revision, payload: canonical(payload), digest: '' })
  }
  return formsHistoryInventory(entries, fenceDigest)
}
