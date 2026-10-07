-- Preserve historical checks; these providers are no longer used by Encore.
UPDATE source_state SET enabled=false WHERE category='travel' AND source_name IN ('Amadeus','12Go');
