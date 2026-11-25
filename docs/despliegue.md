# Configuración externa pendiente

No se abrió ningún panel ni se desplegó el proyecto. No se conocen URL, certificados, credenciales ni estado de las cuentas. La aplicación no está lista para producción: complete la revisión de seguridad y las pruebas pendientes de `informe-seguridad.md` antes de publicarla.

| Plataforma | Campo | Qué completar | Cómo verificar |
|---|---|---|---|
| Supabase | Proyecto, región y plan | Base exclusiva o revisión del impacto en un proyecto compartido; confirmar repositorio y límites de cuenta. | Revisar región, plan, pausas y uso. |
| Supabase | Connect / TLS | Conexión directa o pooler de sesión IPv4; CA y validación de nombre. Roles distintos para migración y API. | Probar desde Render con certificado válido y conexión fallida con CA incorrecta; comprobar privilegios y Data API. |
| Supabase | SQL / permisos | Ejecutar migraciones una vez y `backend/db/grants.sql` con el dueño; crear rol limitado por canal privado. | Comprobar esquema no expuesto, que anon/authenticated no acceden y que el rol de API no cambia roles. No desactivar globalmente Data API sin revisar impacto. |
| Render | Web Service / raíz | `backend`, Node 24 LTS, instalación `npm ci`, arranque `npm start`, puerto asignado y `/health`. | Deploy del commit validado y GET directo a `/health`; comprobar 503 si la base no responde. |
| Render | Environment / Secret Files | Variables de `backend/.env.example`; CA en archivo secreto; origen exacto de Vercel. No cargar la URL de migración en la API. | Confirmar inicio sin imprimir valores y fallo cerrado cuando falten. Probar transporte de correo real. |
| Render | Proxy / red | Investigar cabeceras sobrescritas y redes reales en las rutas Vercel→Render y acceso directo. Configurar `TRUST_PROXY_CIDRS` solo tras verificarlas. | Contrastar IP/protocolo con clientes controlados y cabeceras manipuladas; no confiar en todas. La topología y CIDR necesarios aún son desconocidos. |
| Vercel | Proyecto / raíz / build | `frontend`, preset Vite, `npm run build`, salida `dist`; revisar que Hobby y el repositorio del equipo sean compatibles. | Confirmar despliegue, recursos y acceso del equipo. |
| Vercel | `vercel.json` | Copiar la plantilla y reemplazar el origen de Render por el HTTPS real; verificar precedencia y CSP del HTML. | `/api` llega a la API, errores API y assets no devuelven HTML; rutas SPA directas funcionan. Revisar headers públicos. |
| GitHub + paneles | CI y despliegue | Crear repositorio del equipo, ejecutar workflow, proteger rama y desactivar el autodeploy que se adelante a CI. Promover solo el commit aprobado. | Commit fallido no se publica; comprobar estado de CI y despliegue efectivo. No dar secretos de producción a PR. |
| Correo HTTPS | Remitente y API | Servicio compatible con el adaptador Resend, dominio/remitente autorizado y variables en Render. | Cuenta ficticia recibe enlace privado; una solicitud a cuenta inexistente responde igual; token no aparece en logs ni Referer. |

En plan gratuito, Render puede dormir el servicio tras 15 minutos y Supabase puede pausar proyectos con poca actividad durante una semana; comprobar su estado antes de la clase. No contratar planes ni cambiar ajustes globales por defecto. Verificar también HTTP→HTTPS, TLS 1.2/1.3, HSTS, cookie host-only y `private, no-store`, flujo de navegador, SecurityHeaders, SSL Labs y ZAP solo sobre el dominio propio.
