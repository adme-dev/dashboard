import type { User } from '~~/server/utils/auth'

export function canUseVideoGenerationProject(user: Pick<User, 'id' | 'role'>, project: { createdBy?: string | null }): boolean {
  return user.role === 'admin' || user.role === 'owner' || project.createdBy === user.id
}

export function canUseTimelineStillProject(user: Pick<User, 'id' | 'role'>, project: { createdBy?: string | null }): boolean {
  return canUseVideoGenerationProject(user, project)
}

export function findTimelineStillSource(state: any, clipId: string): { r2Key: string } | null {
  for (const track of state?.tracks ?? []) {
    if (track?.kind !== 'video') continue
    for (const clip of track?.clips ?? []) {
      if (clip?.id === clipId && clip?.base_source === 'still_kenburns' && typeof clip?.r2_key === 'string') {
        return { r2Key: clip.r2_key }
      }
    }
  }
  return null
}
