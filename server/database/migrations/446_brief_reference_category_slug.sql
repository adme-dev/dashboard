-- Fix ambiguous slug lookup in the existing brief reference trigger.
-- No brief records or approval state are modified.
CREATE OR REPLACE FUNCTION public.generate_brief_reference()
RETURNS TRIGGER AS $$
DECLARE
  category_prefix VARCHAR(3);
  year_suffix VARCHAR(2);
  sequence_num INTEGER;
BEGIN
  -- Get category prefix
  SELECT UPPER(LEFT(bc.slug, 3)) INTO category_prefix
  FROM brief_categories bc
  JOIN brief_templates bt ON bc.id = bt.category_id
  WHERE bt.id = NEW.template_id;

  -- Get year suffix
  year_suffix := TO_CHAR(NOW(), 'YY');

  -- Get next sequence number for this category/year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(reference_number FROM '[0-9]+$') AS INTEGER)
  ), 0) + 1 INTO sequence_num
  FROM briefs b
  JOIN brief_templates bt ON b.template_id = bt.id
  JOIN brief_categories bc ON bt.category_id = bc.id
  WHERE UPPER(LEFT(bc.slug, 3)) = category_prefix
    AND TO_CHAR(b.created_at, 'YY') = year_suffix;

  -- Generate reference: MAR-25-0001
  NEW.reference_number := category_prefix || '-' || year_suffix || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

