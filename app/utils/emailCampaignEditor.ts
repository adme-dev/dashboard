export function buildCampaignEditorPatch(input: {
  subject: string
  previewText: string
  fromEmail: string
  bodySource: unknown
}) {
  const subject = input.subject.trim()
  const previewText = input.previewText.trim()
  const fromEmail = input.fromEmail.trim()
  return {
    subject: subject || null,
    preview_text: previewText || null,
    from_email: fromEmail || null,
    body_source: input.bodySource
  }
}
