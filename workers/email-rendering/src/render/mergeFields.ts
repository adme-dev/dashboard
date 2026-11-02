import { resolveEmailMergeTags } from '../../../../shared/emailRendering/mergeTags'

// Preserve unresolved tokens in authoring previews; the campaign boundary uses
// the same resolver with missing:'empty' for final recipient formatting.
export function replaceMergeFields(html: string, variables: Record<string, string>, budget?: { charge(value: string): void }): string {
  return resolveEmailMergeTags(html, variables, { budget })
}
