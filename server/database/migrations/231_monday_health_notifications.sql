ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- Existing deployments contain additional notification types beyond the legacy
-- schema list. The application union is the source of truth; do not reject
-- existing rows while adding operational Monday notification types.
