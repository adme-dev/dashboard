import { describe, expect, it, vi } from 'vitest'
import { navigateToPortalDocument } from '../../app/utils/portalAgencyAccessNavigation'

describe('agency portal access navigation', () => {
  it('starts the client portal in a fresh document context', () => {
    const assign = vi.fn()

    navigateToPortalDocument('/portal/leads?status=new', { assign })

    expect(assign).toHaveBeenCalledOnce()
    expect(assign).toHaveBeenCalledWith('/portal/leads?status=new')
  })
})
