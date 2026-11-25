# Configuración externa pendiente

El proyecto Supabase tiene las migraciones aplicadas y un rol limitado. El usuario informó que el primer despliegue de Render falló por falta de `TRUST_PROXY_CIDRS`; no se ha accedido al panel de Render ni verificado un despliegue exitoso. La aplicación no está lista para producción: complete la revisión de seguridad y las pruebas pendientes de `informe-seguridad.md` antes de publicarla.

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

## Certificado CA de Supabase en Render

`DATABASE_CA_PEM` contiene una **ruta a un archivo**, no el texto del certificado. La ruta de Windows de desarrollo no existe dentro de Render. En el servicio de backend, abra **Environment → Secret Files → Add file**, elija el nombre `supabase-ca.crt` y pegue en **Contents** el contenido completo del certificado CA descargado desde Supabase, incluidos los delimitadores y los saltos de línea originales. No incluya una llave privada. Después, en **Environment Variables**, configure `DATABASE_CA_PEM` con el valor `/etc/secrets/supabase-ca.crt`, sin comillas ni saltos de línea. El nombre del archivo y la ruta deben coincidir.

El código lee el archivo y mantiene `rejectUnauthorized: true`; Node valida también el nombre del servidor. No agregue parámetros SSL a `DATABASE_URL`, pues podrían reemplazar la configuración del controlador. El certificado debe proceder del proyecto Supabase correcto. Guarde la configuración y despliegue únicamente cuando el commit haya pasado CI. Verifique `/health` después del despliegue: HTTP 200 comprueba que la API puede consultar la base; revise errores genéricos del servicio sin imprimir variables ni el archivo de secretos. Esto aún no ha sido comprobado en Render.

## Proxy, cookies e IP

En producción se configura exactamente una estrategia: `TRUST_PROXY_CIDRS` contiene direcciones IP o redes CIDR separadas por comas; `TRUST_PROXY_HOPS` contiene un número entero entre 1 y 10. No son intercambiables y definir ambas produce error. Para CIDR, Express también reconoce `loopback`, `linklocal` y `uniquelocal`; el código rechaza `true`, números de saltos, entradas vacías y redes `/0`. No usar redes ni nombres genéricos sin evidencia. Render publica un ejemplo Express con `trust proxy = 1`: `TRUST_PROXY_HOPS=1` es el candidato para **diagnóstico**, no una garantía ya comprobada para el acceso directo y el de Vercel.

Render termina HTTPS en su balanceador y reenvía HTTP al proceso. Express necesita confiar en el último proxy para interpretar `X-Forwarded-Proto` y `express-session` emita la cookie `Secure`. Confiar en un proxy implica aceptar los encabezados que este entrega: confirmar que sobrescribe o sanea los valores relevantes. La cookie es host-only y, con la reescritura, debe establecerse para el dominio Vercel. Probar atributos `Secure`, `HttpOnly`, `SameSite=Lax`, ausencia de `Domain`, login, recarga y cierre desde el navegador. No exponer un endpoint de diagnóstico en producción.

El acceso directo sigue cliente → Render → Express; la reescritura sigue cliente → Vercel → Render → Express. Una prueba local simulada demuestra que confiar solo en el proxy inmediatamente anterior puede dejar `req.ip` apuntando a Vercel, no al visitante. El límite de login y recuperación usa `req.ip`: varios usuarios podrían compartir contador y recibir 429; aceptar una cabecera falsificable permitiría evadir el límite. El ejemplo de Render con `trust proxy = 1` no demuestra la cadena real de este proyecto. Tampoco se ha comprobado que Vercel reenvíe la IP del usuario al origen de una forma autenticable cuando Render es accesible directamente. No confiar en todas las cabeceras ni fijar saltos sin validar ambas rutas.

Antes de habilitar operaciones normales, comprobar ambas rutas con dos clientes y cabeceras falsas, sin registrar cookies ni secretos. Confirmar con Render cómo se sanea `X-Forwarded-*` y qué proxies conectan al proceso. Comparar IP, protocolo y resultado del rate limit. Si no se puede demostrar la identidad de cada cliente a través de Vercel, aplicar una protección de tasa adecuada en el borde y tratar la limitación por IP de la API como pendiente, no como verificada.

### Diagnóstico temporal controlado

