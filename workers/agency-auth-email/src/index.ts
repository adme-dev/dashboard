import { AGENCY_AUTH_SENDER_ADDRESS } from '../../../server/utils/agencyAuthEmailPolicy'
import { createTransactionalEmailWorker } from '../../transactional-email/src/index'

export default createTransactionalEmailWorker(AGENCY_AUTH_SENDER_ADDRESS, 'agency-auth')
