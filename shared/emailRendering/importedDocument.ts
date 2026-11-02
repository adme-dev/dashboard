/* eslint no-control-regex: off -- Explicit URL control-byte rejection. */
export function publicEmailUrl(value: string, links = false): boolean {
  if (/[\u0000-\u0020\u007f<>"'\\]/.test(value)) return false
  if (links && /^(?:mailto:|tel:|#)/i.test(value)) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && !/^(?:localhost|0\.|127\.|10\.|192\.168\.|169\.254\.|\[|.*\.local$)/i.test(url.hostname)
      && !/^172\.(?:1[6-9]|2\d|3[01])\./.test(url.hostname)
  } catch { return false }
}

type EmailGraph = Record<string, { type: string, data: { childrenIds?: string[], props?: Record<string, unknown> | null } }>

export function assertImportedDocumentIdentity(document: EmailGraph): void {
  const imported = Object.entries(document).filter(([, block]) => block.type === 'Html' && block.data.props?.documentMode === 'email')
  if (!imported.length) return
  const children = document.root?.data.childrenIds || []
  if (imported.length !== 1 || children.length !== 1 || children[0] !== imported[0][0]) {
    throw new Error('A complete imported email must remain a single document. Edit its content or start a separate block-based email.')
  }
}
