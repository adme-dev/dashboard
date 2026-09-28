// Stable team identities seeded in schema-teams.sql. Display names and free-text
// job titles do not confer permissions. Production is the creative production tag.
export const QR_ACCESS_TEAM_IDS = [
  '00000000-0000-0000-0000-000000000003', // Marketing Team
  '00000000-0000-0000-0000-000000000004' // Production Team (design/creative)
] as const

export function isQrAccessTeam(id: string): boolean {
  return (QR_ACCESS_TEAM_IDS as readonly string[]).includes(id)
}
