CREATE SCHEMA IF NOT EXISTS securevault;
REVOKE ALL ON SCHEMA securevault FROM PUBLIC;
CREATE TABLE securevault.users (id uuid PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'usuario' CHECK (role IN ('usuario','administrador')), phone_encrypted text, session_version integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE securevault.notes (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES securevault.users(id) ON DELETE CASCADE, content_encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notes_owner_list ON securevault.notes(owner_id, updated_at DESC, id);
CREATE TABLE securevault.sessions (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX sessions_expire ON securevault.sessions(expire);
CREATE TABLE securevault.recoveries (id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES securevault.users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, consumed_at timestamptz);
CREATE INDEX recoveries_owner ON securevault.recoveries(owner_id);
CREATE TABLE securevault.security_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), event_type text NOT NULL, result text NOT NULL, user_id uuid REFERENCES securevault.users(id) ON DELETE SET NULL);
CREATE INDEX security_events_date ON securevault.security_events(created_at DESC,id DESC);
CREATE TABLE securevault.login_limits (bucket text PRIMARY KEY, failures integer NOT NULL DEFAULT 0, blocked_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON ALL TABLES IN SCHEMA securevault FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA securevault FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA securevault FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA securevault FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA securevault FROM %I', role_name);
    END IF;
  END LOOP;
END $$;
