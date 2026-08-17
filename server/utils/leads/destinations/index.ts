// server/utils/leads/destinations/index.ts
// Side-effect import: each adapter file calls registerAdapter on load.
import './portal'
import './webhook'
import './slack'
import './email'
import './sheets'
import './assignUser'
import './autogate'

export {
  registeredAdapterTypes as listAdapterTypes,
  resolveAdapter as getAdapter
} from './registry'
