import PostalMime from 'postal-mime'

interface Env {
  API_URL: string
  INTERNAL_API_KEY: string
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    try {
      const to = message.to
      // Extract token from address: board-{token}@mail.domain.com
      const localPart = to.split('@')[0]
      if (!localPart.startsWith('board-')) {
        message.setReject('Invalid board address')
        return
      }
      const token = localPart.replace('board-', '')

      // Parse email content
      const rawEmail = await new Response(message.raw).arrayBuffer()
      const parser = new PostalMime()
      const email = await parser.parse(rawEmail)

      // Call internal API to create task from email
      const response = await fetch(`${env.API_URL}/api/internal/email-to-board`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.INTERNAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          boardToken: token,
          from: message.from,
          subject: email.subject || '(No Subject)',
          textBody: email.text || '',
          htmlBody: email.html || '',
          attachments: (email.attachments || []).map(a => ({
            filename: a.filename,
            contentType: a.mimeType,
            size: a.content?.byteLength || 0
          }))
        })
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('API error:', error)
        message.setReject(`Failed to process email: ${response.status}`)
      }
    } catch (error) {
      console.error('Email worker error:', error)
      message.setReject('Internal error processing email')
    }
  }
} satisfies ExportedHandler<Env>
