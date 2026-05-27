export const normalizeClientRequestAttachments = (value: unknown) => {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid attachments' })
  }
  if (value.length > 10) {
    throw createError({ statusCode: 400, statusMessage: 'Too many attachments' })
  }
  if (value.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid attachments' })
  }
  return value
}
