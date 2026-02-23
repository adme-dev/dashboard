/**
 * Email service using Resend
 */

import { Resend } from 'resend'

let resend: Resend | null = null

function getResendClient(): Resend | null {
  if (resend) return resend
  
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not configured')
    return null
  }
  
  resend = new Resend(apiKey)
  return resend
}

export interface MagicLinkEmailData {
  to: string
  name: string
  magicLinkUrl: string
}

/**
 * Send magic link email
 */
export async function sendMagicLinkEmail(data: MagicLinkEmailData): Promise<void> {
  const client = getResendClient()
  
  if (!client) {
    console.log('[Email] Magic link for', data.to, ':', data.magicLinkUrl)
    return
  }
  
  const fromEmail = process.env.EMAIL_FROM || 'noreply@yourdomain.com'
  const appName = process.env.APP_NAME || 'XeroFlow Agency'
  
  try {
    await client.emails.send({
      from: `${appName} <${fromEmail}>`,
      to: data.to,
      subject: `Sign in to ${appName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #13B5EA;">Sign in to ${appName}</h1>
          <p>Hi ${data.name},</p>
          <p>Click the button below to sign in instantly. This link expires in 1 hour.</p>
          <a href="${data.magicLinkUrl}" 
             style="display: inline-block; background: #13B5EA; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 6px; margin: 16px 0;">
            Sign In
          </a>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link:<br>
            <a href="${data.magicLinkUrl}" style="color: #13B5EA;">${data.magicLinkUrl}</a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 32px;">
            If you didn't request this email, you can safely ignore it.
          </p>
        </div>
      `,
      text: `Hi ${data.name},\n\nSign in to ${appName}: ${data.magicLinkUrl}\n\nThis link expires in 1 hour.\n\nIf you didn't request this email, you can safely ignore it.`
    })
    
    console.log('[Email] Magic link sent to', data.to)
  } catch (error) {
    console.error('[Email] Failed to send magic link:', error)
    throw error
  }
}

// Stub functions for notification emails (to be implemented)

export async function sendTaskAssignedEmail(data: {
  to: string
  name: string
  taskTitle: string
  projectName?: string
  assignerName: string
  dueDate?: Date
  taskUrl: string
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Task assigned email (stub) for', data.to)
    return
  }
  // TODO: Implement actual email template
  console.log('[Email] Task assigned email sent to', data.to)
}

export async function sendMentionEmail(data: {
  to: string
  name: string
  taskTitle: string
  mentionerName: string
  commentSnippet: string
  taskUrl: string
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Mention email (stub) for', data.to)
    return
  }
  // TODO: Implement actual email template
  console.log('[Email] Mention email sent to', data.to)
}

export async function sendApprovalRequestEmail(data: {
  to: string
  name: string
  taskTitle: string
  requesterName: string
  taskUrl: string
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Approval request email (stub) for', data.to)
    return
  }
  // TODO: Implement actual email template
  console.log('[Email] Approval request email sent to', data.to)
}

export async function sendDueReminderEmail(data: {
  to: string
  name: string
  taskTitle: string
  dueDate: Date
  daysRemaining: number
  taskUrl: string
}): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Due reminder email (stub) for', data.to)
    return
  }
  // TODO: Implement actual email template
  console.log('[Email] Due reminder email sent to', data.to)
}

export async function sendInvitationEmail(data: { to: string; name: string; inviterName: string; teamName: string; inviteUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Invitation email (stub) for', data.to)
    return
  }
  console.log('[Email] Invitation email sent to', data.to)
}

export async function sendVerificationEmail(data: { to: string; name: string; verificationUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Verification email (stub) for', data.to)
    return
  }
  console.log('[Email] Verification email sent to', data.to)
}

export async function sendWelcomeEmail(data: { to: string; name: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Welcome email (stub) for', data.to)
    return
  }
  console.log('[Email] Welcome email sent to', data.to)
}

export async function sendPasswordResetEmail(data: { to: string; name: string; resetUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Password reset email (stub) for', data.to)
    return
  }
  console.log('[Email] Password reset email sent to', data.to)
}

export async function sendQuoteEmail(data: { to: string; quoteId: string; quoteUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Quote email (stub) for', data.to)
    return
  }
  console.log('[Email] Quote email sent to', data.to)
}

export async function sendClientPortalInviteEmail(data: { to: string; name: string; portalUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Client portal invite email (stub) for', data.to)
    return
  }
  console.log('[Email] Client portal invite email sent to', data.to)
}

export async function sendClientApprovalRequestEmail(data: { to: string; clientName: string; itemTitle: string; approvalUrl: string }): Promise<void> {
  const client = getResendClient()
  if (!client) {
    console.log('[Email] Client approval request email (stub) for', data.to)
    return
  }
  console.log('[Email] Client approval request email sent to', data.to)
}
