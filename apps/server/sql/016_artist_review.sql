-- Dated evidence is separate from the editable biography and relational links.
ALTER TABLE artists ADD COLUMN IF NOT EXISTS membership_evidence jsonb;
ALTER TABLE artists ADD COLUMN IF NOT EXISTS image_review jsonb;
