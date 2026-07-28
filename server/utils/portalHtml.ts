export function filterPortalResourceHints(head: string[]): string[] {
  return head
    .map(chunk => chunk.replace(
      /<link\b[^>]*\brel\s*=\s*(["'])prefetch\1[^>]*>/gi,
      ''
    ))
    .filter(Boolean)
}
