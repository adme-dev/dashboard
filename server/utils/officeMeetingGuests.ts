export function normalizeOfficeMeetingGuestEmails(emails: string[]) {
  return [...new Set(emails.map(email => email.trim().toLowerCase()).filter(Boolean))]
}
