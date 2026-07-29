import { describe, expect, it } from 'vitest'
import { acceptEmailEnvelope } from '../../../../server/utils/leads/emailIngestion'

describe('email canonical ingress', () => {
  it('rejects an unknown reservation before canonical lead acceptance', async () => {
    await expect(acceptEmailEnvelope({} as never, 'not-a-uuid', {} as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
