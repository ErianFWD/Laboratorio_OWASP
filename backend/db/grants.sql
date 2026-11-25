-- Ejecutar después de la migración, con el propietario de los objetos.
-- Primero crear el rol LOGIN securevault_app por un canal privado y asignar su contraseña fuera de Git.
GRANT USAGE ON SCHEMA securevault TO securevault_app;
GRANT SELECT ON securevault.users TO securevault_app;
GRANT INSERT (id,email,name,password_hash) ON securevault.users TO securevault_app;
GRANT UPDATE (name,phone_encrypted,password_hash,session_version) ON securevault.users TO securevault_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON securevault.notes,securevault.sessions,securevault.recoveries,securevault.login_limits TO securevault_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON securevault.categories,securevault.note_categories TO securevault_app;
GRANT SELECT,INSERT ON securevault.security_events TO securevault_app;
GRANT USAGE,SELECT ON SEQUENCE securevault.security_events_id_seq TO securevault_app;
