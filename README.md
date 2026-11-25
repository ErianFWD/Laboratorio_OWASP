# SecureVault

Laboratorio académico de notas privadas: React/Vite, API Express y PostgreSQL. **Estado: prototipo en desarrollo, no listo para producción ni para evaluación final.** La investigación está en [HTML](docs/investigacion.html) y [PDF](docs/investigacion.pdf); el [estado por fases](docs/estado.md) separa pruebas locales y pendientes. Todavía no existe una URL pública verificada.

## Preparación en Windows / PowerShell

En este equipo se preparó además una instalación local aislada para comenzar rápidamente. Desde la raíz, ejecute `node .local/start-local.mjs` en una terminal y `cd frontend; npm run dev` en otra; abra `http://127.0.0.1:5173/`. La base de desarrollo queda en `.local/pg-data` y los secretos locales en `backend/.env`, ambos excluidos de Git. No borre esos archivos si desea conservar sus datos. El ayudante local requiere su URL de migración local original: no lo ejecute con una URL de Supabase, y no sustituya la URL remota sin guardar antes la configuración correcta de ambos entornos por separado. Esta preparación depende de los archivos locales de este equipo y no sustituye los pasos reproducibles siguientes para los demás integrantes. El correo de recuperación todavía no está configurado.

Se necesita Node.js 24 LTS con npm y PostgreSQL accesible. La prueba local usó Node 24.14.0; actualice a una revisión 24 LTS vigente antes del despliegue. Cree una base vacía de desarrollo sin borrar ni reutilizar datos existentes. Use un propietario de migraciones distinto del rol de la API. Estos comandos se ejecutan desde la raíz del proyecto:

```powershell
cd backend
npm ci
Copy-Item .env.example .env
# Edite .env localmente con valores propios; no lo envíe al chat ni al repositorio.
npm run migrate
```

El comando de migración carga `backend/.env` sin sobrescribir variables ya exportadas en el proceso. Para cualquier servidor remoto exige TLS con validación de certificado y nombre, incluso con `NODE_ENV=development`. `DATABASE_CA_PEM` puede indicar la ruta local del certificado CA descargado desde Supabase → Database Settings → SSL Configuration; si falta se usa el almacén de CA de Node. Si falla la validación, no la desactive. No agregue parámetros `ssl*` a la URL porque podrían sobreescribir la configuración TLS del controlador.

El administrador de la base debe crear el rol de aplicación `securevault_app` con LOGIN y contraseña por un canal privado y después ejecutar `psql` como dueño de los objetos: `psql "$env:MIGRATION_DATABASE_URL" -f db/grants.sql`. El valor de `$env:MIGRATION_DATABASE_URL` debe establecerse en esa sesión de PowerShell; el comando de Node no lo exporta a otros procesos. En el pooler compartido el usuario de conexión debe tener la forma `securevault_app.<referencia-del-proyecto>` y su propia contraseña codificada para URL; conserve host y puerto del Session pooler copiados desde Connect. El rol de migración no debe ser el de la API. Revise privilegios heredados y de `PUBLIC` antes de aplicar permisos en un proyecto compartido; `grants.sql` no elimina permisos globales preexistentes. Las migraciones llevan un registro y no reinician la base; el comando necesita permiso para crear el esquema y `public.securevault_migrations`.

En `backend/.env`, `DATABASE_URL` es la conexión del rol limitado y `MIGRATION_DATABASE_URL` la del rol de migraciones. En desarrollo use `NODE_ENV=development`, `PORT=3000` y el origen exacto `http://localhost:5173` si se usa esa dirección. `SESSION_SECRET` debe tener al menos 32 bytes; `DATA_ENCRYPTION_KEY` es una clave aleatoria de 32 bytes codificada en base64 y debe ser diferente. Genere y almacene ambos valores localmente con un gestor de secretos; no los copie al chat. `DATABASE_CA_PEM` es la ruta a la CA requerida en producción, `TRUST_PROXY_CIDRS` contiene únicamente redes de proxy verificadas, y `MAIL_API_KEY` y `MAIL_FROM` configuran el adaptador HTTPS de correo. El correo real está pendiente de comprobar.

```powershell
# Terminal 1, desde backend: carga backend/.env automáticamente
npm start

# Terminal 2, desde la raíz
cd frontend
npm ci
npm run dev
```

Abra el origen que indica Vite y ajuste `APP_ORIGIN` exactamente al mismo esquema, host y puerto. El proxy de Vite envía `/api` a `127.0.0.1:3000`. La política de contraseñas requiere 12 a 128 caracteres, mayúscula, minúscula, número y símbolo. La sesión usa inactividad de 15 minutos y un máximo absoluto de ocho horas. Cerrar sesión revoca todas las sesiones de esa cuenta. Las notas admiten hasta 10.000 caracteres y 100 por usuario.

Para promover una cuenta ya registrada, desde `backend`, con el rol de migraciones en `.env`: `node --env-file=.env scripts/promote.js correo-ficticio@example.test`. El comando revoca sesiones y registra el cambio. No existe contraseña ni endpoint administrativo predeterminado.

## Pruebas

```powershell
cd backend
npm test
cd ../frontend
npm run build
```

Sin `TEST_DATABASE_URL`, la prueba de integración se omite y solo corren las pruebas unitarias. Para integración configure esa variable con una base y **clúster desechables nuevos**: el ensayo crea esquema y un rol a nivel de clúster y no borra recursos existentes. El usuario de pruebas necesita crear ese rol. Nunca apunte a desarrollo compartido ni a producción. Los resultados locales y sus límites están en [el informe de seguridad](docs/informe-seguridad.md).

## Despliegue y recuperación

La plantilla `frontend/vercel.json.example` requiere un origen Render real y verificación antes de copiarse a `vercel.json`. La tabla de [despliegue](docs/despliegue.md) indica campos y comprobaciones. El workflow instala, prueba, audita y compila; todavía no se ejecutó en GitHub ni impide despliegues automáticos por sí mismo. Desactive el autodeploy y promueva únicamente el commit que pasó CI después de configurar la protección en los paneles.

Respalde la llave de datos en un gestor seguro separado de la base. Sin copia recuperable no se pueden descifrar notas previas. El formato actual es `v1:IV:etiqueta:cifrado`, con campos binarios base64url; la versión indica el formato, no implementa todavía un llavero multiversión. La rotación requiere implementar lectura de ambas versiones, escrituras con la nueva llave, recifrado controlado, verificación y retención de la vieja según los respaldos; **no ha sido implementada ni ensayada**. Para volver a una versión compatible, conserve migraciones y respaldo, verifique compatibilidad de esquema y llaves en una copia y promueva el commit anterior que haya pasado CI; no revierta destructivamente la base.
