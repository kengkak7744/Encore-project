-- Source-published address/coordinates; Google API response data is not stored here.
ALTER TABLE concerts ADD COLUMN venue_location jsonb;
ALTER TABLE concerts ADD CONSTRAINT concert_venue_location_object CHECK(venue_location IS NULL OR jsonb_typeof(venue_location)='object');

-- An admin or source move must not keep the previous venue's coordinates.
CREATE FUNCTION clear_moved_concert_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.venue IS DISTINCT FROM OLD.venue OR NEW.city IS DISTINCT FROM OLD.city OR NEW.country_code IS DISTINCT FROM OLD.country_code THEN
    NEW.venue_location := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clear_moved_concert_location BEFORE UPDATE OF venue,city,country_code ON concerts
FOR EACH ROW EXECUTE FUNCTION clear_moved_concert_location();
