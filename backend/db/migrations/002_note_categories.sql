-- Las referencias compuestas impiden asociar notas y categorías de distintos dueños.
-- Los nombres se guardan cifrados con el formato de backend/src/crypto.js.
ALTER TABLE securevault.notes ADD CONSTRAINT notes_id_owner_unique UNIQUE (id, owner_id);

CREATE TABLE securevault.categories (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES securevault.users(id) ON DELETE CASCADE,
  name_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, owner_id)
);
CREATE INDEX categories_owner ON securevault.categories(owner_id, created_at DESC, id);

CREATE TABLE securevault.note_categories (
  owner_id uuid NOT NULL,
  note_id uuid NOT NULL,
  category_id uuid NOT NULL,
  PRIMARY KEY (note_id, category_id),
  FOREIGN KEY (note_id, owner_id) REFERENCES securevault.notes(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (category_id, owner_id) REFERENCES securevault.categories(id, owner_id) ON DELETE CASCADE
);
CREATE INDEX note_categories_owner_category ON securevault.note_categories(owner_id, category_id, note_id);

REVOKE ALL ON securevault.categories, securevault.note_categories FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON securevault.categories, securevault.note_categories FROM %I', role_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'securevault_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON securevault.categories, securevault.note_categories TO securevault_app;
  END IF;
END $$;
