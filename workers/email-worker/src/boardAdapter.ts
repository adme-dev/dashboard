import type {
  FetchLike,
  ParsedInboundEmail
} from './contracts'

export interface BoardAdapterInput {
  token: string
  from: string
  email: ParsedInboundEmail
  apiUrl: string
  internalApiKey: string
}

export interface BoardAdapterResult {
  accepted: boolean
  status: number | null
}

export async function deliverBoardEmail(
  input: BoardAdapterInput,
  dependencies: { fetch: FetchLike }
): Promise<BoardAdapterResult> {
  const response = await dependencies.fetch(
    `${input.apiUrl.replace(/\/+$/, '')}/api/internal/email-to-board`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.internalApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        boardToken: input.token,
        from: input.from,
        subject: input.email.subject || '(No Subject)',
        textBody: input.email.text || '',
        htmlBody: input.email.html || '',
        attachments: input.email.attachments.map(attachment => ({
          filename: attachment.filename,
          contentType: attachment.mimeType,
          size: attachment.size
        }))
      })
    }
  )

  return {
    accepted: response.ok,
    status: response.status
  }
}
