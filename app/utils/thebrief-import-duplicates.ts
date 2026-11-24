import type { TheBriefPackage } from './thebrief-import'

interface ImportedProject { id: string, clientId: string | null, tags: string[] }

/** Exact export receipts reconcile a legacy manually merged parent with a ZIP set. */
export async function findTheBriefDuplicate<T extends ImportedProject>(projects: T[], clientId: string, pkg: TheBriefPackage): Promise<T | undefined> {
  const sourceTag = pkg.kind === 'xeroflow-reelmotion-import' ? 'source:reelmotion' : 'source:thebrief'
  const candidates = projects.filter(project => project.clientId === clientId && project.tags?.includes(sourceTag))
  const direct = candidates.find(project => project.tags.includes(`source-sha256:${pkg.source.sha256}`) || project.tags.includes(`source-design:${pkg.source.designHash}`)
    || (pkg.source.sizeSources?.length && pkg.source.sizeSources.every(source => project.tags.includes(`source-size:${source.designHash}`))))
  if (direct || pkg.kind !== 'xeroflow-thebrief-import' || !pkg.source.sizeSources?.length) return direct
  for (const project of candidates) {
    const parent = project.tags.find(tag => /^source-design:[\w-]{1,100}$/.test(tag))?.slice('source-design:'.length)
    if (!parent) continue
    const identity = `${[parent, ...pkg.source.sizeSources.map(source => source.sha256).sort()].join('\n')}\n`
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))), byte => byte.toString(16).padStart(2, '0')).join('')
    if (project.tags.includes(`source-sha256:${digest}`)) return project
  }
}
