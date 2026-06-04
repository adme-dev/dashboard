export function safeAnchorId(value: unknown): string {
  if (typeof value !== 'string') return ''

  const id = value.trim()
  return /^[A-Za-z][A-Za-z0-9_:-]{0,63}$/.test(id) ? id : ''
}

export function anchorIdAttribute(props: Record<string, unknown> | null | undefined): string {
  const id = safeAnchorId(props?.anchorId)
  return id ? ` id="${id}"` : ''
}
