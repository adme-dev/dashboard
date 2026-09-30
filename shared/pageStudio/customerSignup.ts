import { z } from 'zod'

export const CustomerSignInRequest = z.object({
  mode: z.enum(['signup', 'signin']),
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(100).optional(),
  acceptedTerms: z.boolean().optional()
}).strict().superRefine((value, context) => {
  if (value.mode === 'signup' && (!value.name || value.acceptedTerms !== true)) {
    context.addIssue({ code: 'custom', message: 'Name and terms acknowledgement are required' })
  }
})
export const CustomerSetupDraft = z.object({
  businessName: z.string().trim().max(160),
  businessType: z.string().trim().max(100),
  timezone: z.string().max(100).refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return true
    } catch {
      return false
    }
  }, 'Choose a valid timezone'),
  goals: z.array(z.enum(['enquiries', 'blog', 'gallery', 'bookings', 'sales'])).max(5)
    .refine(values => new Set(values).size === values.length, 'Choose each goal once')
}).strict()
export const CustomerSetupWrite = z.object({ expectedRevision: z.number().int().min(0), draft: CustomerSetupDraft }).strict()
export type CustomerSetup = z.infer<typeof CustomerSetupDraft>
