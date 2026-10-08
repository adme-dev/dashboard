import { createTransactionalEmailWorker } from '../../transactional-email/src/index'

export default createTransactionalEmailWorker('notification@xeroflow.io', 'page-studio-customer-auth')