1. Subir el commit que contiene `frontend/vercel.json` y los cambios de backend; esperar la compilación y el despliegue de Vercel. Deshabilitar autodespliegues que se adelanten a CI.
2. En el servicio de pruebas de Render configurar `PROXY_DIAGNOSTIC=true`, `TRUST_PROXY_HOPS=1` y `PROXY_DIAGNOSTIC_TOKEN` con un token aleatorio único de al menos 32 bytes. Quitar `TRUST_PROXY_CIDRS` si está configurado. No publicar ni registrar el token. Guardar y desplegar el commit probado. Durante este modo la API no conecta a la base, `/health` responde `diagnostic`, las rutas de la aplicación devuelven 503 y no se aceptan operaciones sensibles.
3. Desde PowerShell, guardar el token en una variable local sin mostrarlo, por ejemplo `$s = Read-Host -AsSecureString 'Token de diagnóstico'` y `$token = [System.Net.NetworkCredential]::new('', $s).Password`. Luego consultar cada ruta con la cabecera `x-proxy-diagnostic-token`: `Invoke-WebRequest 'https://securevault-backend-20g0.onrender.com/api/__proxy_diag' -Headers @{'x-proxy-diagnostic-token'=$token}` y `Invoke-WebRequest 'https://laboratorio-owasp.vercel.app/api/__proxy_diag' -Headers @{'x-proxy-diagnostic-token'=$token}`. No pegar el token ni cookies en el chat. Las respuestas y los logs contienen solo las direcciones de red válidas, protocolo y campos derivados; pueden identificar IP personales, así que compartir únicamente lo necesario y con autorización.
4. Repetir desde una segunda red y con un `X-Forwarded-For` falso, comparar `peer`, `forwardedFor`, `clientIp`, `protocol`, `secure` y la cookie temporal `sv.proxycheck` (`Secure`, `HttpOnly`, `SameSite=Lax`, sin `Domain`). Esa cookie no autentica ni contiene datos de usuario. La prueba revela el comportamiento observado, pero no garantiza por sí sola que un encabezado no se pueda falsificar ni que la topología sea estable.
5. Si `clientIp` por Vercel coincide con la IP de salida de Vercel o varía de forma no confiable en vez de distinguir clientes, **no declarar verificado el límite de login por IP**. No aumentar `TRUST_PROXY_HOPS` para acceder a valores controlables por el cliente en la ruta directa. Resolver la identidad de red en un borde autenticado o usar una protección de tasa apropiada en el borde antes de habilitar operaciones. La cuenta tiene además limitación por cuenta, pero no sustituye la de red.
6. Tras validar y acordar una estrategia, poner `PROXY_DIAGNOSTIC=false`, quitar `PROXY_DIAGNOSTIC_TOKEN`, dejar solo la estrategia verificada y desplegar. Comprobar login, cookie real, recarga y logout en navegador; probar limitación con clientes ficticios. Retirar el modo de diagnóstico del código cuando ya no se necesite.

No habilitar diagnóstico como sustituto de producción: mientras esté activo, todas las operaciones normales estarán suspendidas. La ruta de diagnóstico no existe en el modo de aplicación normal.

Fuentes: https://expressjs.com/en/guide/behind-proxies/ ; https://render.com/docs/web-services ; https://render.com/articles/how-to-implement-authentication-and-authorization ; https://vercel.com/docs/headers/request-headers ; https://vercel.com/docs/routing/rewrites

## Variables del backend para Render

| KEY | Valor o requisito |
|---|---|
| `NODE_ENV` | `production`. |
| `APP_ORIGIN` | `https://laboratorio-owasp.vercel.app`, sin barra final; debe coincidir con el origen real del navegador. |
| `DATABASE_URL` | Conexión del rol limitado `securevault_app` al Session pooler; no la URL del rol de migraciones ni parámetros SSL en la cadena. |
| `SESSION_SECRET` | Secreto de firma independiente, de al menos 32 bytes. |
| `DATA_ENCRYPTION_KEY` | Clave existente de 32 bytes en Base64 canónico. Usar la clave correspondiente a los datos que deban leerse; reemplazarla sin migración hace que no se puedan descifrar. |
| `DATABASE_CA_PEM` | `/etc/secrets/supabase-ca.crt`, después de crear el Secret File descrito arriba. |
| `TRUST_PROXY_CIDRS` | Lista de IP/CIDR de proxies efectivamente verificados. **Valor pendiente**, no hay uno deducible de la información disponible. |
| `TRUST_PROXY_HOPS` | Alternativa excluyente a CIDR; `1` para la observación temporal propuesta, no validado como estrategia de producción para ambas rutas. |
| `PROXY_DIAGNOSTIC`, `PROXY_DIAGNOSTIC_TOKEN` | Solo temporalmente: `true` y un token aleatorio de al menos 32 bytes. El modo normal se activa con `false` o sin variable; borrar el token al terminar. |
| `PORT` | Render lo proporciona automáticamente; no fijarlo salvo necesidad. |
| `MAIL_API_KEY`, `MAIL_FROM` | No son obligatorios para arrancar, pero sí para la recuperación de contraseña por Resend. |

No configurar `MIGRATION_DATABASE_URL` en el servicio de la API. Las variables locales no prueban lo que hay en Render. Verificar en el panel si cada variable y archivo están configurados, sin copiar sus valores al chat ni a Git.

El frontend indicado es `https://laboratorio-owasp.vercel.app` y el backend indicado es `https://securevault-backend-20g0.onrender.com`. Una comprobación pública de `/` en Vercel devolvió HTTP 200 y `/api/auth/csrf` devolvió HTTP 404; el primer intento a `/health` de Render agotó el tiempo de espera. Se preparó `frontend/vercel.json` para reenviar `/api/:path*` al origen real, con una regla específica para `/restablecer`; aún debe subirse y desplegarse en Vercel. No presentar esto como una prueba de sesión exitosa.
