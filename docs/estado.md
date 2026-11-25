# Estado por fases

Fecha de comprobación local: 25 de noviembre de 2026. El directorio inicial estaba vacío y no era un repositorio Git; no existe commit identificable ni URL pública conocida. No se accedió a cuentas externas.

| Fase | Archivos y comprobaciones | Pendiente |
|---|---|---|
| 0 | `investigacion.html` y `investigacion.pdf`: fuentes oficiales consultadas, PDF de cuatro páginas renderizado y revisado visualmente. | Confirmar con el docente el formato de entrega y comprobar condiciones actuales antes de contratar o publicar. |
| 1 | `diseno.md`, migración y permisos; prueba sobre PostgreSQL 17 temporal con rol de aplicación separado. | Revisar exposición y privilegios efectivos en Supabase y completar la revisión de amenazas. |
| 2 | Primera implementación de rutas y pantallas. Integración HTTP local con base desechable: registro/login, autorización, aislamiento de notas, CSRF, perfil, cuota concurrente, cierre/vencimiento absoluto, recuperación de un solo uso y dos enlaces simultáneos, límite 429, alerta y error genérico. Tres unitarias criptográficas aprobadas. | Navegador real, vencimiento por inactividad, rate limit desde clientes reales, transporte de correo real y pruebas adicionales señaladas en el informe. |
| 3 | Lockfiles, compilación local de React, workflow y plantilla de Vercel; auditorías npm sin vulnerabilidades. | Ejecutar CI en GitHub, configurar roles y TLS reales, proxy confiable, correo, reescritura, secretos, promoción condicionada y despliegue en los paneles. |
| 4 | Evidencia de pruebas y auditorías en `evidencias/`; informe y guion con límites explícitos. | Recorrido real de React en navegador, todas las comprobaciones públicas y reportes ZAP, SecurityHeaders y SSL Labs. |

La integración está en `evidencias/integracion-local.txt`, contra PostgreSQL temporal y sin correo real. Las auditorías corresponden a los lockfiles presentes, sin commit. Las plantillas y pruebas locales no demuestran seguridad en producción.

## Supabase del equipo: migración y rol

La conexión al Session pooler se verificó con TLS 1.3, cadena de confianza y nombre del servidor. Antes de migrar no se encontraron tablas de SecureVault; se aplicó `001_initial.sql` y se verificaron `securevault.users`, `notes`, `sessions`, `recoveries`, `security_events`, `login_limits` y `public.securevault_migrations`. Una segunda ejecución no aplicó cambios. `PUBLIC`, `anon` y `authenticated` no tienen USAGE sobre el esquema privado.

Se creó `securevault_app` y se aplicó `backend/db/grants.sql`. La conexión por el pooler con el rol limitado y TLS fue exitosa; se verificó que puede operar sobre notas, no puede modificar la columna de rol de usuarios y no tiene permisos sobre tablas del esquema `public`. `DATABASE_URL` quedó configurada con ese rol; se preservó una copia local de la configuración anterior, excluida por `.gitignore`. La base local anterior no se borró. Un arranque breve de la API devolvió `/health` 200 con la base disponible. Esto no demuestra el despliegue en Render/Vercel ni sustituye pruebas completas de la aplicación.

La migración `002_note_categories.sql` se probó en PostgreSQL desechable y se aplicó a Supabase. Se verificaron las tablas `categories` y `note_categories`, sus dos claves foráneas, permisos del rol de aplicación y ausencia de SELECT para `anon` y `authenticated`. La prueba local rechazó relaciones entre dueños distintos. Pendiente: implementar y probar rutas y pantallas antes de poder usar categorías desde la aplicación.
