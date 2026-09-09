import { getResendClient, getEmailConfig, getCachedBinding } from '~~/server/utils/email'
import { getAppUrl } from '~~/server/utils/appUrl'
import type { ReviewAlert } from './reviewAlerts'

/** Explicit review-only recipients; independent of the general member-notification pause. */
export async function sendReviewAlertEmail(review: ReviewAlert): Promise<boolean> {
  const recipients = (getCachedBinding('SOCIAL_REVIEW_ALERT_EMAILS') || process.env.SOCIAL_REVIEW_ALERT_EMAILS || '')
    .split(',').map(email => email.trim()).filter(Boolean)
  if (!recipients.length) return false
  const client = getResendClient()
  if (!client) throw new Error('Review alert email is not configured')
  const config = getEmailConfig()
  const result = await client.emails.send({
    from: `${config.appName} <${config.fromEmail}>`,
    to: recipients,
    subject: `${review.rating}-star review needs attention — ${review.account_name}`,
    text: `${review.account_name} has a ${review.rating}-star review that needs a personal response.\n\nNo automatic reply has been posted.\n\nOpen the review: ${getAppUrl()}/agency/social/inbox?conversation=${encodeURIComponent(review.id)}`
  }, { idempotencyKey: `social-review-alert-${review.id}` })
  if (result.error) throw new Error(result.error.message)
  return true
}
