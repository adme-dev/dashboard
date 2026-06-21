/**
 * Role → default skill-pack (Phase 1, media-buyer spec §3). Today personas are user-picked; the
 * co-pilot vision is role-defaulted — a media buyer should land on the Media Buyer pack without
 * choosing it. The engine resolves: explicit user choice → conversation-persisted choice →
 * THIS role default → the generalist. So this only fills the gap for a brand-new conversation
 * where the user hasn't picked; an explicit pick always wins.
 *
 * Narrows focus only — never a security boundary (the loop still intersects the pack's allowlist
 * with the user's RBAC-permitted tools). Every value must be a real persona key; the rolePersona
 * test asserts no dangling keys. Roles map to the canonical slugs in `server/utils/permissions.ts`.
 */
export const ROLE_DEFAULT_PERSONA: Record<string, string> = {
  media_buyer: 'media_buyer',
  finance: 'finance',
  accounts: 'finance',
  sales: 'sales',
  account_manager: 'account',
  producer: 'account',
  creative: 'marketing', // no dedicated creative pack yet → marketing is the closest delivery focus
}

/** The default persona key for a role, or undefined when none is mapped (→ engine uses the generalist). */
export function roleDefaultPersona(role?: string | null): string | undefined {
  if (!role) return undefined
  return ROLE_DEFAULT_PERSONA[role]
}
