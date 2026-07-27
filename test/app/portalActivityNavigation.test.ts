import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const activityPage = 'app/pages/portal/activity.vue'

describe('portal recent activity navigation', () => {
  it('places Recent Activity directly after Dashboard in the sidebar', () => {
    const layout = readFileSync('app/layouts/portal.vue', 'utf8')
    const dashboardPosition = layout.indexOf(`label: 'Dashboard'`)
    const activityPosition = layout.indexOf(`label: 'Recent Activity'`)
    const jobsPosition = layout.indexOf(`label: 'Jobs'`)

    expect(activityPosition).toBeGreaterThan(dashboardPosition)
    expect(activityPosition).toBeLessThan(jobsPosition)
    expect(layout).toContain(`to: '/portal/activity'`)
    expect(layout).toContain(`icon: 'i-lucide-history'`)
  })

  it('provides a portal-authenticated activity page backed by the activity API', () => {
    expect(existsSync(activityPage)).toBe(true)
    const page = readFileSync(activityPage, 'utf8')

    expect(page).toContain(`definePageMeta({ layout: 'portal', middleware: 'portal-auth' })`)
    expect(page).toContain(`'/api/portal/activity'`)
    expect(page).toContain('Recent Activity')
    expect(page).toContain('USkeleton')
    expect(page).toContain('UAlert')
  })

  it('removes the duplicate Recent Activity card from the dashboard', () => {
    const dashboard = readFileSync('app/pages/portal/index.vue', 'utf8')

    expect(dashboard).not.toContain('<!-- Recent Activity -->')
    expect(dashboard).not.toContain('dashboard.recentActivity')
    expect(dashboard).not.toContain('function activityLabel')
    expect(dashboard).not.toContain('function activityIcon')
  })
})
