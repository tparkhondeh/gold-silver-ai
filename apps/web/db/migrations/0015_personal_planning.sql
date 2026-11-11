BEGIN;

-- Additive document: existing rows stay NULL (unknown, never assumed zero).
-- Parent row forced RLS and version transaction cover this document too.
-- Rollback retains this column and data; do not drop it to run an older app.
ALTER TABLE user_portfolios ADD COLUMN planning jsonb;

ALTER TABLE user_portfolios ADD CONSTRAINT user_portfolios_planning_shape CHECK (
  planning IS NULL OR COALESCE(
    jsonb_typeof(planning) = 'object'
    AND planning ?& ARRAY['version', 'spendableCashToman', 'mediumTermMonths']
    AND (planning - ARRAY['version', 'spendableCashToman', 'mediumTermMonths']) = '{}'::jsonb
    AND planning->>'version' = 'asha.personal_planning.v1'
    AND (planning->'spendableCashToman' = 'null'::jsonb OR (
      jsonb_typeof(planning->'spendableCashToman') = 'string'
      AND planning->>'spendableCashToman' ~ '^(0|[1-9][0-9]{0,35})(\.[0-9]?[1-9])?$'
    ))
    AND CASE WHEN planning->'mediumTermMonths' = 'null'::jsonb THEN true
      WHEN jsonb_typeof(planning->'mediumTermMonths') = 'number'
        AND planning->>'mediumTermMonths' ~ '^[1-9][0-9]{0,4}$'
      THEN (planning->>'mediumTermMonths')::integer <= 32767 ELSE false END,
    false
  )
);

COMMIT;
