// GET /email/click?c=&s=&u=&t=
// Clean recipient-facing tracking URL emitted into campaign HTML. Keep this
// outside /api so email clients can follow it without API auth middleware.

export { default } from '~~/server/api/public/email/click.get'
