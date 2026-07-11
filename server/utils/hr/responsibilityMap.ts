export type ResponsibilitySource = {
  roleVersionId: string
  roleTitle: string
  responsibility: string
  memberId: string | null
  memberName: string | null
}

type ResponsibilityOwner = {
  memberId: string
  memberName: string
  roleVersionId: string
  roleTitle: string
}

type ResponsibilityEntry = {
  responsibility: string
  classification: 'single_owner' | 'shared' | 'unowned'
  owners: ResponsibilityOwner[]
  sourceRoles: Array<{ roleVersionId: string, roleTitle: string }>
  requiresHumanConfirmation: boolean
}

function responsibilityKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-AU').replace(/[.!?]+$/g, '').replace(/\s+/g, ' ')
}

export function buildResponsibilityMap(rows: ResponsibilitySource[]) {
  const mapped = new Map<string, ResponsibilityEntry>()

  for (const row of rows) {
    const responsibility = row.responsibility.trim()
    if (!responsibility) continue
    const key = responsibilityKey(responsibility)
    const entry = mapped.get(key) || {
      responsibility,
      classification: 'unowned' as const,
      owners: [],
      sourceRoles: [],
      requiresHumanConfirmation: false,
    }

    if (!entry.sourceRoles.some(role => role.roleVersionId === row.roleVersionId)) {
      entry.sourceRoles.push({ roleVersionId: row.roleVersionId, roleTitle: row.roleTitle })
    }
    if (row.memberId && row.memberName && !entry.owners.some(owner => owner.memberId === row.memberId)) {
      entry.owners.push({
        memberId: row.memberId,
        memberName: row.memberName,
        roleVersionId: row.roleVersionId,
        roleTitle: row.roleTitle,
      })
    }
    mapped.set(key, entry)
  }

  const entries = [...mapped.values()].map((entry) => {
    entry.owners.sort((a, b) => a.memberName.localeCompare(b.memberName))
    entry.sourceRoles.sort((a, b) => a.roleTitle.localeCompare(b.roleTitle))
    entry.classification = entry.owners.length === 0 ? 'unowned' : entry.owners.length === 1 ? 'single_owner' : 'shared'
    entry.requiresHumanConfirmation = entry.classification === 'shared'
    return entry
  }).sort((a, b) => a.responsibility.localeCompare(b.responsibility))

  const groups = {
    singleOwner: entries.filter(entry => entry.classification === 'single_owner'),
    shared: entries.filter(entry => entry.classification === 'shared'),
    unowned: entries.filter(entry => entry.classification === 'unowned'),
  }

  return {
    summary: {
      total: entries.length,
      singleOwner: groups.singleOwner.length,
      shared: groups.shared.length,
      unowned: groups.unowned.length,
    },
    groups,
    limitations: [
      'Shared wording is a duplicate-ownership suggestion and requires human confirmation.',
      'Unowned means no active role assignment was found for the published role version.',
      'This map describes accountability architecture and does not evaluate individual performance.',
    ],
  }
}
