-- 066: Task query performance optimization
--
-- pg_stat_statements showed the main tasks list query at 268ms mean (26 calls, ~7s total).
-- EXPLAIN ANALYZE: 133ms of 134ms was the Sort node — all 37,814 tasks sorted before LIMIT.
-- Root cause: WHERE ts.is_final = false required joining task_statuses first, then sorting.
--
-- Part 1: Partial indexes for targeted subqueries.
-- Part 2: Denormalize task_statuses.is_final onto tasks so the filter pushes down to the
--         base table scan, enabling a partial index to serve the whole query.

-- =====================================================================================
-- Part 1: Partial indexes
-- =====================================================================================

-- Tasks by department, excluding subtasks, ordered by sort_order + updated_at.
-- Covers the "list tasks for a board/department" query pattern (~70ms mean currently).
CREATE INDEX IF NOT EXISTS idx_tasks_dept_parent_null_sort
  ON tasks (department_id, sort_order, updated_at DESC)
  WHERE parent_task_id IS NULL;

-- Comment count subquery: WHERE activity_type = 'comment' GROUP BY task_id.
-- Partial index is tiny since only comment activities are indexed.
CREATE INDEX IF NOT EXISTS idx_task_activities_comment_task
  ON task_activities (task_id)
  WHERE activity_type = 'comment';

-- Subtask aggregation: COUNT + COUNT FILTER (completed_at IS NOT NULL) GROUP BY parent_task_id.
-- INCLUDE keeps completed_at in the index leaf so the FILTER doesn't touch the heap.
CREATE INDEX IF NOT EXISTS idx_tasks_parent_not_null_completed
  ON tasks (parent_task_id)
  INCLUDE (completed_at)
  WHERE parent_task_id IS NOT NULL;

-- =====================================================================================
-- Part 2: Denormalize task_statuses.is_final onto tasks
-- =====================================================================================

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status_is_final BOOLEAN NOT NULL DEFAULT false;

-- Backfill from task_statuses (fast on 37k rows).
UPDATE tasks t
SET status_is_final = ts.is_final
FROM task_statuses ts
WHERE t.status_id = ts.id
  AND t.status_is_final IS DISTINCT FROM ts.is_final;

-- Keep status_is_final in sync when a task's status_id changes or on insert.
CREATE OR REPLACE FUNCTION tasks_sync_status_is_final()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    IF NEW.status_id IS NULL THEN
      NEW.status_is_final := false;
    ELSE
      SELECT COALESCE(is_final, false) INTO NEW.status_is_final
      FROM task_statuses
      WHERE id = NEW.status_id;
      IF NEW.status_is_final IS NULL THEN
        NEW.status_is_final := false;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_sync_status_is_final ON tasks;
CREATE TRIGGER trg_tasks_sync_status_is_final
  BEFORE INSERT OR UPDATE OF status_id ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION tasks_sync_status_is_final();

-- Propagate task_statuses.is_final flips back to all affected tasks.
-- Rare event (admins reconfiguring statuses), small row churn.
CREATE OR REPLACE FUNCTION task_statuses_propagate_is_final()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_final IS DISTINCT FROM OLD.is_final THEN
    UPDATE tasks SET status_is_final = NEW.is_final WHERE status_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_statuses_propagate_is_final ON task_statuses;
CREATE TRIGGER trg_task_statuses_propagate_is_final
  AFTER UPDATE OF is_final ON task_statuses
  FOR EACH ROW
  EXECUTE FUNCTION task_statuses_propagate_is_final();

-- Partial index serving the main tasks list query.
-- WHERE status_is_final = false + ORDER BY sort_order, created_at.
-- With only 'medium' priorities currently, the CASE expression is constant, so the
-- effective sort after filter is (sort_order, created_at DESC).
CREATE INDEX IF NOT EXISTS idx_tasks_open_sort
  ON tasks (sort_order, created_at DESC)
  INCLUDE (status_id, department_id)
  WHERE status_is_final = false;
