import { z } from 'zod'
import { CustomerSiteChoices } from '~~/shared/pageStudio/customerSignup'

export const SIGNUP_INTAKE_KEY = 'page-studio-signup-intake-v1'
type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const Envelope = z.object({ email: z.string().email(), expiresAt: z.number().finite(), choices: CustomerSiteChoices }).strict()
export function writeSignupIntake(storage: BrowserStorage, email: string, choices: unknown, now = Date.now()) {
  try {
    const value = Envelope.parse({ email: email.trim().toLowerCase(), expiresAt: now + 86_400_000, choices })
    storage.setItem(SIGNUP_INTAKE_KEY, JSON.stringify(value))
  } catch { /* Browser storage is optional; signup must remain available. */ }
}
export function readSignupIntake(storage: BrowserStorage, email: string, now = Date.now()) {
  try {
    const value = Envelope.parse(JSON.parse(storage.getItem(SIGNUP_INTAKE_KEY) || 'null'))
    return value.email === email.trim().toLowerCase() && value.expiresAt > now ? value.choices : null
  } catch { return null }
}
export function clearSignupIntake(storage: BrowserStorage) {
  try {
    storage.removeItem(SIGNUP_INTAKE_KEY)
  } catch { /* Storage can be blocked. */ }
}
