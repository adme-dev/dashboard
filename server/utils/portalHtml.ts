export function filterPortalResourceHints(head: string[]): string[] {
  return head.filter(tag => !/\brel=(["'])prefetch\1/i.test(tag))
}
