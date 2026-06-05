export function buildCampaignEditorPatch(input: {
  subject: string
  previewText: string
  fromEmail: string
  bodySource: unknown
}) {
  const fromEmail = input.fromEmail.trim()
  return {
    subject: input.subject || null,
    preview_text: input.previewText || null,
    from_email: fromEmail || null,
    body_source: input.bodySource
  }
}
