// server/utils/socialInbox/savedReplies.ts
// Pure {{variable}} templating for saved replies. No I/O.
const VAR_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

export function renderSavedReplyTemplate(content: string, vars: Record<string, string>): string {
  return (content || '').replace(VAR_RE, (_m, name: string) => (vars[name] ?? '')).trim()
}

export function extractVariables(content: string): string[] {
  const out: string[] = []
  for (const m of (content || '').matchAll(VAR_RE)) {
    const name = m[1]!
    if (!out.includes(name)) out.push(name)
  }
  return out
}
